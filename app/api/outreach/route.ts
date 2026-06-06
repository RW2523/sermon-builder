import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, MODELS } from '@/lib/gemini'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sermonId, sermonHtml, title, scriptureRef, theme } = await req.json()
  if (!sermonId) return NextResponse.json({ error: 'Missing sermonId' }, { status: 400 })

  const content = sermonHtml
    ? sermonHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200)
    : ''

  const prompt = `You are a church social media strategist. Create outreach content for this sermon.

Sermon:
- Title: ${title}
- Scripture: ${scriptureRef ?? 'Not specified'}
- Theme: ${theme ?? 'Not specified'}
- Content excerpt: ${content}

Return a JSON object with exactly these fields:
{
  "summary": "<2-3 sentence sermon summary for members>",
  "social_caption": "<150-200 char engaging social media caption with emoji>",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "instagram_caption": "<Instagram-optimized caption with line breaks and emojis>",
  "facebook_post": "<Facebook post, conversational, 2-3 paragraphs>",
  "twitter_thread": ["<tweet 1>", "<tweet 2>", "<tweet 3>"]
}

Return ONLY valid JSON, no markdown fences.`

  const raw = await generateText(prompt, MODELS.flash)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.replace(/```json?|```/g, '').trim())
  } catch {
    parsed = { summary: raw, social_caption: raw.slice(0, 200), hashtags: [] }
  }

  const share_slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${uuidv4().slice(0, 8)}`

  // Upsert outreach post
  const { data: existing } = await supabase
    .from('outreach_posts')
    .select('id')
    .eq('sermon_id', sermonId)
    .maybeSingle()

  let data, error
  if (existing) {
    const r = await supabase
      .from('outreach_posts')
      .update({
        social_caption: parsed.social_caption as string,
        hashtags: parsed.hashtags as string[],
        summary: parsed.summary as string,
      })
      .eq('id', existing.id)
      .select()
      .single()
    data = r.data; error = r.error
  } else {
    const r = await supabase
      .from('outreach_posts')
      .insert({
        sermon_id: sermonId,
        share_slug,
        social_caption: parsed.social_caption as string,
        hashtags: parsed.hashtags as string[],
        summary: parsed.summary as string,
      })
      .select()
      .single()
    data = r.data; error = r.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ outreach: data, social: parsed })
}
