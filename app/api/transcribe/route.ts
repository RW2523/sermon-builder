import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenAI } from '@google/genai'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const audioFile = formData.get('audio') as File | null
  const sermonId = formData.get('sermonId') as string | null
  const storagePath = formData.get('storagePath') as string | null

  if (!audioFile || !sermonId) {
    return NextResponse.json({ error: 'Missing audio or sermonId' }, { status: 400 })
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  const arrayBuffer = await audioFile.arrayBuffer()
  const base64Audio = Buffer.from(arrayBuffer).toString('base64')
  const mimeType = audioFile.type || 'audio/mpeg'

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Audio } },
        { text: 'Please transcribe this audio recording accurately. This is sermon content from a pastor. Return only the transcription text, no additional commentary.' },
      ],
    },
  })

  const transcription = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  const { data: input, error } = await supabase
    .from('sermon_inputs')
    .insert({ sermon_id: sermonId, kind: 'audio', storage_path: storagePath, transcription })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ input, transcription })
}
