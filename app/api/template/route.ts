import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, MODELS } from '@/lib/gemini'

export const maxDuration = 60

const TEMPLATE_INSTRUCTIONS: Record<string, string> = {
  prayer: `Restructure this content as a Prayer-focused message. Include:
- Opening prayer/invocation
- Scripture-based petitions  
- Intercession points for the congregation
- Thanksgiving and praise sections
- Closing benediction prayer
Use flowing, reverent language suitable for communal prayer.`,

  message: `Structure this as a classic Sunday Message with:
- Engaging opening illustration or question
- Scripture passage introduction
- 3 main points with sub-points
- Real-life application for each point
- Stories or illustrations
- Memorable closing with a clear call to action`,

  story: `Reshape this into a Story-Driven sermon with:
- A captivating opening narrative
- Biblical story or character study as the central thread
- Personal application woven throughout
- Emotional connection points
- Resolution and spiritual takeaway
Use narrative, storytelling language.`,

  devotional: `Convert this into a Daily Devotional format with:
- Opening verse (key scripture)
- Brief reflection (2-3 paragraphs)
- Personal application challenge
- Prayer response
- Closing thought/quote
Keep it concise, intimate, and personally applicable.`,

  teaching: `Format this as a Bible Teaching with:
- Introduction and learning objectives
- Context and background of Scripture
- Verse-by-verse or thematic exposition
- Greek/Hebrew word studies where applicable
- Theological insights
- Practical application points
- Study questions for small groups
Use clear, instructional language.`,

  custom: `Polish and enhance this content while maintaining its current structure. Improve flow, language, and impact.`,
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sermonId, draftId, currentHtml, templateType } = await req.json()
  if (!sermonId || !currentHtml || !templateType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const instructions = TEMPLATE_INSTRUCTIONS[templateType] ?? TEMPLATE_INSTRUCTIONS.custom

  const prompt = `You are an expert sermon writer. Reformat the following sermon content into the specified template format.

Template: ${templateType.toUpperCase()}

Instructions:
${instructions}

Current Sermon Content (HTML):
${currentHtml}

Return ONLY valid HTML content (use h2, h3, p, ul, li, blockquote, strong) that follows the template structure. No markdown, no code fences.`

  const html = await generateText(prompt, MODELS.flash)

  // Update the existing draft or create a new version
  let data, error
  if (draftId) {
    const result = await supabase
      .from('sermon_drafts')
      .update({ polished_html: html, template_type: templateType })
      .eq('id', draftId)
      .select()
      .single()
    data = result.data; error = result.error
  } else {
    const { data: existing } = await supabase
      .from('sermon_drafts')
      .select('version')
      .eq('sermon_id', sermonId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const result = await supabase
      .from('sermon_drafts')
      .insert({ sermon_id: sermonId, polished_html: html, template_type: templateType, version: (existing?.version ?? 0) + 1 })
      .select()
      .single()
    data = result.data; error = result.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ draft: data })
}
