import { z } from 'zod'
import type { SlidePlan } from '@/types/slides'

// Zod validator for the LLM-emitted slide plan. Lenient on shape (coerces /
// defaults rather than rejecting) so a slightly-off model response still
// yields a renderable plan; the planner runs a deterministic post-pass after.

const visualType = z.enum(['none', 'scene', 'scriptureArt', 'map', 'route', 'timeline', 'diagram'])
const layoutName = z.enum([
  'cover', 'fullBleedCaption', 'split', 'scripture', 'bigStat', 'bento',
  'threeCol', 'timelineSlide', 'pullQuote', 'twoUp', 'sectionDivider', 'closing',
])
const role = z.enum([
  'cover', 'section', 'teaching', 'scripture', 'application',
  'illustration', 'stat', 'comparison', 'framework', 'prayer', 'closing',
])
const emphasis = z.enum(['normal', 'breath', 'climax']).catch('normal')

const diagram = z.object({
  shape: z.enum(['hubSpoke', 'flow', 'compare', 'pyramid', 'list']).catch('list'),
  center: z.string().optional(),
  nodes: z.array(z.object({ label: z.string(), detail: z.string().optional() })).default([]),
  leftHeader: z.string().optional(),
  rightHeader: z.string().optional(),
  leftItems: z.array(z.string()).optional(),
  rightItems: z.array(z.string()).optional(),
})

const visual = z.object({
  type: visualType.catch('none'),
  spec: z.string().optional(),
  prompt: z.string().optional(),
  highQuality: z.boolean().optional(),
  scripture: z.object({ text: z.string(), reference: z.string() }).optional(),
  places: z.array(z.object({ name: z.string(), note: z.string().optional() })).optional(),
  routeStops: z.array(z.object({ name: z.string(), order: z.number(), note: z.string().optional() })).optional(),
  events: z.array(z.object({ label: z.string(), date: z.string().optional(), note: z.string().optional() })).optional(),
  diagram: diagram.optional(),
}).catch({ type: 'none' as const })

const slideSpec = z.object({
  layout: layoutName.catch('split'),
  role: role.catch('teaching'),
  emphasis,
  kicker: z.string().optional(),
  heading: z.string().default(''),
  subheading: z.string().optional(),
  body: z.array(z.string()).optional(),
  reference: z.string().optional(),
  stat: z.object({ value: z.string(), label: z.string().optional() }).optional(),
  imageSide: z.enum(['left', 'right']).optional(),
  visual: visual.default({ type: 'none' }),
})

export const slidePlanSchema = z.object({
  meta: z.object({
    title: z.string().default('Sermon'),
    theme: z.string().default('navy_gold'),
    generatedFor: z.string().default(''),
  }).default({ title: 'Sermon', theme: 'navy_gold', generatedFor: '' }),
  slides: z.array(slideSpec).default([]),
})

export function validatePlan(raw: unknown): SlidePlan {
  return slidePlanSchema.parse(raw) as SlidePlan
}
