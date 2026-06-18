import type { StructuredSermon } from '@/types'
import type { SlidePlan, SlideSpec } from '@/types/slides'
import { generateText, parseModelJson, MODELS } from '@/lib/gemini'
import { validatePlan } from '@/lib/slides/planSchema'
import { buildFallbackPlan } from '@/lib/slides/fallbackPlan'
import { structuredToPlainText } from '@/lib/sermon/structured'

const PLANNER_PROMPT = (sermon: string, title: string, target: number) => `You are an award-winning presentation designer and a thoughtful Bible teacher. Turn the sermon below into a SLIDE PLAN for a premium, editorial, NotebookLM-grade deck that feels hand-crafted — varied layouts, one idea per slide, generous whitespace, and the RIGHT visual only where it genuinely helps.

Return ONLY a JSON object: { "meta": { "title": "...", "theme": "", "generatedFor": "planner" }, "slides": SlideSpec[] }.

Aim for about ${target} slides. Each SlideSpec:
{
  "layout": one of cover | fullBleedCaption | split | scripture | bigStat | bento | threeCol | timelineSlide | pullQuote | twoUp | sectionDivider | closing,
  "role": cover | section | teaching | scripture | application | illustration | stat | comparison | framework | prayer | closing,
  "emphasis": normal | breath | climax,   // breath = a spacious pattern-break; climax = cover/divider/close
  "kicker": "<=4-word tracked eyebrow (optional)",
  "heading": "<=10 words — the ONE headline of the slide",
  "subheading": "one short line (optional)",
  "body": ["0–5 SHORT lines; varied lengths; not all starting with a verb"],
  "reference": "scripture ref or attribution (optional)",
  "stat": { "value": "12", "label": "..." },   // bigStat only
  "imageSide": "left" | "right",                 // split only
  "visual": { "type": ..., ...payload }
}

VISUAL RULES — choose AT MOST ONE visual per slide, by this PRIORITY (stop at the first that fits); default to "none":
1. route  — two+ named places WITH movement/ordering (a journey: Exodus, Paul's travels, flight to Egypt). payload: "routeStops":[{"name","order","note?"}].
2. map    — named biblical place(s) where geography matters (no journey). payload: "places":[{"name","note?"}].
3. timeline — ordered events / eras / sequence ("first…then…finally", dated events, <=5). payload: "events":[{"label","date?","note?"}].
4. diagram — a relationship / contrast / hierarchy / enumerated set ("three persons", "fruit of the Spirit", "law vs grace"). payload: "diagram":{"shape":hubSpoke|flow|compare|pyramid|list,"center?","nodes":[{"label","detail?"}],"leftHeader?","rightHeader?","leftItems?","rightItems?"}.
5. scriptureArt — a single featured verse you want to display in full. payload: "scripture":{"text","reference"}.
6. scene — a narrative moment / mood / setting needing NO accurate on-image words. payload: "prompt":"a cinematic, reverent scene of …, no text, no letters, no words", optional "highQuality":true (reserve for cover/divider/closing).
7. none — theological exposition, exhortation, definitions, transitions: TEXT-ONLY. The MAJORITY of slides should be "none" or "scene".

CRITICAL: maps, routes, timelines, diagrams, and scriptureArt are rendered programmatically with crisp text — ALWAYS prefer them over a scene when the slide carries place names, sequences, relationships, or a verse. NEVER ask a scene image to contain readable words.

LAYOUT GUIDANCE — rotate layouts so no two consecutive slides share one; match layout to content:
- cover: opening title (climax). closing: benediction/sending (climax). sectionDivider: between major points.
- scripture: a featured verse. split: a teaching point + one supporting visual (alternate imageSide). threeCol: exactly 3 parallel points. twoUp: a contrast. bigStat: one striking number/word. bento: an enumerated set / applications. timelineSlide: a sequence. pullQuote: a non-scripture quote. fullBleedCaption: an emotional 'breath' beat.

Keep headings <=10 words. Keep body lines short. Be restrained, reverent, and varied.

SERMON (title: "${title}"):
${sermon}`

/** Enforce restraint + variety deterministically after the LLM responds. */
function postProcess(plan: SlidePlan, themeId: string): SlidePlan {
  const VISUAL_BUDGET = 0.85 // share of slides allowed to carry any visual
  let visualCount = 0
  let splitSide: 'left' | 'right' = 'right'

  const slides = plan.slides.map((s): SlideSpec => {
    const out: SlideSpec = { ...s }

    // Drop visuals whose required payload is missing (planner mistakes).
    const v = out.visual
    const payloadOk =
      (v.type === 'scene' && (v.prompt || v.spec)) ||
      (v.type === 'scriptureArt' && v.scripture?.text) ||
      (v.type === 'map' && (v.places?.length ?? 0) >= 1) ||
      (v.type === 'route' && (v.routeStops?.length ?? 0) >= 2) ||
      (v.type === 'timeline' && (v.events?.length ?? 0) >= 2) ||
      (v.type === 'diagram' && (v.diagram?.nodes?.length ?? 0) >= 2) ||
      v.type === 'none'
    if (!payloadOk) out.visual = { type: 'none' }

    // Visual budget — demote excess scene visuals to text-only (cheap visuals
    // like diagrams/timelines/scripture are kept; only AI scenes are capped).
    if (out.visual.type !== 'none') {
      visualCount++
      if (out.visual.type === 'scene' && visualCount / plan.slides.length > VISUAL_BUDGET && out.role !== 'cover' && out.role !== 'closing') {
        out.visual = { type: 'none' }
        visualCount--
      }
    }

    // Force scene no-text clause.
    if (out.visual.type === 'scene') {
      const base = out.visual.prompt || out.visual.spec || out.heading
      out.visual = { ...out.visual, prompt: /no text|no letters|no words/i.test(base) ? base : `${base}. Cinematic, reverent, fine-art; no text, no letters, no words.` }
    }

    // Alternate split image side so consecutive splits don't mirror each other.
    if (out.layout === 'split') { out.imageSide = splitSide; splitSide = splitSide === 'right' ? 'left' : 'right' }

    // Clamp overly long headings — by words, with a hard character cap so
    // space-free scripts (and run-on phrases) can't overflow either.
    if (out.heading) {
      const words = out.heading.trim().split(/\s+/)
      let h = words.length > 12 ? words.slice(0, 12).join(' ') : out.heading.trim()
      if (h.length > 90) h = h.slice(0, 90).trimEnd() + '…'
      out.heading = h
    }
    return out
  })

  return { ...plan, meta: { ...plan.meta, theme: themeId }, slides }
}

export async function buildSlidePlan(
  structured: StructuredSermon,
  opts: { themeId: string; targetSlideCount?: number }
): Promise<SlidePlan> {
  const target = Math.max(8, Math.min(24, opts.targetSlideCount ?? 14))
  const sermonText = structuredToPlainText(structured).slice(0, 9000)
  try {
    const raw = await generateText(PLANNER_PROMPT(sermonText, structured.title, target), MODELS.flash)
    const plan = validatePlan(parseModelJson(raw))
    if (!plan.slides.length) throw new Error('planner returned no slides')
    return postProcess(plan, opts.themeId)
  } catch (err) {
    console.error('Slide planner failed, using deterministic fallback:', err)
    return buildFallbackPlan(structured, opts.themeId)
  }
}
