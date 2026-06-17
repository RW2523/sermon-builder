import type { SupabaseClient } from '@supabase/supabase-js'

// Upload a base64 PNG to the sermon-media bucket as a Blob (not a raw Node
// Buffer — undici can drop large Buffer bodies mid-write with EPIPE), with a
// short retry on transient network failures. Returns the storage path +
// public URL, or throws after persistent failure.
export async function uploadSermonImage(
  admin: SupabaseClient,
  userId: string,
  sermonId: string,
  kind: string,
  base64: string,
  seq = 0
): Promise<{ storagePath: string; publicUrl: string }> {
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
  const blob = new Blob([bytes], { type: 'image/png' })
  const storagePath = `${userId}/${sermonId}/${Date.now()}-${seq}-${kind}.png`

  let lastErr: string | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await admin.storage
        .from('sermon-media')
        .upload(storagePath, blob, { contentType: 'image/png', upsert: true })
      if (!error) {
        const { data } = admin.storage.from('sermon-media').getPublicUrl(storagePath)
        return { storagePath, publicUrl: data.publicUrl }
      }
      lastErr = error.message
    } catch (err) {
      lastErr = (err as Error)?.message ?? 'upload failed'
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt))
  }
  throw new Error(lastErr ?? 'Image upload failed')
}
