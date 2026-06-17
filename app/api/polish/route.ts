import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, parseModelJson, MODELS } from '@/lib/gemini'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { normalizeStructured, structuredToHtml } from '@/lib/sermon/structured'

export const maxDuration = 60

const STYLE_HINTS: Record<string, string> = {
  message: 'a classic expository Sunday message with a hook, 3 main points, and a call to action',
  prayer: 'a prayer-focused message with invocation, scripture-based petitions, and a benediction',
  story: 'a story-driven narrative sermon built around a biblical character or scene',
  devotional: 'a concise, intimate daily devotional under 600 words',
  teaching: 'an in-depth Bible teaching with context, exposition, and discussion-ready points',
  testimony: 'a testimony-style message: the struggle, the turning point, the transformation',
  youth: 'a high-energy youth message with relatable, contemporary illustrations',
  small_group: 'a small-group discussion guide with reflective questions',
  storytelling: 'a vivid storytelling sermon written to be spoken aloud',
  custom: 'a well-structured sermon faithful to the source content',
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many requests — please try again later' }, { status: 429 })
  }

  const {
    sermonId, inputs, title, scriptureRef, theme,
    tone = 'Inspirational', language = 'English', style = 'message',
  } = await req.json()
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

  const styleHint = STYLE_HINTS[style] ?? STYLE_HINTS.message

  const prompt = `You are an experienced, Spirit-filled pastor and theologian. Craft ${styleHint}.

Sermon parameters:
- Working title: ${title || 'Untitled Sermon'}
- Scripture focus: ${scriptureRef || 'choose fitting passages from the source'}
- Theme: ${theme || 'derive from the source'}
- Tone/voice: ${tone}
- Language: write the ENTIRE sermon in ${language}

Source material from the pastor:
${rawContent}

Return ONLY a valid JSON object (no markdown fences, no commentary) with EXACTLY this shape:
{
  "title": "Compelling sermon title",
  "theme": "One-sentence theme",
  "scripture": "Key passage reference(s) WITH the verse text",
  "introduction": "3-4 engaging paragraphs separated by blank lines",
  "main_points": [
    { "heading": "Point heading", "body": "4-5 sentences with scripture, illustration, and application", "scripture": "supporting verse reference (optional)" }
  ],
  "applications": ["At least 5 specific, practical action points the congregation can apply this week"],
  "conclusion": "A powerful 3-4 sentence closing with a clear call to action",
  "prayer": "A heartfelt 3-4 sentence closing prayer"
}

Requirements: 3-5 main points, each body 4-5 sentences. At least 5 applications. Reference at least 5 specific Bible verses across the sermon. Reflect the ${tone} tone throughout. Everything in ${language}.`

  let raw: string
  try {
    raw = await generateText(prompt, MODELS.flash)
  } catch (err) {
    console.error('Polish generation failed:', err)
    return NextResponse.json({ error: 'Generation failed — please try again' }, { status: 502 })
  }

  let structured
  try {
    structured = normalizeStructured(parseModelJson(raw), title || 'Untitled Sermon')
  } catch (err) {
    console.error('Polish JSON parse failed:', err)
    return NextResponse.json({ error: 'The draft came back in an unexpected format — please try again' }, { status: 502 })
  }
  if (!structured.introduction && structured.main_points.length === 0) {
    return NextResponse.json({ error: 'The draft came back empty — please try again' }, { status: 502 })
  }

  const polished_html = structuredToHtml(structured)

  const { data: existing } = await supabase
    .from('sermon_drafts')
    .select('id, version')
    .eq('sermon_id', sermonId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: draft, error } = await supabase
    .from('sermon_drafts')
    .insert({
      sermon_id: sermonId,
      structured,
      polished_html,
      template_type: style,
      version: (existing?.version ?? 0) + 1,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Persist generation settings and propagate derived metadata to the sermon
  await supabase.from('sermons').update({
    status: 'polished',
    tone,
    language,
    title: structured.title || title || 'Untitled Sermon',
    scripture_ref: scriptureRef || structured.scripture || null,
    theme: theme || structured.theme || null,
  }).eq('id', sermonId)

  return NextResponse.json({ draft })
}
