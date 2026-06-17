import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { generateImageBase64, generateText, MODELS } from '@/lib/gemini'
import { userOwnsSermon, checkRateLimit, AI_RATE_LIMIT } from '@/lib/api/guards'
import { uploadSermonImage } from '@/lib/api/storage'
import type { MediaKind } from '@/types'

const VALID_KINDS: MediaKind[] = ['image', 'map', 'timeline', 'scripture_slide', 'graphic']

export const maxDuration = 60

const KIND_PROMPT_SUFFIX: Record<MediaKind, string> = {
  image: 'Masterful cinematic Christian fine-art illustration in the style of a classical oil painting. Dramatic chiaroscuro lighting with golden-hour rim light, volumetric god rays, deep navy-and-gold color grading, rich texture and painterly brushwork, epic composition with strong foreground depth, museum quality, 8k detail. Suitable for a large worship screen.',
  map: 'Exquisite hand-drawn biblical map in the style of an antique 17th-century cartographer. Aged parchment texture, warm sepia and gold-leaf tones, ornate compass rose, elegant serif labels on key locations, decorative border flourishes, subtle terrain shading, museum-archive quality.',
  timeline: 'Elegant biblical timeline infographic with a refined editorial design. Deep navy background, luminous gold accent lines and markers, classical serif typography, small painterly vignette illustrations at each event, balanced composition with generous spacing, premium print quality.',
  scripture_slide: 'Breathtaking scripture verse slide. Deep navy gradient background with subtle volumetric light rays from above, the verse set in elegant gold serif lettering with refined letterspacing, delicate gold flourish ornaments framing the text, faint dove or cross silhouette in the atmosphere, premium worship-screen quality.',
  graphic: 'Premium sermon title graphic with sophisticated church branding. Deep navy backdrop, luminous gold serif title treatment as the focal point, subtle radial glow behind the type, delicate ornamental line flourishes, cinematic atmosphere, polished and modern yet reverent, presentation-ready.',
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

  if (!checkRateLimit(`ai:${user.id}`, AI_RATE_LIMIT.limit, AI_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many AI requests — please try again later' }, { status: 429 })
  }

  const { sermonId, prompt, kind = 'image', highQuality = false, autoPrompt = false, sermonText, regenerateId } = await req.json()

  if (!sermonId) return NextResponse.json({ error: 'Missing sermonId' }, { status: 400 })
  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: `Invalid kind — must be one of: ${VALID_KINDS.join(', ')}` }, { status: 400 })
  }
  if (!(await userOwnsSermon(supabase, sermonId, user.id))) {
    return NextResponse.json({ error: 'Sermon not found' }, { status: 404 })
  }

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

  let base64: string
  try {
    base64 = await generateImageBase64(enhancedPrompt, highQuality)
  } catch (err) {
    console.error('Image generation failed:', err)
    return NextResponse.json({ error: 'Image generation failed — please try again' }, { status: 502 })
  }

  const adminClient = await createAdminClient()
  let filename: string
  let publicUrl: string
  try {
    const up = await uploadSermonImage(adminClient, user.id, sermonId, mediaKind, base64)
    filename = up.storagePath
    publicUrl = up.publicUrl
  } catch (err) {
    console.error('Image storage upload error:', err)
    return NextResponse.json({ error: 'Could not save the generated image — please try again' }, { status: 502 })
  }

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
