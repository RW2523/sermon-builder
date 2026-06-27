import { NextResponse } from 'next/server'
import { parseJsonBody, badRequest } from '@/lib/api/http'
import { createClient } from '@/lib/supabase/server'
import { generateText, MODELS } from '@/lib/gemini'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs))) {
    return NextResponse.json({ error: 'Too many AI requests — please try again later' }, { status: 429 })
  }

  const body = await parseJsonBody<{ sermonId?: string; sermonHtml?: string; title?: string; scriptureRef?: string; theme?: string }>(req)
  if (!body) return badRequest()
  const { sermonId, sermonHtml, title, scriptureRef, theme } = body
  if (!sermonId) return NextResponse.json({ error: 'Missing sermonId' }, { status: 400 })
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }

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

  let raw: string
  try {
    raw = await generateText(prompt, MODELS.flash)
  } catch (err) {
    console.error('Outreach generation failed:', err)
    return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 502 })
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.replace(/```json?|```/g, '').trim())
  } catch {
    return NextResponse.json({ error: 'AI returned an unexpected format — please try again' }, { status: 502 })
  }
  if (typeof parsed.summary !== 'string' || typeof parsed.social_caption !== 'string') {
    return NextResponse.json({ error: 'AI returned an unexpected format — please try again' }, { status: 502 })
  }
  if (!Array.isArray(parsed.hashtags)) parsed.hashtags = []

  const titleSlug = String(title ?? 'sermon').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sermon'
  const share_slug = `${titleSlug}-${uuidv4()}`

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
