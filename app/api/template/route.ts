import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, parseModelJson, MODELS } from '@/lib/gemini'
import { userOwnsSermon, getOwnedDraft, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { normalizeStructured, structuredToHtml, structuredToPlainText } from '@/lib/sermon/structured'
import { TEMPLATE_STRUCTURES, structureOutline } from '@/lib/sermon/templateStructures'
import type { StructuredSermon, TemplateType } from '@/types'

export const maxDuration = 60

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
  const tpl = (templateType as TemplateType) in TEMPLATE_STRUCTURES ? (templateType as TemplateType) : 'custom'
  const structure = TEMPLATE_STRUCTURES[tpl]
  const outline = structureOutline(tpl)

  // Pull the ORIGINAL raw inputs so the reformat can recover anything the first
  // polish pass may have trimmed — the goal is that no source content is lost.
  const { data: inputs } = await supabase
    .from('sermon_inputs')
    .select('kind, raw_text, transcription')
    .eq('sermon_id', sermonId)
    .order('created_at', { ascending: true })
  const rawSource = (inputs ?? [])
    .map((inp, i) => `[Source ${i + 1} · ${inp.kind}]\n${(inp.transcription ?? inp.raw_text ?? '').trim()}`)
    .filter((s) => s.replace(/\[Source.*\]\n/, '').trim())
    .join('\n\n---\n\n')
    .slice(0, 9000)

  const prompt = `You are an expert sermon architect. Reorganize a sermon into the "${structure.label}" format.

${structure.label} — ${structure.summary}
This format's required sections (use these as the main points, in this order):
${outline}

Tone/voice: ${tone}
Language: write everything in ${language}

CRITICAL — LOSE NOTHING: The SOURCE MATERIAL below is the pastor's original content. Map EVERY substantive idea, scripture, illustration, statistic, and point from the source into the most fitting section above. Do not discard or summarize away any meaningful content — redistribute it. If a piece of content fits no listed section, place it in the nearest one rather than dropping it. You may expand and rephrase, but every source idea must survive somewhere in the output.

SOURCE MATERIAL (original raw content):
${rawSource || '(no raw inputs on file — use the current sermon below as the source)'}

CURRENT SERMON (already-polished draft, for reference and continuity):
${structuredToPlainText(current)}

Return ONLY a valid JSON object (no fences, no commentary) with this exact shape, where "main_points" are the format's sections above (heading = section name) filled with the mapped content:
{
  "title": "...",
  "theme": "one-sentence theme",
  "scripture": "Key passage(s) WITH the verse text",
  "introduction": "the opening section's content (2-4 paragraphs)",
  "main_points": [ { "heading": "<exact section name>", "body": "4-6 sentences of mapped content for this section", "scripture": "supporting verse (optional)" } ],
  "applications": ["concrete action points drawn from the content"],
  "conclusion": "the closing section's content",
  "prayer": "a fitting closing prayer"
}
Include one main_points entry per format section that carries teaching content (the opening section may instead populate "introduction", the closing section "conclusion"/"prayer"). Everything in ${language}.`

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
    // Clear the slide plan — it was designed for the previous structure and
    // must be regenerated to reflect the new format's sections.
    .update({ structured: next, polished_html: structuredToHtml(next), template_type: templateType, slide_plan: null })
    .eq('id', draftId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ draft })
}
