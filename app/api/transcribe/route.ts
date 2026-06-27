import { NextResponse } from 'next/server'
import { parseJsonBody, badRequest } from '@/lib/api/http'
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
  if (!(await checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs))) {
    return NextResponse.json({ error: 'Too many AI requests — please try again later' }, { status: 429 })
  }

  const body = await parseJsonBody<{ sermonId?: string; storagePath?: string; mimeType?: string }>(req)
  if (!body) return badRequest()
  const { sermonId, storagePath, mimeType } = body

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

  // Upsert so a client retry of the same audio file updates rather than
  // inserting a duplicate input (which would double-weight the polish prompt).
  // Falls back to a plain insert if the unique index isn't present yet (42P10),
  // so the route works before the migration is applied to the database.
  const row = { sermon_id: sermonId, kind: 'audio', storage_path: storagePath, transcription }
  let res = await supabase
    .from('sermon_inputs')
    .upsert(row, { onConflict: 'sermon_id,storage_path' })
    .select()
    .single()
  if (res.error?.code === '42P10') {
    res = await supabase.from('sermon_inputs').insert(row).select().single()
  }
  const { data: input, error } = res

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ input, transcription })
}
