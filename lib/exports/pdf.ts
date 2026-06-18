import jsPDF from 'jspdf'
import type { Sermon, StructuredSermon, SermonMedia, ExportTemplateId } from '@/types'
import type { SlidePlan } from '@/types/slides'
import { getTheme } from '@/lib/sermon/templates'
import { getVisualTheme } from '@/lib/visuals/theme'
import { renderProgrammaticVisual, isProgrammatic } from '@/lib/visuals'
import { svgToDataUrl } from '@/lib/visuals/svg'
import { prepareImage } from '@/lib/exports/image'
import { buildFallbackPlan } from '@/lib/slides/fallbackPlan'
import { renderSlideSvg } from '@/lib/exports/slide-svg'

interface ExportOpts {
  templateId?: ExportTemplateId
  slidePlan?: SlidePlan | null
}

// 16:9 landscape page (mm). Each slide is composited as an SVG (slide-svg.ts),
// rasterized at high DPI, and placed full-bleed — so the PDF deck reads
// identically to the PowerPoint deck built from the same plan. (The selectable
// text manuscript lives in the separate Print View.)
const PAGE_W = 320
const PAGE_H = 180

export async function generatePDF(
  sermon: Sermon,
  structured: StructuredSermon,
  media: SermonMedia[],
  opts: ExportOpts = {}
): Promise<Blob> {
  const t = getTheme(opts.templateId ?? sermon.export_template)
  const vt = getVisualTheme(t)
  const themeId = (opts.templateId ?? sermon.export_template) as string
  const title = structured.title || sermon.title

  const plan: SlidePlan = opts.slidePlan?.slides?.length
    ? opts.slidePlan
    : buildFallbackPlan(structured, themeId)

  // Scene image pool (compressed) — fallback when a slide has no bespoke image.
  const prepared = await Promise.all(
    media.map(async (m) => (m.public_url ? (await prepareImage(m.public_url))?.dataUrl ?? null : null))
  )
  const scenePool = prepared.filter(Boolean) as string[]
  let sceneIdx = 0
  const nextScene = (): string | null => (scenePool.length ? scenePool[sceneIdx++ % scenePool.length] : null)

  // Resolve each slide's visual to a data URL (same logic as the PPT engine).
  const visuals = await Promise.all(
    plan.slides.map(async (spec) => {
      if (isProgrammatic(spec.visual.type)) return await renderProgrammaticVisual(spec.visual, vt)
      if (spec.visual.type === 'scene') {
        if (spec.visual.imageUrl) {
          const prepped = await prepareImage(spec.visual.imageUrl)
          if (prepped) return prepped.dataUrl
        }
        return nextScene()
      }
      return null
    })
  )

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAGE_W, PAGE_H] })
  doc.setProperties({ title, author: 'SabAi Sermon' })

  for (let i = 0; i < plan.slides.length; i++) {
    const spec = plan.slides[i]
    const svg = renderSlideSvg(spec, t, {
      visual: visuals[i],
      programmatic: isProgrammatic(spec.visual.type),
      slideNo: i + 1,
      title,
    })
    // Rasterize at high DPI for crisp text/edges in print.
    const png = await svgToDataUrl(svg, 1920, 1080, t.bg)
    if (i > 0) doc.addPage([PAGE_W, PAGE_H], 'landscape')
    if (png) doc.addImage(png, 'JPEG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST')
  }

  return doc.output('blob')
}
