import PptxGenJS from 'pptxgenjs'
import type { Sermon, StructuredSermon, SermonMedia, ExportTemplateId } from '@/types'
import { getTheme, SLIDE_COUNT } from '@/lib/sermon/templates'
import { prepareImage } from '@/lib/exports/image'

const W = 13.33
const H = 7.5

interface ExportOpts {
  templateId?: ExportTemplateId
  slideCount?: number
  speakerNotes?: string | null
}

/** Split plain text into chunks of ~maxChars, breaking at sentence ends. */
function chunkText(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+\n/g, '\n').trim()
  if (clean.length <= maxChars) return clean ? [clean] : []
  const sentences = clean.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (cur && (cur + ' ' + s).length > maxChars) {
      chunks.push(cur.trim())
      cur = s
    } else {
      cur = cur ? `${cur} ${s}` : s
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}


export async function generatePPT(
  sermon: Sermon,
  structured: StructuredSermon,
  media: SermonMedia[],
  opts: ExportOpts = {}
): Promise<Blob> {
  const t = getTheme(opts.templateId ?? sermon.export_template)
  const slideTarget = Math.min(SLIDE_COUNT.max, Math.max(SLIDE_COUNT.min, opts.slideCount ?? SLIDE_COUNT.default))
  const notes = opts.speakerNotes ?? null

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'SabAi Sermon'
  pptx.title = structured.title || sermon.title

  const dateLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Preload + compress images (downscaled JPEG keeps the deck a few MB even
  // with a background on every slide). Done in parallel for speed.
  const prepared = await Promise.all(
    media.map(async (item) => {
      if (!item.public_url) return null
      const p = await prepareImage(item.public_url)
      return p ? { data: p.dataUrl, caption: item.caption, kind: item.kind } : null
    })
  )
  const images = prepared.filter(Boolean) as { data: string; caption: string | null; kind: string }[]

  // Cinematic background pool — every content slide pulls a full-bleed image
  // (cycled) behind a readability scrim. Empty pool ⇒ solid theme backgrounds.
  const pool = images.map((i) => i.data)
  // Title uses pool[0]; start content cycling at pool[1] when we have variety.
  let cycleIdx = pool.length > 1 ? 1 : 0
  const nextImg = (): string | null => (pool.length ? pool[cycleIdx++ % pool.length] : null)
  // Dark themes get a lighter scrim (light text already pops); light themes
  // need a heavier wash so their dark text stays legible over photography.
  const scrimTransparency = t.mode === 'dark' ? 32 : 20

  // ── Plan content slides to approach the requested slide count ──
  const points = structured.main_points
  const nonContent =
    1 + // title
    (structured.scripture ? 1 : 0) +
    points.length + // one divider per point
    (structured.applications.length ? 1 : 0) +
    (structured.conclusion ? 1 : 0) +
    images.length +
    1 // prayer / closing
  const contentBlocks = [structured.introduction, ...points.map((p) => p.body)].filter(Boolean)
  const totalChars = contentBlocks.join(' ').length
  const contentBudget = Math.max(contentBlocks.length, slideTarget - nonContent)
  const charsPerSlide = Math.max(300, Math.ceil(totalChars / Math.max(1, contentBudget)))

  let slideNo = 0
  function footer(slide: PptxGenJS.Slide) {
    if (slideNo === 1) return
    slide.addText(structured.title || sermon.title, {
      x: 0.5, y: H - 0.42, w: 7, h: 0.3, fontSize: 10, color: t.textMuted, fontFace: t.sans, italic: true,
    })
    slide.addText(String(slideNo), {
      x: W - 1.1, y: H - 0.42, w: 0.6, h: 0.3, fontSize: 10, color: t.textMuted, fontFace: t.sans, align: 'right',
    })
  }

  function addCorners(slide: PptxGenJS.Slide, inset = 0.42, len = 0.85, thickness = 0.022) {
    const pos: [number, number, boolean, boolean][] = [
      [inset, inset, false, false],
      [W - inset - len, inset, true, false],
      [inset, H - inset, false, true],
      [W - inset - len, H - inset, true, true],
    ]
    for (const [x, y, right, bottom] of pos) {
      slide.addShape(pptx.ShapeType.rect, { x, y: bottom ? y - thickness : y, w: len, h: thickness, fill: { color: t.accent } })
      slide.addShape(pptx.ShapeType.rect, { x: right ? x + len - thickness : x, y: bottom ? y - len : y, w: thickness, h: len, fill: { color: t.accent } })
    }
  }

  function topBar(slide: PptxGenJS.Slide) {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: t.accent } })
  }

  // Full-bleed cover image + readability scrim, placed behind all content.
  function coverWithScrim(slide: PptxGenJS.Slide, data: string) {
    slide.addImage({ data, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } })
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: t.bgAlt, transparency: scrimTransparency }, line: { type: 'none' } })
    // Subtle bottom gradient anchor for footers / captions
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: H - 1.4, w: W, h: 1.4, fill: { color: t.bgAlt, transparency: 55 }, line: { type: 'none' } })
  }

  function newSlide(bg = t.bg, img?: string | null): PptxGenJS.Slide {
    const s = pptx.addSlide()
    s.background = { color: bg }
    if (img) coverWithScrim(s, img)
    slideNo += 1
    return s
  }

  function kicker(slide: PptxGenJS.Slide, label: string) {
    slide.addText(label.toUpperCase(), {
      x: 0.9, y: 0.5, w: W - 1.8, h: 0.4, fontSize: 13, color: t.accent, fontFace: t.sans, charSpacing: 4, bold: true,
    })
  }

  // ── Title slide ──
  const title = newSlide()
  if (images[0]) {
    title.background = { data: images[0].data }
    title.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: H, fill: { color: t.bgAlt, transparency: t.mode === 'light' ? 15 : 32 } })
  }
  addCorners(title)
  title.addText((sermon.tone || 'Sermon').toUpperCase(), {
    x: 1, y: 1.45, w: W - 2, h: 0.4, fontSize: 14, color: t.accent, fontFace: t.sans, align: 'center', charSpacing: 6, bold: true,
  })
  title.addText(structured.title || sermon.title, {
    x: 0.8, y: 2.1, w: W - 1.6, h: 1.9, fontSize: 46, bold: true, color: images[0] ? 'FFFFFF' : t.heading, align: 'center', fontFace: t.serif,
    shadow: images[0] ? { type: 'outer', color: '000000', blur: 8, offset: 3, angle: 90, opacity: 0.5 } : undefined,
  })
  title.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.8, y: 4.25, w: 1.6, h: 0.045, fill: { color: t.accent } })
  if (structured.scripture || sermon.scripture_ref) {
    title.addText((sermon.scripture_ref || structured.scripture).split('\n')[0], {
      x: 1, y: 4.5, w: W - 2, h: 0.6, fontSize: 20, color: t.accent, align: 'center', italic: true, fontFace: t.serif,
    })
  }
  if (structured.theme || sermon.theme) {
    title.addText(structured.theme || sermon.theme || '', {
      x: 1.5, y: 5.25, w: W - 3, h: 0.6, fontSize: 16, color: images[0] ? 'F0F0F0' : t.text, align: 'center', fontFace: t.sans,
    })
  }
  title.addText(dateLabel, { x: 1, y: H - 1.0, w: W - 2, h: 0.4, fontSize: 12, color: t.textMuted, align: 'center', fontFace: t.sans })
  title.addNotes(`${structured.title}\n${structured.scripture}\nTheme: ${structured.theme}\n\n— SPEAKER NOTES —\n${notes || '(generate speaker notes in the Export stage)'}`)

  // ── Scripture feature slide ──
  if (structured.scripture) {
    const q = newSlide(t.bg, nextImg())
    addCorners(q)
    q.addText('“', { x: 0.9, y: 0.5, w: 2, h: 1.6, fontSize: 130, color: t.accent, fontFace: t.serif, bold: true })
    q.addText(structured.scripture, {
      x: 1.6, y: 1.7, w: W - 3.2, h: 3.6, fontSize: structured.scripture.length > 260 ? 22 : 27, fontFace: t.serif,
      align: 'center', valign: 'middle', lineSpacingMultiple: 1.3, italic: true, color: t.text,
    })
    q.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.7, y: 5.8, w: 1.4, h: 0.04, fill: { color: t.accent } })
    q.addText('SCRIPTURE', { x: 1, y: 6.0, w: W - 2, h: 0.5, fontSize: 15, color: t.accent, align: 'center', fontFace: t.sans, charSpacing: 3, bold: true })
    q.addNotes(structured.scripture)
    footer(q)
  }

  // ── Introduction ──
  for (const chunk of chunkText(structured.introduction, charsPerSlide)) {
    const s = newSlide(t.bg, nextImg())
    topBar(s)
    kicker(s, 'Introduction')
    s.addText(chunk, { x: 1.1, y: 1.5, w: W - 2.6, h: 4.9, fontSize: 21, color: t.text, fontFace: t.sans, valign: 'middle', lineSpacingMultiple: 1.45 })
    s.addNotes(chunk)
    footer(s)
  }

  // ── Main points ──
  points.forEach((pt, idx) => {
    const num = String(idx + 1).padStart(2, '0')
    // Divider slide
    const d = newSlide(t.bgAlt, nextImg())
    d.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: H, fill: { color: t.accent } })
    d.addText(num, { x: W - 5.6, y: 0.8, w: 5.8, h: 5.8, fontSize: 290, color: t.panel, bold: true, fontFace: t.serif, align: 'right' })
    d.addText((structured.title || sermon.title).toUpperCase(), { x: 0.9, y: 0.55, w: W - 2, h: 0.35, fontSize: 12, color: t.accent, fontFace: t.sans, charSpacing: 4 })
    d.addText(`PART ${num} · OF ${String(points.length).padStart(2, '0')}`, { x: 0.9, y: 2.75, w: 6, h: 0.4, fontSize: 13, color: t.accent, fontFace: t.sans, charSpacing: 5, bold: true })
    d.addText(pt.heading, { x: 0.9, y: 3.4, w: W - 2.4, h: 1.7, fontSize: 38, bold: true, color: t.heading, fontFace: t.serif, valign: 'top' })
    d.addShape(pptx.ShapeType.rect, { x: 0.95, y: 3.28, w: 1.4, h: 0.04, fill: { color: t.accent } })
    d.addNotes(`Point ${idx + 1} of ${points.length}: ${pt.heading}\n\n${pt.body}`)
    footer(d)

    if (pt.scripture) {
      const q = newSlide(t.bg, nextImg())
      addCorners(q, 0.45, 0.7)
      q.addText(`“${pt.scripture}”`, { x: 1.4, y: 2.3, w: W - 2.8, h: 2.8, fontSize: 26, italic: true, color: t.text, align: 'center', valign: 'middle', fontFace: t.serif, lineSpacingMultiple: 1.3 })
      q.addNotes(pt.scripture)
      footer(q)
    }

    for (const chunk of chunkText(pt.body, charsPerSlide)) {
      const s = newSlide(t.bg, nextImg())
      topBar(s)
      kicker(s, pt.heading)
      s.addText(chunk, { x: 1.1, y: 1.5, w: W - 2.6, h: 4.9, fontSize: 21, color: t.text, fontFace: t.sans, valign: 'middle', lineSpacingMultiple: 1.45 })
      s.addNotes(chunk)
      footer(s)
    }
  })

  // ── Applications (bulleted, max 5 / slide) ──
  for (let i = 0; i < structured.applications.length; i += 5) {
    const slice = structured.applications.slice(i, i + 5)
    const s = newSlide(t.bg, nextImg())
    topBar(s)
    kicker(s, structured.applications.length > 5 ? `Application (${Math.floor(i / 5) + 1})` : 'Application')
    s.addText(
      slice.map((a) => ({ text: a, options: { bullet: { code: '2022', color: t.accent, indent: 24 }, breakLine: true, color: t.text } })),
      { x: 1.1, y: 1.35, w: W - 2.4, h: 5.1, fontSize: 22, fontFace: t.sans, valign: 'top', lineSpacingMultiple: 1.4, paraSpaceAfter: 14 }
    )
    s.addNotes(slice.map((a) => `• ${a}`).join('\n'))
    footer(s)
  }

  // ── Conclusion ──
  if (structured.conclusion) {
    for (const chunk of chunkText(structured.conclusion, charsPerSlide + 120)) {
      const s = newSlide(t.bg, nextImg())
      topBar(s)
      kicker(s, 'Conclusion')
      s.addText(chunk, { x: 1.1, y: 1.5, w: W - 2.6, h: 4.9, fontSize: 22, color: t.text, fontFace: t.sans, valign: 'middle', lineSpacingMultiple: 1.5 })
      s.addNotes(chunk)
      footer(s)
    }
  }

  // Images appear as full-bleed backgrounds on every content slide above, so
  // no separate gallery slides are added — that keeps the deck tight and every
  // visual purposeful.

  // ── Prayer / closing ──
  const close = newSlide(t.bgAlt)
  addCorners(close)
  close.addText('Closing Prayer', { x: 1, y: 1.0, w: W - 2, h: 0.5, fontSize: 16, color: t.accent, align: 'center', fontFace: t.sans, charSpacing: 4, bold: true })
  if (structured.prayer) {
    close.addText(structured.prayer, { x: 1.6, y: 1.8, w: W - 3.2, h: 3.4, fontSize: 22, italic: true, color: t.text, align: 'center', valign: 'middle', fontFace: t.serif, lineSpacingMultiple: 1.4 })
  }
  close.addText('Amen', { x: 1, y: 5.6, w: W - 2, h: 1.0, fontSize: 44, bold: true, color: t.accent, align: 'center', fontFace: t.serif, italic: true })
  close.addNotes(structured.prayer || 'Closing — altar call, prayer, or benediction.')
  footer(close)

  return (await pptx.write({ outputType: 'blob' })) as Blob
}
