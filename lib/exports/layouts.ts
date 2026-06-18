import type PptxGenJS from 'pptxgenjs'
import type { SlideSpec } from '@/types/slides'
import { isProgrammatic } from '@/lib/visuals'
import { mix } from '@/lib/visuals/theme'
import {
  W, H, MARGIN, INK_LIGHT, colX, colSpan,
  type DeckCtx, sizeFor, inkOn, mutedOn,
  rect, coverImage, framedImage, panel, kicker, accentRule, footer, cornerMarks, newSlide,
} from './deck'

// One renderer per named layout. Each composes a slide from the deck
// primitives: proper image at the proper spot, proper text at the proper spot,
// contrast-safe ink, one accent, generous whitespace. renderSlide() dispatches.

const dateLabel = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

function bodyText(slide: PptxGenJS.Slide, c: DeckCtx, lines: string[], x: number, y: number, w: number, h: number, color: string, size = 18, align: 'left' | 'center' = 'left') {
  if (!lines?.length) return
  slide.addText(
    lines.map((t) => ({ text: t, options: { breakLine: true, paraSpaceAfter: 8 } })),
    { x, y, w, h, fontSize: size, color, fontFace: c.sans, align, valign: 'top', lineSpacingMultiple: 1.28 }
  )
}

// ── Programmatic full-composition slides (the visual IS the slide) ──────────

function scriptureArtSlide(c: DeckCtx, spec: SlideSpec, visual: string): PptxGenJS.Slide {
  const s = newSlide(c, c.vt.bgDeep)
  s.addImage({ data: visual, x: 0, y: 0, w: W, h: H, sizing: { type: 'contain', w: W, h: H } })
  footer(c, s, spec.kicker || 'Scripture')
  return s
}

function featureVisualSlide(c: DeckCtx, spec: SlideSpec, visual: string): PptxGenJS.Slide {
  const s = newSlide(c)
  const ink = inkOn(c.t.bg)
  if (spec.kicker) kicker(c, s, MARGIN, 0.55, 8, spec.kicker)
  s.addText(spec.heading, { x: MARGIN, y: 0.95, w: W - MARGIN * 2, h: 0.9, fontSize: sizeFor(spec.heading, [[40, 30], [70, 26]], 22), color: ink, fontFace: c.serif, bold: true })
  accentRule(c, s, MARGIN, 1.85, 0.9)
  // The 16:9 visual placed large below the heading band.
  s.addImage({ data: visual, x: MARGIN, y: 2.05, w: W - MARGIN * 2, h: 4.7, sizing: { type: 'contain', w: W - MARGIN * 2, h: 4.7 } })
  footer(c, s, spec.kicker || spec.heading)
  return s
}

// ── Scene-image & text layouts ──────────────────────────────────────────────

function coverSlide(c: DeckCtx, spec: SlideSpec, visual: string | null, closing = false): PptxGenJS.Slide {
  const s = newSlide(c, c.vt.bgDeep)
  if (visual) coverImage(c, s, visual, 'bottom')
  else { rect(c, s, 0, 0, W, H, c.t.bg); rect(c, s, 0, H - 2.6, W, 2.6, c.t.bgAlt, 30) }
  cornerMarks(c, s)
  const x = MARGIN + 0.3
  if (spec.kicker) kicker(c, s, x, closing ? 4.1 : 4.35, 9, spec.kicker, c.accent)
  accentRule(c, s, x, closing ? 4.5 : 4.75, 0.95)
  s.addText(spec.heading, { x, y: closing ? 4.7 : 4.95, w: W - x - MARGIN, h: 1.7, fontSize: sizeFor(spec.heading, [[24, 50], [44, 42], [70, 34]], 30), color: INK_LIGHT, fontFace: c.serif, bold: true, shadow: visual ? { type: 'outer', color: '000000', blur: 7, offset: 3, angle: 90, opacity: 0.45 } : undefined })
  if (spec.subheading) s.addText(spec.subheading, { x, y: closing ? 6.2 : 6.5, w: W - x - MARGIN, h: 0.5, fontSize: 16, color: 'E8E3D6', fontFace: c.sans, italic: true })
  if (spec.reference && !closing) s.addText(spec.reference, { x, y: 6.95, w: 9, h: 0.4, fontSize: 14, color: c.accent, fontFace: c.serif, italic: true })
  s.addText(dateLabel(), { x: W - MARGIN - 3.5, y: H - 0.5, w: 3.5, h: 0.35, fontSize: 11, color: 'CBD3E0', fontFace: c.sans, align: 'right' })
  return s
}

function fullBleedCaptionSlide(c: DeckCtx, spec: SlideSpec, visual: string | null): PptxGenJS.Slide {
  const s = newSlide(c, c.vt.bgDeep)
  if (visual) coverImage(c, s, visual, 'bottom')
  else rect(c, s, 0, 0, W, H, c.t.bgAlt)
  const phrase = spec.heading
  s.addText(phrase, { x: MARGIN + 0.3, y: 5.3, w: W - MARGIN * 2 - 0.6, h: 1.3, fontSize: sizeFor(phrase, [[40, 34], [80, 28]], 24), color: INK_LIGHT, fontFace: c.serif, italic: true, valign: 'bottom', shadow: visual ? { type: 'outer', color: '000000', blur: 6, offset: 2, angle: 90, opacity: 0.4 } : undefined })
  if (spec.kicker) kicker(c, s, MARGIN + 0.3, 5.0, 8, spec.kicker, c.accent)
  footer(c, s, spec.kicker || '')
  return s
}

function splitSlide(c: DeckCtx, spec: SlideSpec, visual: string | null): PptxGenJS.Slide {
  const s = newSlide(c)
  const right = spec.imageSide !== 'left'
  const hasImg = !!visual
  const heading = spec.heading?.trim() || spec.kicker?.trim() || ''
  const panelW = 5.2
  const ink = inkOn(c.t.bg)
  const muted = mutedOn(c.t.bg)
  if (hasImg) {
    const ix = right ? W - panelW : 0
    s.addImage({ data: visual!, x: ix, y: 0, w: panelW, h: H, sizing: { type: 'cover', w: panelW, h: H } })
    // hairline seam in accent
    rect(c, s, right ? ix : panelW - 0.03, 0, 0.03, H, c.accent)
  }
  const tx = hasImg && right ? MARGIN : hasImg ? panelW + 0.6 : MARGIN
  const tw = hasImg ? W - panelW - 0.6 - MARGIN : W - MARGIN * 2
  if (spec.kicker) kicker(c, s, tx, 1.35, tw, spec.kicker)
  if (heading) s.addText(heading, { x: tx, y: 1.75, w: tw, h: 1.5, fontSize: sizeFor(heading, [[36, 32], [64, 27]], 22), color: ink, fontFace: c.serif, bold: true, valign: 'top' })
  accentRule(c, s, tx, 3.25, 0.8)
  bodyText(s, c, spec.body ?? [], tx, 3.55, tw, 3.2, muted, sizeFor((spec.body ?? []).join(' '), [[180, 19], [320, 17]], 15))
  footer(c, s, spec.heading)
  return s
}

function figureSlide(c: DeckCtx, spec: SlideSpec, visual: string | null): PptxGenJS.Slide {
  // Text on one side, a FRAMED content image (with caption) on the other.
  if (!visual) return splitSlide(c, spec, null)
  const s = newSlide(c)
  const ink = inkOn(c.t.bg)
  const muted = mutedOn(c.t.bg)
  const right = spec.imageSide !== 'left'
  const imgW = 5.4, imgH = 4.3
  const imgX = right ? W - MARGIN - imgW : MARGIN
  const imgY = (H - imgH) / 2 - 0.2
  framedImage(c, s, visual, imgX, imgY, imgW, imgH, spec.visual.spec)
  const tx = right ? MARGIN : imgX + imgW + 0.7
  const tw = W - imgW - MARGIN * 2 - 0.7
  if (spec.kicker) kicker(c, s, tx, 1.5, tw, spec.kicker)
  s.addText(spec.heading, { x: tx, y: 1.9, w: tw, h: 1.5, fontSize: sizeFor(spec.heading, [[36, 30], [64, 25]], 21), color: ink, fontFace: c.serif, bold: true, valign: 'top' })
  accentRule(c, s, tx, 3.35, 0.8)
  bodyText(s, c, spec.body ?? [], tx, 3.65, tw, 2.9, muted, sizeFor((spec.body ?? []).join(' '), [[160, 18], [300, 16]], 14))
  footer(c, s, spec.heading)
  return s
}

function showcaseSlide(c: DeckCtx, spec: SlideSpec, visual: string | null): PptxGenJS.Slide {
  // A large framed image as the hero subject, kicker+heading above, caption below.
  if (!visual) return fullBleedCaptionSlide(c, spec, null)
  const s = newSlide(c)
  const ink = inkOn(c.t.bg)
  if (spec.kicker) kicker(c, s, MARGIN, 0.55, 9, spec.kicker, c.accentText, 'center')
  s.addText(spec.heading, { x: MARGIN, y: 0.9, w: W - MARGIN * 2, h: 0.85, fontSize: sizeFor(spec.heading, [[40, 28], [70, 24]], 20), color: ink, fontFace: c.serif, bold: true, align: 'center' })
  const imgW = 8.6, imgH = 4.4
  framedImage(c, s, visual, (W - imgW) / 2, 2.0, imgW, imgH, spec.visual.spec || spec.subheading)
  footer(c, s, spec.heading)
  return s
}

function scriptureSlide(c: DeckCtx, spec: SlideSpec, visual: string | null): PptxGenJS.Slide {
  if (visual) return scriptureArtSlide(c, spec, visual)
  const s = newSlide(c, c.vt.bgDeep)
  s.addText('“', { x: 0.5, y: 0.2, w: 3, h: 2.4, fontSize: 200, color: c.softAccent, fontFace: c.serif, bold: true })
  const verse = spec.heading?.trim() || spec.subheading?.trim() || spec.reference || 'Scripture'
  s.addText(verse, { x: 1.6, y: 1.9, w: W - 3.2, h: 3.4, fontSize: sizeFor(verse, [[120, 30], [240, 24]], 20), color: INK_LIGHT, fontFace: c.serif, italic: true, align: 'center', valign: 'middle', lineSpacingMultiple: 1.3 })
  accentRule(c, s, W / 2 - 0.45, 5.6, 0.9)
  if (spec.reference) s.addText(spec.reference.toUpperCase(), { x: 1, y: 5.85, w: W - 2, h: 0.5, fontSize: 15, color: c.accentText, fontFace: c.sans, align: 'center', charSpacing: 4, bold: true })
  footer(c, s, spec.kicker || 'Scripture')
  return s
}

function bigStatSlide(c: DeckCtx, spec: SlideSpec, visual: string | null): PptxGenJS.Slide {
  const s = newSlide(c, visual ? c.vt.bgDeep : c.t.bg)
  if (visual) coverImage(c, s, visual, 'full')
  const ink = visual ? INK_LIGHT : inkOn(c.t.bg)
  const muted = visual ? 'D8D2C4' : mutedOn(c.t.bg)
  if (spec.kicker) kicker(c, s, MARGIN + 0.2, 1.6, 9, spec.kicker)
  const value = spec.stat?.value ?? spec.heading
  // Long multi-word values size down further so they never collide with the label.
  s.addText(value, { x: MARGIN, y: 1.9, w: W - MARGIN * 2, h: 2.8, fontSize: sizeFor(value, [[3, 150], [6, 120], [14, 80], [28, 50]], 34), color: c.accentText, fontFace: c.serif, bold: true, valign: 'top' })
  s.addText(spec.stat?.label ?? spec.subheading ?? spec.heading, { x: MARGIN + 0.2, y: 4.9, w: W - MARGIN * 2, h: 1.0, fontSize: 22, color: ink, fontFace: c.serif })
  if (spec.body?.[0]) s.addText(spec.body[0], { x: MARGIN + 0.2, y: 5.9, w: W - MARGIN * 2, h: 0.8, fontSize: 16, color: muted, fontFace: c.sans })
  footer(c, s, spec.heading)
  return s
}

function bentoSlide(c: DeckCtx, spec: SlideSpec, _visual: string | null): PptxGenJS.Slide {
  const s = newSlide(c)
  const ink = inkOn(c.t.bg)
  if (spec.kicker) kicker(c, s, MARGIN, 0.6, 9, spec.kicker)
  s.addText(spec.heading, { x: MARGIN, y: 0.95, w: W - MARGIN * 2, h: 0.8, fontSize: sizeFor(spec.heading, [[36, 30], [60, 26]], 22), color: ink, fontFace: c.serif, bold: true })
  const items = (spec.body ?? []).slice(0, 5)
  const tileInk = inkOn(c.t.panel)
  const tileMuted = mutedOn(c.t.panel)
  const top = 2.1
  // Hero tile (first) spans 6 cols full height; remaining stack on the right.
  const heroW = colSpan(6)
  const rest = items.slice(1)
  if (items[0]) {
    panel(c, s, colX(1), top, heroW, 4.5)
    s.addText('01', { x: colX(1) + 0.3, y: top + 0.25, w: 1.5, h: 0.6, fontSize: 26, color: c.accentText, fontFace: c.serif, bold: true })
    s.addText(items[0], { x: colX(1) + 0.35, y: top + 1.0, w: heroW - 0.7, h: 3.2, fontSize: sizeFor(items[0], [[80, 24], [160, 20]], 17), color: tileInk, fontFace: c.serif, valign: 'top', lineSpacingMultiple: 1.2 })
  }
  const rx = colX(7)
  const rw = colSpan(6)
  const rh = rest.length ? (4.5 - (rest.length - 1) * 0.18) / rest.length : 4.5
  rest.forEach((it, i) => {
    const y = top + i * (rh + 0.18)
    panel(c, s, rx, y, rw, rh)
    s.addText(String(i + 2).padStart(2, '0'), { x: rx + 0.25, y: y + 0.15, w: 0.9, h: 0.5, fontSize: 16, color: c.accentText, fontFace: c.serif, bold: true })
    s.addText(it, { x: rx + 1.15, y: y + 0.12, w: rw - 1.4, h: rh - 0.24, fontSize: sizeFor(it, [[70, 16], [130, 14]], 12.5), color: tileMuted, fontFace: c.sans, valign: 'middle', lineSpacingMultiple: 1.15 })
  })
  footer(c, s, spec.heading)
  return s
}

function threeColSlide(c: DeckCtx, spec: SlideSpec, _visual: string | null): PptxGenJS.Slide {
  const s = newSlide(c)
  const ink = inkOn(c.t.bg)
  const muted = mutedOn(c.t.bg)
  if (spec.kicker) kicker(c, s, MARGIN, 0.7, 9, spec.kicker, c.accent, 'center')
  s.addText(spec.heading, { x: MARGIN, y: 1.05, w: W - MARGIN * 2, h: 0.8, fontSize: sizeFor(spec.heading, [[40, 28], [70, 24]], 20), color: ink, fontFace: c.serif, bold: true, align: 'center' })
  const cols = (spec.body ?? []).slice(0, 3)
  const cw = colSpan(4)
  cols.forEach((text, i) => {
    const x = colX(1 + i * 4)
    s.addText(String(i + 1), { x, y: 2.5, w: cw, h: 0.9, fontSize: 40, color: c.accentText, fontFace: c.serif, bold: true, align: 'center' })
    accentRule(c, s, x + cw / 2 - 0.3, 3.45, 0.6)
    s.addText(text, { x, y: 3.7, w: cw, h: 2.8, fontSize: sizeFor(text, [[90, 18], [170, 16]], 14), color: muted, fontFace: c.sans, align: 'center', valign: 'top', lineSpacingMultiple: 1.25 })
  })
  footer(c, s, spec.heading)
  return s
}

function timelineSlide(c: DeckCtx, spec: SlideSpec, visual: string | null): PptxGenJS.Slide {
  if (visual) return featureVisualSlide(c, spec, visual)
  // native fallback: vertical list
  const s = newSlide(c)
  const ink = inkOn(c.t.bg)
  if (spec.kicker) kicker(c, s, MARGIN, 0.6, 9, spec.kicker)
  s.addText(spec.heading, { x: MARGIN, y: 0.95, w: W - MARGIN * 2, h: 0.8, fontSize: 26, color: ink, fontFace: c.serif, bold: true })
  bodyText(s, c, spec.body ?? [], MARGIN + 0.4, 2.2, W - MARGIN * 2 - 0.4, 4.5, mutedOn(c.t.bg), 18)
  footer(c, s, spec.heading)
  return s
}

function pullQuoteSlide(c: DeckCtx, spec: SlideSpec, visual: string | null): PptxGenJS.Slide {
  const s = newSlide(c, visual ? c.vt.bgDeep : c.t.bgAlt)
  if (visual) coverImage(c, s, visual, 'left')
  const ink = INK_LIGHT
  s.addText('“', { x: 0.5, y: 0.7, w: 3, h: 2.4, fontSize: 230, color: c.softAccent, fontFace: c.serif, bold: true })
  // Short quotes scale up and center so the slide never reads half-empty.
  const qlen = spec.heading.length
  s.addText(spec.heading, { x: 0.9, y: 1.9, w: visual ? 7.4 : 11.5, h: 3.4, fontSize: sizeFor(spec.heading, [[60, 40], [120, 32], [200, 26]], 22), color: ink, fontFace: c.serif, italic: qlen < 120, valign: 'middle', lineSpacingMultiple: 1.3 })
  if (spec.reference) s.addText(`— ${spec.reference}`, { x: 0.9, y: 5.7, w: 7, h: 0.5, fontSize: 16, color: c.accentText, fontFace: c.sans })
  footer(c, s, spec.kicker || '')
  return s
}

function twoUpSlide(c: DeckCtx, spec: SlideSpec, _visual: string | null): PptxGenJS.Slide {
  const s = newSlide(c)
  const ink = inkOn(c.t.bg)
  if (spec.kicker) kicker(c, s, MARGIN, 0.6, 9, spec.kicker, c.accent, 'center')
  s.addText(spec.heading, { x: MARGIN, y: 0.95, w: W - MARGIN * 2, h: 0.7, fontSize: 24, color: ink, fontFace: c.serif, bold: true, align: 'center' })
  const halfW = colSpan(6)
  const lx = colX(1), rxx = colX(7)
  // Distinct tones so the two halves read as an opposition, not a split rect.
  const lighter = mix(c.t.panel, '#ffffff', c.t.mode === 'dark' ? 0.16 : 0.55)
  const darker = c.t.mode === 'dark' ? c.t.bgAlt : mix(c.t.bgAlt, '#000000', 0.12)
  panel(c, s, lx, 2.0, halfW, 4.5, lighter, 0)
  panel(c, s, rxx, 2.0, halfW, 4.5, darker, 0)
  // accent seam between the two
  rect(c, s, W / 2 - 0.01, 2.0, 0.02, 4.5, c.accent)
  const lines = spec.body ?? []
  const mid = Math.ceil(lines.length / 2)
  s.addText(spec.subheading?.split('|')[0] ?? 'Before', { x: lx + 0.4, y: 2.25, w: halfW - 0.8, h: 0.6, fontSize: 20, color: inkOn(lighter), fontFace: c.serif, bold: true })
  bodyText(s, c, lines.slice(0, mid), lx + 0.4, 3.0, halfW - 0.8, 3.2, mutedOn(lighter), 16)
  s.addText(spec.subheading?.split('|')[1] ?? 'After', { x: rxx + 0.4, y: 2.25, w: halfW - 0.8, h: 0.6, fontSize: 20, color: inkOn(darker), fontFace: c.serif, bold: true })
  bodyText(s, c, lines.slice(mid), rxx + 0.4, 3.0, halfW - 0.8, 3.2, mutedOn(darker), 16)
  footer(c, s, spec.heading)
  return s
}

function sectionDividerSlide(c: DeckCtx, spec: SlideSpec, visual: string | null, index: number): PptxGenJS.Slide {
  const s = newSlide(c, c.t.bgAlt)
  if (visual) coverImage(c, s, visual, 'left')
  const num = String(index).padStart(2, '0')
  s.addText(num, { x: W - 5.6, y: 0.7, w: 5.4, h: 5.8, fontSize: 300, color: c.softAccent, fontFace: c.serif, bold: true, align: 'right' })
  rect(c, s, 0, 0, 0.18, H, c.accent)
  if (spec.kicker) kicker(c, s, MARGIN + 0.1, 2.7, 9, spec.kicker, c.accent)
  accentRule(c, s, MARGIN + 0.15, 3.15, 0.9)
  s.addText(spec.heading, { x: MARGIN + 0.1, y: 3.4, w: 8, h: 1.8, fontSize: sizeFor(spec.heading, [[30, 40], [60, 32]], 26), color: INK_LIGHT, fontFace: c.serif, bold: true, valign: 'top' })
  footer(c, s, spec.heading)
  return s
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export function renderSlide(c: DeckCtx, spec: SlideSpec, visual: string | null, sectionIndex: number): PptxGenJS.Slide {
  const prog = isProgrammatic(spec.visual.type) && !!visual
  if (spec.visual.type === 'scriptureArt' && visual) return scriptureArtSlide(c, spec, visual)
  if (prog) return featureVisualSlide(c, spec, visual!)

  switch (spec.layout) {
    case 'cover': return coverSlide(c, spec, visual)
    case 'closing': return coverSlide(c, spec, visual, true)
    case 'fullBleedCaption': return fullBleedCaptionSlide(c, spec, visual)
    case 'figure': return figureSlide(c, spec, visual)
    case 'showcase': return showcaseSlide(c, spec, visual)
    case 'scripture': return scriptureSlide(c, spec, visual)
    case 'bigStat': return bigStatSlide(c, spec, visual)
    case 'bento': return bentoSlide(c, spec, visual)
    case 'threeCol': return threeColSlide(c, spec, visual)
    case 'timelineSlide': return timelineSlide(c, spec, visual)
    case 'pullQuote': return pullQuoteSlide(c, spec, visual)
    case 'twoUp': return twoUpSlide(c, spec, visual)
    case 'sectionDivider': return sectionDividerSlide(c, spec, visual, sectionIndex)
    case 'split':
    default: return splitSlide(c, spec, visual)
  }
}
