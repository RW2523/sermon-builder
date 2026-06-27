import { NextResponse } from 'next/server'
import { parseJsonBody, badRequest } from '@/lib/api/http'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { buildSlidePlan } from '@/lib/slides/planner'
import { generateImageBase64 } from '@/lib/gemini'
import { uploadSermonImage } from '@/lib/api/storage'
import { normalizeStructured } from '@/lib/sermon/structured'
import type { StructuredSermon } from '@/types'
import type { SlidePlan } from '@/types/slides'

export const maxDuration = 120

const SCENE_BUDGET = 8 // cap distinct AI images per deck (time + cost)
const STYLE_SUFFIX = 'Cinematic, reverent Christian fine-art illustration; dramatic light, painterly depth, museum quality. No text, no letters, no words.'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs))) {
    return NextResponse.json({ error: 'Too many requests — please try again later' }, { status: 429 })
  }

  const body = await parseJsonBody<{ sermonId?: string; themeId?: string; targetSlideCount?: number }>(req)
  if (!body) return badRequest()
  const { sermonId, themeId = 'navy_gold', targetSlideCount } = body
  if (!sermonId) return NextResponse.json({ error: 'Missing sermonId' }, { status: 400 })
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }

  const { data: draft } = await supabase
    .from('sermon_drafts')
    .select('id, structured, slide_plan')
    .eq('sermon_id', sermonId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!draft?.structured) {
    return NextResponse.json({ error: 'Generate the sermon draft first (Stage 2)' }, { status: 400 })
  }

  const structured = normalizeStructured(draft.structured as StructuredSermon, 'Untitled Sermon')
  const plan = await buildSlidePlan(structured, { themeId, targetSlideCount })

  // Reuse images already generated for the same scene subject in a prior plan
  // (the dominant cost: a redesign should not re-pay for identical imagery).
  const sceneKey = (s: { visual?: { spec?: string }; heading?: string }) =>
    (s.visual?.spec || s.heading || '').toLowerCase().trim()
  const priorPlan = draft.slide_plan as SlidePlan | null
  const reuse = new Map<string, string>()
  for (const s of priorPlan?.slides ?? []) {
    if (s.visual?.type === 'scene' && s.visual.imageUrl) {
      const k = sceneKey(s)
      if (k && !reuse.has(k)) reuse.set(k, s.visual.imageUrl)
    }
  }

  // Generate a relevant, distinct image for each scene slide that doesn't
  // already have a reusable one, in parallel up to a budget.
  const sceneSlides = plan.slides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.visual?.type === 'scene')
    .slice(0, SCENE_BUDGET)

  let reused = 0
  const toGenerate: typeof sceneSlides = []
  for (const entry of sceneSlides) {
    const k = sceneKey(entry.s)
    const cached = k ? reuse.get(k) : undefined
    if (cached) {
      plan.slides[entry.i].visual.imageUrl = cached
      reused++
    } else {
      toGenerate.push(entry)
    }
  }

  let failed = 0
  if (toGenerate.length) {
    const admin = await createAdminClient()
    const settled = await Promise.allSettled(
      toGenerate.map(async ({ s, i }) => {
        const base = (s.visual.prompt || s.visual.spec || s.heading || structured.theme).trim()
        const prompt = /no text|no letters|no words/i.test(base) ? base : `${base}. ${STYLE_SUFFIX}`
        const b64 = await generateImageBase64(prompt, !!s.visual.highQuality)
        const { publicUrl } = await uploadSermonImage(admin, user.id, sermonId, 'scene', b64, i)
        plan.slides[i].visual.imageUrl = publicUrl
      })
    )
    failed = settled.filter((r) => r.status === 'rejected').length
  }

  const { error: saveError } = await supabase
    .from('sermon_drafts')
    .update({ slide_plan: plan })
    .eq('id', draft.id)
  if (saveError) {
    console.error('Failed to persist slide_plan:', saveError)
    return NextResponse.json({ error: 'Could not save the deck plan — please try again' }, { status: 500 })
  }

  const withImages = plan.slides.filter((s) => s.visual?.imageUrl).length
  return NextResponse.json({
    plan,
    scenesGenerated: withImages,
    scenesReused: reused,
    scenesRequested: sceneSlides.length,
    scenesFailed: failed,
  })
}
