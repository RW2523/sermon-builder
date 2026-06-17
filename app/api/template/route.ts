import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, parseModelJson, MODELS } from '@/lib/gemini'
import { userOwnsSermon, getOwnedDraft, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { normalizeStructured, structuredToHtml, structuredToPlainText } from '@/lib/sermon/structured'
import type { StructuredSermon } from '@/types'

export const maxDuration = 60

const STYLE_INSTRUCTIONS: Record<string, string> = {
  prayer: 'Reframe as a prayer-focused message: invocation, scripture-based petitions by theme, thanksgiving, and a closing benediction.',
  message: 'Reshape into a classic Sunday message: a strong hook, scripture in context, 3 clear main points each with illustration and application, and a memorable call to action.',
  story: 'Rebuild as a story-driven narrative sermon around a biblical character or scene, weaving ancient and modern contexts with rising tension and resolution.',
  devotional: 'Condense into an intimate daily devotional under 600 words: a key verse, a warm reflection, one application, and a guided prayer.',
  teaching: 'Format as an in-depth Bible teaching: learning objectives, historical/cultural context, verse-by-verse exposition, cross-references, and discussion questions.',
  testimony: 'Transform into a testimony-style message: the before/struggle, the turning point, the after/transformation, with scripture that validates the journey.',
  youth: 'Reformat as a high-energy youth message: a culturally relevant opening, short punchy points, relatable modern illustrations, and an action challenge.',
  small_group: 'Convert into a small-group discussion guide: icebreaker, passages to read, teaching context, 5-7 discussion questions, and a prayer focus.',
  storytelling: 'Reformat as a vivid storytelling sermon written to be spoken aloud, with sensory language and a closing that returns to the opening image.',
  custom: 'Polish and strengthen the sermon while preserving its current structure: clearer transitions, sharper language, stronger scripture integration.',
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many requests — please try again later' }, { status: 429 })
  }

  const { sermonId, draftId, structured, templateType, tone = 'Inspirational', language = 'English' } = await req.json()
  if (!sermonId || !draftId || !structured || !templateType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }
  const owned = await getOwnedDraft(supabase, draftId)
  if (!owned || owned.sermon_id !== sermonId) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const current = normalizeStructured(structured)
  const instruction = STYLE_INSTRUCTIONS[templateType] ?? STYLE_INSTRUCTIONS.custom

  const prompt = `You are an expert sermon editor. Reformat the following sermon into a new style while preserving its scripture, substance, and key insights.

Target style: ${instruction}
Tone/voice: ${tone}
Language: write everything in ${language}

Current sermon:
${structuredToPlainText(current)}

Return ONLY a valid JSON object (no fences, no commentary) with this exact shape:
{
  "title": "...",
  "theme": "...",
  "scripture": "Key passage(s) with text",
  "introduction": "...",
  "main_points": [ { "heading": "...", "body": "...", "scripture": "optional" } ],
  "applications": ["..."],
  "conclusion": "...",
  "prayer": "..."
}`

  let raw: string
  try {
    raw = await generateText(prompt, MODELS.flash)
  } catch (err) {
    console.error('Template generation failed:', err)
    return NextResponse.json({ error: 'Generation failed — please try again' }, { status: 502 })
  }

  let next: StructuredSermon
  try {
    next = normalizeStructured(parseModelJson(raw), current.title)
  } catch (err) {
    console.error('Template JSON parse failed:', err)
    return NextResponse.json({ error: 'The result came back in an unexpected format — please try again' }, { status: 502 })
  }

  const { data: draft, error } = await supabase
    .from('sermon_drafts')
    .update({ structured: next, polished_html: structuredToHtml(next), template_type: templateType })
    .eq('id', draftId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ draft })
}
