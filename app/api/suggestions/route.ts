import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText, MODELS } from '@/lib/gemini'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sermonHtml, title, scriptureRef, theme } = await req.json()
  if (!sermonHtml) return NextResponse.json({ error: 'Missing sermon content' }, { status: 400 })

  const contentSnippet = sermonHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500)

  const prompt = `You are a master sermon coach and theologian. Analyze this sermon draft and provide specific, actionable AI suggestions to strengthen it.

Sermon:
- Title: ${title ?? 'Untitled'}
- Scripture: ${scriptureRef ?? 'Not specified'}
- Theme: ${theme ?? 'Not specified'}
- Content: ${contentSnippet}

Provide suggestions in exactly this JSON format (return ONLY valid JSON, no markdown fences):
{
  "illustrations": [
    {"title": "...", "description": "..."},
    {"title": "...", "description": "..."},
    {"title": "...", "description": "..."}
  ],
  "applications": [
    {"point": "...", "suggestion": "..."},
    {"point": "...", "suggestion": "..."},
    {"point": "...", "suggestion": "..."}
  ],
  "scripture_connections": [
    {"reference": "...", "connection": "..."},
    {"reference": "...", "connection": "..."}
  ],
  "opening_hooks": [
    "...",
    "..."
  ],
  "closing_calls": [
    "...",
    "..."
  ],
  "strengthening_tips": [
    "...",
    "...",
    "..."
  ]
}`

  const raw = await generateText(prompt, MODELS.flash)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.replace(/```json?|```/g, '').trim())
  } catch {
    return NextResponse.json({ error: 'Failed to parse suggestions' }, { status: 500 })
  }

  return NextResponse.json({ suggestions: parsed })
}
