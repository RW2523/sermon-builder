import type { StructuredSermon } from '@/types'
import type { SlidePlan } from '@/types/slides'
import { buildContentPlan } from '@/lib/slides/contentPlan'

// The deterministic, content-faithful deck. Used directly by the client
// exporters when no stored plan is available, and as the spine the server
// planner enriches. Pure (no LLM, no network) so exports never break.
export function buildFallbackPlan(s: StructuredSermon, themeId: string): SlidePlan {
  return buildContentPlan(s, { themeId })
}
