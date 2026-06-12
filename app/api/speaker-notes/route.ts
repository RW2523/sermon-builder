import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, MODELS } from '@/lib/gemini'
import { getOwnedDraft, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many AI requests — please try again later' }, { status: 429 })
  }

  const { draftId, sermonHtml, title, scriptureRef, theme } = await req.json()
  if (!sermonHtml || !draftId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!(await getOwnedDraft(supabase, draftId))) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const bodyText = sermonHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  const prompt = `You are an expert sermon coach. Generate concise, practical speaker notes for a pastor delivering this sermon.

Sermon:
- Title: ${title ?? ''}
- Scripture: ${scriptureRef ?? ''}
- Theme: ${theme ?? ''}
- Content: ${bodyText.slice(0, 2000)}

Write speaker notes in plain text that include:
1. OPENING (30-60 seconds): How to open strongly — story hook, prayer, or engaging question
2. KEY TRANSITIONS: Natural verbal bridges between main points (e.g. "Now let me show you...")
3. DELIVERY TIPS: Pacing notes, when to pause, emphasis points, when to slow down
4. ILLUSTRATION CUES: Where to insert personal stories or illustrative examples
5. ALTAR CALL / CLOSING: How to end with a clear invitation or challenge
6. TIME CHECK: Rough time allocation per section

Keep notes practical, conversational, and pastor-friendly. Write in second person ("You should...", "Pause here...").`

  let notes: string
  try {
    notes = await generateText(prompt, MODELS.flash)
  } catch (err) {
    console.error('Speaker notes generation failed:', err)
    return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 502 })
  }

  const { data: updated, error } = await supabase
    .from('sermon_drafts')
    .update({ speaker_notes: notes })
    .eq('id', draftId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes, draft: updated })
}
