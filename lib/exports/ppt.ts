import PptxGenJS from 'pptxgenjs'
import type { Sermon, StructuredSermon, SermonMedia, ExportTemplateId } from '@/types'
import type { SlidePlan } from '@/types/slides'
import { getTheme } from '@/lib/sermon/templates'
import { getVisualTheme } from '@/lib/visuals/theme'
import { renderProgrammaticVisual, isProgrammatic } from '@/lib/visuals'
import { prepareImage, prepareScene } from '@/lib/exports/image'
import { mix } from '@/lib/visuals/theme'
import { buildFallbackPlan } from '@/lib/slides/fallbackPlan'
import { createDeck } from '@/lib/exports/deck'
import { renderSlide, type SlideVisual } from '@/lib/exports/layouts'

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

  // ── Raw scene image pool (URLs) for backgrounds ──
  const rawPool = media.map((m) => m.public_url).filter(Boolean) as string[]
  let poolIdx = 0
  const nextRaw = (): string | null => (rawPool.length ? rawPool[poolIdx++ % rawPool.length] : null)

  // Dark colour used to bake gradients/washes so off-white text always reads —
  // theme's own deep tone on dark themes, a warm near-black on light themes.
  const scrimDark = t.mode === 'dark' ? `#${t.bgAlt}` : mix(t.text, '#000000', 0.25)
  const crisp = async (url: string) => (await prepareImage(url))?.dataUrl ?? null

  // ── Resolve each slide into { main, bg }: smooth baked gradients instead of
  // hard scrim rects, and a background image on (almost) every slide. ──
  const visuals: SlideVisual[] = await Promise.all(
    plan.slides.map(async (spec): Promise<SlideVisual> => {
      if (isProgrammatic(spec.visual.type)) {
        return { main: await renderProgrammaticVisual(spec.visual, vt), bg: null }
      }
      const layout = spec.layout
      if (spec.visual.type === 'scene') {
        const url = spec.visual.imageUrl || nextRaw()
        if (!url) return { main: null, bg: null }
        if (layout === 'cover' || layout === 'closing' || layout === 'fullBleedCaption') {
          return { main: await prepareScene(url, 'heroBottom', scrimDark), bg: null }
        }
        if (layout === 'sectionDivider') {
          return { main: await prepareScene(url, 'heroLeft', scrimDark), bg: null }
        }
        if (layout === 'bigStat') {
          return { main: await prepareScene(url, 'wash', scrimDark), bg: null }
        }
        if (layout === 'figure' || layout === 'showcase' || layout === 'split') {
          const [fg, bg] = await Promise.all([crisp(url), prepareScene(url, 'wash', scrimDark)])
          return { main: fg, bg }
        }
        return { main: null, bg: await prepareScene(url, 'wash', scrimDark) }
      }
      // Text-only slides get a subtle washed background from the image pool so
      // every slide carries imagery (panels/text sit on top, fully readable).
      const bgUrl = nextRaw()
      return { main: null, bg: bgUrl ? await prepareScene(bgUrl, 'wash', scrimDark) : null }
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
