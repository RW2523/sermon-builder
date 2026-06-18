import PptxGenJS from 'pptxgenjs'
import type { Sermon, StructuredSermon, SermonMedia, ExportTemplateId } from '@/types'
import type { SlidePlan } from '@/types/slides'
import { getTheme } from '@/lib/sermon/templates'
import { getVisualTheme } from '@/lib/visuals/theme'
import { renderProgrammaticVisual, isProgrammatic } from '@/lib/visuals'
import { prepareImage } from '@/lib/exports/image'
import { buildFallbackPlan } from '@/lib/slides/fallbackPlan'
import { createDeck } from '@/lib/exports/deck'
import { renderSlide } from '@/lib/exports/layouts'

interface ExportOpts {
  templateId?: ExportTemplateId
  slideCount?: number
  speakerNotes?: string | null
  slidePlan?: SlidePlan | null
}

// Plan-driven PowerPoint engine. A SlidePlan (from the LLM planner, or a
// deterministic fallback) decides each slide's layout and at most one visual.
// Scene visuals are pulled from the AI image pool (media); label-bearing
// visuals (scripture/timeline/map/route/diagram) are rendered programmatically
// to crisp PNGs at export time. Every layout places image and text on a shared
// grid with contrast-safe ink.
export async function generatePPT(
  sermon: Sermon,
  structured: StructuredSermon,
  media: SermonMedia[],
  opts: ExportOpts = {}
): Promise<Blob> {
  const t = getTheme(opts.templateId ?? sermon.export_template)
  const vt = getVisualTheme(t)
  const themeId = (opts.templateId ?? sermon.export_template) as string

  const plan: SlidePlan = opts.slidePlan?.slides?.length
    ? opts.slidePlan
    : buildFallbackPlan(structured, themeId)

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'SabAi Sermon'
  pptx.title = structured.title || sermon.title

  // ── Scene image pool (compressed AI images) ──
  const prepared = await Promise.all(
    media.map(async (m) => (m.public_url ? (await prepareImage(m.public_url))?.dataUrl ?? null : null))
  )
  const scenePool = prepared.filter(Boolean) as string[]
  let sceneIdx = 0
  const nextScene = (): string | null => (scenePool.length ? scenePool[sceneIdx++ % scenePool.length] : null)

  // ── Resolve each slide's visual in parallel ──
  const visuals = await Promise.all(
    plan.slides.map(async (spec) => {
      if (isProgrammatic(spec.visual.type)) return await renderProgrammaticVisual(spec.visual, vt)
      if (spec.visual.type === 'scene') return nextScene()
      return null
    })
  )

  // ── Render ──
  const c = createDeck(pptx, t)
  let sectionIndex = 0
  plan.slides.forEach((spec, i) => {
    if (spec.layout === 'sectionDivider') sectionIndex += 1
    const slide = renderSlide(c, spec, visuals[i], sectionIndex)
    const noteParts = [spec.heading, ...(spec.body ?? [])].filter(Boolean)
    if (spec.role === 'prayer' && opts.speakerNotes) noteParts.push('\n— SPEAKER NOTES —\n' + opts.speakerNotes)
    slide.addNotes(noteParts.join('\n'))
  })

  return (await pptx.write({ outputType: 'blob' })) as Blob
}
