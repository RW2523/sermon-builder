import { NextResponse } from 'next/server'
import { parseJsonBody, badRequest } from '@/lib/api/http'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { generateImageBase64 } from '@/lib/gemini'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { uploadSermonImage } from '@/lib/api/storage'
import type { StructuredSermon } from '@/types'

export const maxDuration = 120

const CINEMATIC =
  'Masterful cinematic Christian fine-art illustration in the style of a classical oil painting. Dramatic chiaroscuro lighting with golden-hour rim light, volumetric god rays, deep navy-and-gold color grading, rich painterly texture, epic composition with strong foreground depth, museum quality. No text, no words, no lettering.'

interface PlannedImage { kind: string; prompt: string; caption: string }

function planPrompts(s: StructuredSermon, max: number): PlannedImage[] {
  const theme = s.theme || s.title
  const plan: PlannedImage[] = []
  // 1. Title / theme establishing scene
  plan.push({ kind: 'image', caption: s.title, prompt: `A sweeping establishing scene that captures the heart of a sermon titled "${s.title}". Theme: ${theme}. ${CINEMATIC}` })
  // 2. Scripture scene
  if (s.scripture) {
    plan.push({ kind: 'scripture_slide', caption: s.scripture.split('\n')[0].slice(0, 80), prompt: `A reverent biblical scene evoking this passage: ${s.scripture.slice(0, 220)}. ${CINEMATIC}` })
  }
  // 3..N one scene per main point
  for (const pt of s.main_points) {
    plan.push({ kind: 'image', caption: pt.heading, prompt: `A vivid biblical scene illustrating the message "${pt.heading}": ${pt.body.slice(0, 180)}. ${CINEMATIC}` })
  }
  return plan.slice(0, max)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs))) {
    return NextResponse.json({ error: 'Too many requests — please try again later' }, { status: 429 })
  }

  const body = await parseJsonBody<{ sermonId?: string; count?: number; highQuality?: boolean }>(req)
  if (!body) return badRequest()
  const { sermonId, count = 6, highQuality = false } = body
  if (!sermonId) return NextResponse.json({ error: 'Missing sermonId' }, { status: 400 })
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }

  const { data: draft } = await supabase
    .from('sermon_drafts')
    .select('structured')
    .eq('sermon_id', sermonId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const structured = draft?.structured as StructuredSermon | undefined
  if (!structured) {
    return NextResponse.json({ error: 'Generate the sermon draft first (Stage 2)' }, { status: 400 })
  }

  const plan = planPrompts(structured, Math.max(2, Math.min(8, count)))
  const admin = await createAdminClient()

  // Generate + upload every planned image in parallel; tolerate partial failure.
  const results = await Promise.allSettled(
    plan.map(async (p, i) => {
      const base64 = await generateImageBase64(p.prompt, highQuality)
      const { storagePath, publicUrl } = await uploadSermonImage(admin, user.id, sermonId, p.kind, base64, i)
      return { ...p, storagePath, publicUrl, seq: i }
    })
  )
  const ok = results
    .filter((r): r is PromiseFulfilledResult<PlannedImage & { storagePath: string; publicUrl: string; seq: number }> => r.status === 'fulfilled')
    .map((r) => r.value)

  if (ok.length === 0) {
    return NextResponse.json({ error: 'Could not generate the visual set — please try again' }, { status: 502 })
  }

  // Append after any existing media so order is stable.
  const { data: existing } = await supabase
    .from('sermon_media')
    .select('order_index')
    .eq('sermon_id', sermonId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()
  const base = (existing?.order_index ?? -1) + 1

  const rows = ok
    .sort((a, b) => a.seq - b.seq)
    .map((r, i) => ({
      sermon_id: sermonId,
      kind: r.kind,
      prompt: r.prompt,
      caption: r.caption,
      storage_path: r.storagePath,
      public_url: r.publicUrl,
      order_index: base + i,
    }))

  const { data: media, error } = await supabase.from('sermon_media').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ media, generated: ok.length, requested: plan.length })
}
