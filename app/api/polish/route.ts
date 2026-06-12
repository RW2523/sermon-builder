import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, MODELS } from '@/lib/gemini'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many AI requests — please try again later' }, { status: 429 })
  }

  const { sermonId, inputs, title, scriptureRef, theme } = await req.json()
  if (!sermonId || !inputs?.length) {
    return NextResponse.json({ error: 'Missing sermonId or inputs' }, { status: 400 })
  }
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }

  const rawContent = inputs
    .map((inp: { kind: string; raw_text?: string; transcription?: string }, i: number) =>
      `[Source ${i + 1} - ${inp.kind}]:\n${inp.transcription ?? inp.raw_text ?? ''}`
    )
    .join('\n\n---\n\n')

  const prompt = `You are an expert sermon writer and editor. Transform the following raw content into a powerful, well-structured sermon draft in HTML format.

Sermon Details:
- Title: ${title || 'Untitled Sermon'}
- Scripture Reference: ${scriptureRef || 'Not specified'}
- Theme: ${theme || 'Not specified'}

Raw Content:
${rawContent}

Instructions:
1. Structure the sermon with: Opening/Hook, Scripture Introduction, Main Points (3-5), Illustrations/Stories, Application, and a Powerful Closing/Call to Action.
2. Return valid HTML (use h2, h3, p, ul, li, blockquote for scripture, strong for emphasis).
3. Make the language passionate, clear, and spiritually impactful.
4. Preserve key Scripture references and theological insights from the raw content.
5. Add transition phrases between sections.
6. Return ONLY the HTML content, no markdown code fences or extra text.`

  let html: string
  try {
    html = await generateText(prompt, MODELS.flash)
  } catch (err) {
    console.error('Polish generation failed:', err)
    return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 502 })
  }

  // Upsert draft
  const { data: existing } = await supabase
    .from('sermon_drafts')
    .select('id, version')
    .eq('sermon_id', sermonId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const newVersion = (existing?.version ?? 0) + 1

  const { data: draft, error } = await supabase
    .from('sermon_drafts')
    .insert({ sermon_id: sermonId, polished_html: html, version: newVersion })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update sermon status
  await supabase.from('sermons').update({ status: 'polished' }).eq('id', sermonId)

  return NextResponse.json({ draft })
}
