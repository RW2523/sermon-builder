import type { StructuredSermon } from '@/types'
import type { SlidePlan, SlideSpec } from '@/types/slides'
import { generateText, parseModelJson, MODELS } from '@/lib/gemini'
import { buildContentPlan } from '@/lib/slides/contentPlan'
import { structuredToPlainText } from '@/lib/sermon/structured'

// The deck is built CONTENT-FIRST from the real sermon (buildContentPlan), then
// ENRICHED with content-aware visuals — a biblical map for places, a route for
// a journey, a timeline for a sequence, a diagram for a relationship. The
// enrichment only ADDS visual slides; it never removes or rewrites the
// preaching content. If it fails, the faithful content deck stands on its own.

interface Enrichment {
  point: number // 1-based index of the main point this illustrates (0 = whole sermon)
  kind: 'map' | 'route' | 'timeline' | 'diagram'
  heading: string
  caption?: string
  places?: Array<{ name: string; note?: string }>
  routeStops?: Array<{ name: string; order: number; note?: string }>
  events?: Array<{ label: string; date?: string; note?: string }>
  diagram?: {
    shape: 'hubSpoke' | 'flow' | 'compare' | 'pyramid' | 'list'
    center?: string
    nodes?: Array<{ label: string; detail?: string }>
    leftHeader?: string; rightHeader?: string
    leftItems?: string[]; rightItems?: string[]
  }
}

const ENRICH_PROMPT = (sermon: string) => `You are a sermon visual designer. Read the sermon and identify up to 4 places where a CRISP, LABELLED diagram would genuinely help a congregation — and ONLY where the content truly calls for it. Do not force visuals.

Choose from:
- "map": the text names biblical place(s) where geography matters. payload "places":[{"name","note?"}].
- "route": a JOURNEY — two+ places in order / movement ("travelled from… to…", a missionary journey, the Exodus). payload "routeStops":[{"name","order","note?"}].
- "timeline": an ordered sequence of events / eras ("first… then… finally", dated events). payload "events":[{"label","date?","note?"}] (max 5).
- "diagram": a relationship / contrast / enumerated set ("three persons", "law vs grace", "the fruit of the Spirit"). payload "diagram":{"shape":hubSpoke|flow|compare|pyramid|list,"center?","nodes":[{"label","detail?"}],"leftHeader?","rightHeader?","leftItems?","rightItems?"}.

Return ONLY JSON: { "visuals": [ { "point": <1-based main-point number this illustrates, or 0 for the whole sermon>, "kind": ..., "heading": "<short slide title>", "caption": "<one line>", ...payload } ] }
Return { "visuals": [] } if nothing genuinely fits. Never invent place names or events that aren't in the sermon. Prefer at most 2-3 visuals total, and favour VARIETY — do not return the same kind repeatedly unless each is clearly distinct and warranted.

SERMON:
${sermon}`

function visualFromEnrichment(e: Enrichment): SlideSpec['visual'] | null {
  if (e.kind === 'map' && e.places?.length) return { type: 'map', places: e.places, spec: e.caption }
  if (e.kind === 'route' && (e.routeStops?.length ?? 0) >= 2) return { type: 'route', routeStops: e.routeStops, spec: e.caption }
  if (e.kind === 'timeline' && (e.events?.length ?? 0) >= 2) return { type: 'timeline', events: e.events, spec: e.caption }
  if (e.kind === 'diagram' && e.diagram) {
    const d = e.diagram
    const ok = d.shape === 'compare' ? (d.leftItems?.length || d.rightItems?.length) : (d.nodes?.length ?? 0) >= 2
    if (ok) return { type: 'diagram', diagram: { ...d, nodes: d.nodes ?? [] }, spec: e.caption }
  }
  return null
}

/** Insert each enrichment slide right after the divider of the point it
 *  illustrates (or after the opening scripture for point 0). */
function mergeEnrichments(plan: SlidePlan, items: Enrichment[]): SlidePlan {
  if (!items.length) return plan
  const slides = [...plan.slides]
  // index of each main-point divider, in order
  const dividerIdx = slides.map((s, i) => (s.role === 'section' ? i : -1)).filter((i) => i >= 0)
  // process from the end so earlier insert positions stay valid
  const sorted = [...items].sort((a, b) => b.point - a.point)
  for (const e of sorted) {
    const v = visualFromEnrichment(e)
    if (!v) continue
    const slide: SlideSpec = {
      layout: v.type === 'timeline' ? 'timelineSlide' : v.type === 'diagram' ? 'threeCol' : 'split',
      role: 'illustration', emphasis: 'normal',
      kicker: e.point > 0 ? `Point ${e.point}` : 'Context',
      heading: e.heading || 'A Closer Look',
      visual: v,
    }
    let at: number
    if (e.point >= 1 && e.point <= dividerIdx.length) at = dividerIdx[e.point - 1] + 1
    else at = Math.min(2, slides.length) // after cover (+scripture) for sermon-wide
    slides.splice(at, 0, slide)
  }
  return { ...plan, slides }
}

export async function buildSlidePlan(
  structured: StructuredSermon,
  opts: { themeId: string; targetSlideCount?: number }
): Promise<SlidePlan> {
  const plan = buildContentPlan(structured, opts) // faithful spine — always valid
  try {
    const raw = await generateText(ENRICH_PROMPT(structuredToPlainText(structured).slice(0, 9000)), MODELS.flash)
    const parsed = parseModelJson<{ visuals?: Enrichment[] }>(raw)
    const items = (parsed?.visuals ?? []).slice(0, 3)
    return mergeEnrichments(plan, items)
  } catch (err) {
    console.error('Visual enrichment failed (keeping content deck):', err)
    return plan
  }
}
