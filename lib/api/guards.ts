import type { SupabaseClient } from '@supabase/supabase-js'

// Ownership checks run through the caller's RLS-scoped client, so another
// user's rows are simply invisible. Verifying before calling Gemini prevents
// spending AI quota on requests whose DB write would be rejected anyway.
export async function userOwnsSermon(supabase: SupabaseClient, sermonId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('sermons')
    .select('id')
    .eq('id', sermonId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data)
}

export async function getOwnedDraft(supabase: SupabaseClient, draftId: string): Promise<{ id: string; sermon_id: string } | null> {
  const { data } = await supabase
    .from('sermon_drafts')
    .select('id, sermon_id')
    .eq('id', draftId)
    .maybeSingle()
  return data
}

// In-memory sliding-window limiter. Per serverless instance only — a
// best-effort guard against runaway AI spend, not a hard global quota.
const buckets = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (now > v.resetAt) buckets.delete(k)
    }
  }
  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}

export const AI_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } // 30 AI calls/hour/user
