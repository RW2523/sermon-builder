import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { buildSlidePlan } from '@/lib/slides/planner'
import { normalizeStructured } from '@/lib/sermon/structured'
import type { StructuredSermon } from '@/types'

export const maxDuration = 60

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

  await supabase.from('sermon_drafts').update({ slide_plan: plan }).eq('id', draft.id)

  return NextResponse.json({ plan })
}
