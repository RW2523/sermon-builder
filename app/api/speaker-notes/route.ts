import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, MODELS } from '@/lib/gemini'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { draftId, sermonHtml, title, scriptureRef, theme } = await req.json()
  if (!sermonHtml || !draftId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

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

  const notes = await generateText(prompt, MODELS.flash)

  const { data: updated, error } = await supabase
    .from('sermon_drafts')
    .update({ speaker_notes: notes })
    .eq('id', draftId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notes, draft: updated })
}
