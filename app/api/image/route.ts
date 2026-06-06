import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { generateImageBase64, generateText, MODELS } from '@/lib/gemini'
import type { MediaKind } from '@/types'

export const maxDuration = 60

const KIND_PROMPT_SUFFIX: Record<MediaKind, string> = {
  image: 'Cinematic, inspirational Christian illustration. Dramatic warm lighting, high quality digital art suitable for church presentations.',
  map: 'Detailed biblical / historical map illustration. Warm sepia tones, ancient cartography aesthetic, clearly labeled locations, high quality.',
  timeline: 'Clean visual timeline infographic showing biblical or historical events in chronological order. Light background, elegant typography, gold accent lines.',
  scripture_slide: 'Beautiful scripture highlight slide. Dark purple or navy gradient background, elegant gold or white serif typography, subtle light rays or dove imagery. Presentation-ready.',
  graphic: 'Custom sermon graphic. Bold, modern church graphic design with the theme as the focal point. Clean typography, powerful colors, inspirational.',
}

const KIND_AUTO_HINT: Record<MediaKind, string> = {
  image: 'action-based illustration or biblical scene',
  map: 'biblical location map or ancient Middle East geographical illustration',
  timeline: 'chronological timeline of biblical events or historical context relevant to the sermon',
  scripture_slide: 'scripture highlight slide featuring a key verse from the sermon',
  graphic: 'sermon title graphic or thematic banner for the sermon',
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sermonId, prompt, kind = 'image', highQuality = false, autoPrompt = false, sermonText, regenerateId } = await req.json()

  if (!sermonId) return NextResponse.json({ error: 'Missing sermonId' }, { status: 400 })

  const mediaKind = kind as MediaKind

  let imagePrompt = prompt

  // Auto-generate a relevant prompt from sermon text
  if (autoPrompt && sermonText) {
    const suggestPrompt = `Based on this sermon content, suggest ONE specific, vivid image prompt for a ${KIND_AUTO_HINT[mediaKind]}.

Sermon excerpt: ${(sermonText as string).replace(/<[^>]+>/g, ' ').slice(0, 800)}

Return ONLY the image prompt as a single sentence, no explanation, no quotes.`
    imagePrompt = await generateText(suggestPrompt, MODELS.flash)
  }

  if (!imagePrompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  const enhancedPrompt = `${imagePrompt}. ${KIND_PROMPT_SUFFIX[mediaKind]}`

  const base64 = await generateImageBase64(enhancedPrompt, highQuality)

  const adminClient = await createAdminClient()
  const filename = `${user.id}/${sermonId}/${Date.now()}-${mediaKind}.png`
  const buffer = Buffer.from(base64, 'base64')

  const { error: uploadError } = await adminClient.storage
    .from('sermon-media')
    .upload(filename, buffer, { contentType: 'image/png', upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = adminClient.storage.from('sermon-media').getPublicUrl(filename)

  // If regenerating, delete the old media item first
  if (regenerateId) {
    await supabase.from('sermon_media').delete().eq('id', regenerateId)
  }

  const { data: existing } = await supabase
    .from('sermon_media')
    .select('order_index')
    .eq('sermon_id', sermonId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: mediaItem, error: dbError } = await supabase
    .from('sermon_media')
    .insert({
      sermon_id: sermonId,
      kind: mediaKind,
      prompt: imagePrompt,
      storage_path: filename,
      public_url: publicUrl,
      order_index: (existing?.order_index ?? -1) + 1,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ media: mediaItem, url: publicUrl })
}
