import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { generateImageBase64, generateText, MODELS } from '@/lib/gemini'

export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sermonId, prompt, kind = 'image', highQuality = false, autoPrompt = false, sermonText } = await req.json()

  if (!sermonId) return NextResponse.json({ error: 'Missing sermonId' }, { status: 400 })

  let imagePrompt = prompt

  // Auto-generate a relevant prompt from sermon text
  if (autoPrompt && sermonText) {
    const suggestPrompt = `Based on this sermon content, suggest ONE specific, vivid image prompt for a ${kind === 'map' ? 'biblical location map or ancient Middle East geographical illustration' : 'powerful, action-based Christian illustration or scene'}. 
    
Sermon excerpt: ${sermonText.slice(0, 800)}

Return ONLY the image prompt, no explanation. Make it cinematic and spiritually evocative.`
    imagePrompt = await generateText(suggestPrompt, MODELS.flash)
  }

  if (!imagePrompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // Enhance the prompt for sermon context
  const enhancedPrompt = kind === 'map'
    ? `${imagePrompt}. Style: detailed biblical/historical map illustration, warm sepia tones, ancient cartography aesthetic, high quality.`
    : `${imagePrompt}. Style: cinematic, inspirational, high-quality digital art suitable for church presentations, dramatic lighting.`

  const base64 = await generateImageBase64(enhancedPrompt, highQuality)

  // Upload to Supabase Storage
  const adminClient = await createAdminClient()
  const filename = `${user.id}/${sermonId}/${Date.now()}-${kind}.png`
  const buffer = Buffer.from(base64, 'base64')

  const { error: uploadError } = await adminClient.storage
    .from('sermon-media')
    .upload(filename, buffer, { contentType: 'image/png', upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = adminClient.storage
    .from('sermon-media')
    .getPublicUrl(filename)

  // Get current max order_index
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
      kind,
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
