import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenAI } from '@google/genai'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'

export const maxDuration = 60

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many AI requests — please try again later' }, { status: 429 })
  }

  const formData = await req.formData()
  const audioFile = formData.get('audio') as File | null
  const sermonId = formData.get('sermonId') as string | null
  const storagePath = formData.get('storagePath') as string | null

  if (!audioFile || !sermonId) {
    return NextResponse.json({ error: 'Missing audio or sermonId' }, { status: 400 })
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio file too large (max 25MB)' }, { status: 413 })
  }
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  const arrayBuffer = await audioFile.arrayBuffer()
  const base64Audio = Buffer.from(arrayBuffer).toString('base64')
  const mimeType = audioFile.type || 'audio/mpeg'

  let transcription = ''
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          { text: 'Please transcribe this audio recording accurately. This is sermon content from a pastor. Return only the transcription text, no additional commentary.' },
        ],
      },
    })
    transcription = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  } catch (err) {
    console.error('Transcription failed:', err)
    return NextResponse.json({ error: 'Transcription failed — please try again' }, { status: 502 })
  }
  if (!transcription.trim()) {
    return NextResponse.json({ error: 'No speech detected in the audio' }, { status: 422 })
  }

  const { data: input, error } = await supabase
    .from('sermon_inputs')
    .insert({ sermon_id: sermonId, kind: 'audio', storage_path: storagePath, transcription })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ input, transcription })
}
