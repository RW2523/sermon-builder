import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { buildSlidePlan } from '@/lib/slides/planner'
import { generateImageBase64 } from '@/lib/gemini'
import { uploadSermonImage } from '@/lib/api/storage'
import { normalizeStructured } from '@/lib/sermon/structured'
import type { StructuredSermon } from '@/types'

export const maxDuration = 120

const SCENE_BUDGET = 8 // cap distinct AI images per deck (time + cost)
const STYLE_SUFFIX = 'Cinematic, reverent Christian fine-art illustration; dramatic light, painterly depth, museum quality. No text, no letters, no words.'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many requests — please try again later' }, { status: 429 })
  }

  const { sermonId, themeId = 'navy_gold', targetSlideCount } = await req.json()
  if (!sermonId) return NextResponse.json({ error: 'Missing sermonId' }, { status: 400 })
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }

  const { data: draft } = await supabase
    .from('sermon_drafts')
    .select('id, structured')
    .eq('sermon_id', sermonId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!draft?.structured) {
    return NextResponse.json({ error: 'Generate the sermon draft first (Stage 2)' }, { status: 400 })
  }

  const structured = normalizeStructured(draft.structured as StructuredSermon, 'Untitled Sermon')
  const plan = await buildSlidePlan(structured, { themeId, targetSlideCount })

  // Generate a relevant, distinct image for each slide that calls for a scene
  // (cover/divider backgrounds AND figure/showcase content images), in
  // parallel up to a budget, so the deck has bespoke imagery throughout.
  const sceneSlides = plan.slides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.visual?.type === 'scene')
    .slice(0, SCENE_BUDGET)

  if (sceneSlides.length) {
    const admin = await createAdminClient()
    await Promise.allSettled(
      sceneSlides.map(async ({ s, i }) => {
        const base = (s.visual.prompt || s.visual.spec || s.heading || structured.theme).trim()
        const prompt = /no text|no letters|no words/i.test(base) ? base : `${base}. ${STYLE_SUFFIX}`
        const b64 = await generateImageBase64(prompt, !!s.visual.highQuality)
        const { publicUrl } = await uploadSermonImage(admin, user.id, sermonId, 'scene', b64, i)
        plan.slides[i].visual.imageUrl = publicUrl
      })
    )
  }

  await supabase.from('sermon_drafts').update({ slide_plan: plan }).eq('id', draft.id)

  const withImages = plan.slides.filter((s) => s.visual?.imageUrl).length
  return NextResponse.json({ plan, scenesGenerated: withImages })
}
