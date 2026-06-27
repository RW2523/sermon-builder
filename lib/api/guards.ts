import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'

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

// Self-defending: joins through sermons and filters on user_id explicitly so it
// never relies solely on RLS — safe even if a caller ever passes an admin
// (RLS-bypassing) client.
export async function getOwnedDraft(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
): Promise<{ id: string; sermon_id: string } | null> {
  const { data } = await supabase
    .from('sermon_drafts')
    .select('id, sermon_id, sermons!inner(user_id)')
    .eq('id', draftId)
    .eq('sermons.user_id', userId)
    .maybeSingle()
  return data ? { id: data.id, sermon_id: data.sermon_id } : null
}

// In-memory sliding-window limiter. Per serverless instance only — used as a
// fast local pre-filter in front of the shared DB limiter below.
const buckets = new Map<string, { count: number; resetAt: number }>()

function localAllow(key: string, limit: number, windowMs: number): boolean {
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

// Cross-instance rate limit. The local map rejects obvious bursts cheaply; the
// shared `check_rate_limit` RPC (see migration.sql v6) holds the real global
// cap across all serverless instances. Fails OPEN on limiter-infra errors so a
// limiter outage never takes the app down (the local pre-filter still applies).
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!localAllow(key, limit, windowMs)) return false
  try {
    const admin = await createAdminClient()
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.round(windowMs / 1000),
    })
    if (error) {
      console.warn('Shared rate-limit RPC failed, allowing request:', error.message)
      return true
    }
    return data === true
  } catch (err) {
    console.warn('Shared rate-limit unavailable, allowing request:', err)
    return true
  }
}

export const AI_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 } // 30 AI calls/hour/user
