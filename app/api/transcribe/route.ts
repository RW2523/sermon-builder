import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { GoogleGenAI } from '@google/genai'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'

export const maxDuration = 60

// Gemini inline data is capped at ~20MB per request
const MAX_AUDIO_BYTES = 20 * 1024 * 1024

// The client uploads audio directly to the sermon-audio bucket, then sends
// only the storage path here. Re-sending the bytes through this route would
// hit Vercel's 4.5MB request body limit for any real sermon recording.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many AI requests — please try again later' }, { status: 429 })
  }

  const { sermonId, storagePath, mimeType } = await req.json()

  if (!sermonId || !storagePath) {
    return NextResponse.json({ error: 'Missing sermonId or storagePath' }, { status: 400 })
  }
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }
  // The bucket is private and may not have user read policies, so the file is
  // fetched with the admin client — the path prefix check keeps it scoped to
  // the caller's own folder.
  if (!storagePath.startsWith(`${user.id}/${sermonId}/`)) {
    return NextResponse.json({ error: 'Invalid storage path' }, { status: 403 })
  }

  const adminClient = await createAdminClient()
  const { data: fileData, error: downloadError } = await adminClient.storage
    .from('sermon-audio')
    .download(storagePath)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Could not read the uploaded audio file' }, { status: 404 })
  }
  if (fileData.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio file too large to transcribe (max 20MB)' }, { status: 413 })
  }

  const arrayBuffer = await fileData.arrayBuffer()
  const base64Audio = Buffer.from(arrayBuffer).toString('base64')

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  let transcription = ''
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType || fileData.type || 'audio/mpeg', data: base64Audio } },
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
