import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, MODELS } from '@/lib/gemini'

export const maxDuration = 60

const TEMPLATE_INSTRUCTIONS: Record<string, string> = {
  prayer: `Restructure this content as a Prayer-Focused message. Include:
- Opening prayer/invocation with scriptural grounding
- Scripture-based petitions for the congregation
- Intercession points organized by topic (personal, family, church, nation)
- Sections of thanksgiving and praise
- Reflective scripture meditation
- Closing benediction prayer
Use flowing, reverent, and intimate language suitable for communal prayer.`,

  message: `Structure this as a classic Sunday Message with:
- A hook: engaging opening illustration, story, or provocative question
- Scripture introduction with historical/cultural context
- 3 clear main points, each with a sub-point and real-life application
- Transition phrases connecting each section
- One strong illustration or modern analogy per point
- Memorable, quotable closing statement
- Clear call to action for the congregation`,

  story: `Reshape this into a Story-Driven Narrative Sermon with:
- A captivating opening story or scene that creates emotional engagement
- A biblical character or story as the central narrative thread
- Parallel storyline connecting ancient and modern contexts
- Emotional connection points that draw the listener in
- Rising tension and resolution mirroring the Gospel
- Personal application woven naturally throughout
- A powerful, story-closing spiritual takeaway
Use narrative, descriptive, conversational language.`,

  devotional: `Convert this into a Daily Devotional format with:
- A compelling opening verse displayed prominently
- Brief, warm devotional reflection (2-3 paragraphs maximum)
- One personal application challenge or question
- A guided prayer response
- A closing thought, quote, or additional scripture
Keep it concise (under 500 words), intimate, and personally applicable.`,

  teaching: `Format this as an In-Depth Bible Teaching with:
- Introduction with clear learning objectives
- Historical, cultural, and literary context of the scripture
- Verse-by-verse or thematic expository breakdown
- Original language (Greek/Hebrew) word insights where applicable
- Theological connections and cross-references
- Practical application points clearly labeled
- Discussion questions for small groups or personal reflection
- Summary and key takeaways
Use clear, instructional, scholarly-yet-accessible language.`,

  testimony: `Transform this into a Testimony-Style Message with:
- Opening: the "before" — setting the scene of need or struggle
- The turning point: how God intervened or the scripture spoke
- The "after": the transformation, healing, or revelation received
- Biblical backing: scriptures that validate the experience
- Universal application: how this testimony applies to everyone listening
- An invitation: encouraging others to trust God in their own journey
Use personal, vulnerable, emotionally honest language.`,

  youth: `Reformat this as a Youth-Focused Message with:
- A high-energy, culturally relevant opening (pop culture reference, current event, or challenge)
- Clear, simple language (avoid heavy theological jargon)
- Short, punchy points — 2-3 maximum
- Relatable modern illustrations (social media, school, sports, relationships)
- Interactive engagement prompts ("Has anyone ever felt...?")
- A challenge or dare for the week
- A clear, action-oriented closing that inspires change
Use energetic, authentic, youth-culture-aware language.`,

  small_group: `Convert this into a Small Group Discussion Guide with:
- Session title and opening icebreaker question
- Key scripture passage(s) to read together
- Brief teaching context (3-5 minutes of reading material for the leader)
- 5-7 discussion questions (mix of observation, interpretation, and application)
- A practical challenge or homework assignment
- Group prayer focus points
- Optional: resource recommendations for deeper study
Format with clear headers so a group leader can facilitate easily.`,

  storytelling: `Reformat as a Storytelling-Format Sermon with:
- A gripping opening story hook (first 90 seconds must captivate)
- Interwoven biblical narrative and contemporary story running in parallel
- Sensory, descriptive language that creates vivid mental imagery
- Character development showing spiritual growth or transformation
- Story beats: setup, conflict, climax, resolution, application
- Repeated narrative motifs or imagery that reinforces the main theme
- A closing that returns to the opening story for satisfying resolution
Write it as a script that flows naturally when spoken aloud.`,

  custom: `Polish and enhance this content while maintaining its current structure. Improve:
- Grammar, clarity, and sentence flow
- Transitions between sections
- Language power and impact
- Scripture integration
- Closing strength and call to action`,
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

  const prompt = `You are an expert sermon writer and ministry communication specialist. Reformat the following sermon content into the specified template format.

Template: ${templateType.toUpperCase().replace('_', ' ')}

Instructions:
${instructions}

Current Sermon Content (HTML):
${currentHtml}

Return ONLY valid HTML content using these elements: h2, h3, p, ul, li, ol, blockquote, strong, em. 
- Use <blockquote> for scripture passages
- Use <h2> for main sections
- Use <h3> for sub-sections
- No markdown, no code fences, no explanatory text — only the sermon HTML.`

  const html = await generateText(prompt, MODELS.flash)

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
