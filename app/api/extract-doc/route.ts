import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenAI } from '@google/genai'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'

export const maxDuration = 60

// Vercel serverless functions reject request bodies over ~4.5MB
const MAX_DOC_BYTES = 4 * 1024 * 1024

const SUPPORTED_MIME: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword': 'application/msword',
  'text/plain': 'text/plain',
  'text/markdown': 'text/plain',
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const sermonId = formData.get('sermonId') as string | null

  if (!file || !sermonId) {
    return NextResponse.json({ error: 'Missing file or sermonId' }, { status: 400 })
  }
  if (file.size > MAX_DOC_BYTES) {
    return NextResponse.json({ error: 'Document too large (max 4MB)' }, { status: 413 })
  }
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }
  if (!(await checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs))) {
    return NextResponse.json({ error: 'Too many AI requests — please try again later' }, { status: 429 })
  }

  const mimeType = SUPPORTED_MIME[file.type] ?? 'text/plain'
  const arrayBuffer = await file.arrayBuffer()
  const base64Data = Buffer.from(arrayBuffer).toString('base64')

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  let extractedText = ''

  if (file.type === 'text/plain' || file.type === 'text/markdown') {
    // Plain text — decode directly
    extractedText = Buffer.from(arrayBuffer).toString('utf-8')
  } else {
    // Use Gemini to extract text from PDF / Word
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: 'Extract all the text content from this document. Preserve headings, bullet points, and paragraph structure. Return only the extracted text, no commentary.',
            },
          ],
        },
      })
      extractedText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    } catch (err) {
      console.error('Document extraction failed:', err)
      return NextResponse.json({ error: 'Document extraction failed — please try again' }, { status: 502 })
    }
  }

  if (!extractedText.trim()) {
    return NextResponse.json({ error: 'No text could be extracted from this document' }, { status: 422 })
  }

  const { data: input, error } = await supabase
    .from('sermon_inputs')
    .insert({
      sermon_id: sermonId,
      kind: 'document',
      raw_text: extractedText,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ input })
}
