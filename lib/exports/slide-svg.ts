// Faithful SVG port of the pptxgenjs deck layouts (lib/exports/layouts.ts) so a
// PDF deck can be composited slide-for-slide from the SAME plan and read
// identically to the PowerPoint. Every layout here mirrors its PPT twin's
// composition, coordinates, colors, and type tiers — only the output medium
// differs. PPT works in a 13.33x7.5in canvas; we render to a 1280x720 (16:9)
// SVG, converting inches→px at 96px/in (PX) and points→px at 96/72 (PT). The
// result is a single self-contained <svg> string with crisp <text> and embedded
// data-URL images only (no external resources).

import type { SlideSpec } from '@/types/slides'
import type { ExportTheme } from '@/lib/sermon/templates'
import { luminance } from '@/lib/sermon/templates'
import { getVisualTheme, mix } from '@/lib/visuals/theme'
import { esc, wrap } from '@/lib/visuals/svg'

export interface SlideSvgOpts {
  visual?: string | null
  programmatic?: boolean
  slideNo: number
  title: string
}

// ── Scale: PPT inches → px (96/in), PPT points → px (96/72) ──────────────────
const PX = 96
const PT = 96 / 72
const W = 1280 // 13.33in * 96 ≈ 1280
const H = 720 // 7.5in * 96
const MARGIN = 0.7 * PX // 67.2
const GUTTER = 0.22 * PX
const COLW = (W - MARGIN * 2 - GUTTER * 11) / 12
const INK_LIGHT = '#F7F5EF' // editorial off-white (never pure #fff)

const colX = (n: number) => MARGIN + (n - 1) * (COLW + GUTTER)
const colSpan = (span: number) => span * COLW + (span - 1) * GUTTER

const hh = (hex: string) => (hex.startsWith('#') ? hex : `#${hex}`)

// ── Contrast helpers (mirror deck.ts inkOn/mutedOn) ──────────────────────────
function inkOn(bgHex: string): string {
  return luminance(bgHex) > 0.45 ? '#241B10' : INK_LIGHT
}
function mutedOn(bgHex: string): string {
  return luminance(bgHex) > 0.45 ? '#6B5E48' : '#C4CBD8'
}

/** Pick a font size (px) from [maxLen, ptSize] tiers based on text length. */
function sizeFor(text: string, tiers: Array<[number, number]>, fallback: number): number {
  const len = (text ?? '').length
  for (const [maxLen, size] of tiers) if (len <= maxLen) return size * PT
  return fallback * PT
}

/** Per-slide token bundle derived from the export theme (mirrors DeckCtx). */
interface Ctx {
  t: ExportTheme
  serif: string
  sans: string
  bg: string
  bgAlt: string
  panel: string
  accent: string // raw accent for FILLS
  accentText: string // darkened accent for small TEXT on light themes
  softAccent: string // solid soft accent for ornamental glyphs/numerals
  bgDeep: string
}

function ctxFor(t: ExportTheme): Ctx {
  const vt = getVisualTheme(t)
  return {
    t,
    serif: t.serif,
    sans: t.sans,
    bg: hh(t.bg),
    bgAlt: hh(t.bgAlt),
    panel: hh(t.panel),
    accent: hh(t.accent),
    accentText: t.mode === 'light' ? mix(t.accent, '#000000', 0.35) : hh(t.accent),
    softAccent: mix(t.accent, t.bgAlt, 0.7),
    bgDeep: hh(vt.bgDeep),
  }
}

const serifFam = (c: Ctx) => `${c.serif}, Georgia, 'Times New Roman', serif`
const sansFam = (c: Ctx) => `${c.sans}, 'Helvetica Neue', Arial, sans-serif`

const dateLabel = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

// ── Low-level emitters ───────────────────────────────────────────────────────

function rect(x: number, y: number, w: number, h: number, fill: string, opacity = 1, rx = 0): string {
  const r = rx ? ` rx="${rx}" ry="${rx}"` : ''
  const o = opacity < 1 ? ` opacity="${opacity}"` : ''
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${o}${r}/>`
}

function strokeRect(x: number, y: number, w: number, h: number, stroke: string, sw = 1.25): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`
}

/** A single line of text. valign mimics pptx by anchoring the baseline. */
function textLine(
  x: number,
  y: number,
  s: string,
  opts: {
    size: number
    fill: string
    family: string
    weight?: 'normal' | 'bold'
    italic?: boolean
    anchor?: 'start' | 'middle' | 'end'
    spacing?: number
    upper?: boolean
    shadow?: boolean
  }
): string {
  const txt = opts.upper ? esc(s).toUpperCase() : esc(s)
  const a = opts.anchor ? ` text-anchor="${opts.anchor}"` : ''
  const w = opts.weight === 'bold' ? ' font-weight="700"' : ''
  const it = opts.italic ? ' font-style="italic"' : ''
  const ls = opts.spacing ? ` letter-spacing="${opts.spacing}"` : ''
  const filt = opts.shadow ? ` filter="url(#txtShadow)"` : ''
  return `<text x="${x}" y="${y}" font-family="${opts.family}" font-size="${opts.size}" fill="${opts.fill}"${w}${it}${a}${ls}${filt}>${txt}</text>`
}

/** Multi-line block. `top` is the baseline y of the FIRST line (top-anchored). */
function textBlock(
  x: number,
  top: number,
  lines: string[],
  opts: {
    size: number
    fill: string
    family: string
    weight?: 'normal' | 'bold'
    italic?: boolean
    anchor?: 'start' | 'middle' | 'end'
    lineH?: number
    spacing?: number
  }
): string {
  const lineH = opts.lineH ?? opts.size * 1.28
  return lines
    .map((ln, i) => textLine(x, top + i * lineH, ln, opts))
    .join('')
}

/** Vertically-centered multi-line block around cy. */
function centeredBlock(
  cx: number,
  cy: number,
  lines: string[],
  opts: {
    size: number
    fill: string
    family: string
    weight?: 'normal' | 'bold'
    italic?: boolean
    anchor?: 'start' | 'middle' | 'end'
    lineH?: number
  }
): string {
  const lineH = opts.lineH ?? opts.size * 1.3
  const total = (lines.length - 1) * lineH
  const start = cy - total / 2 + opts.size * 0.34
  return lines.map((ln, i) => textLine(cx, start + i * lineH, ln, opts)).join('')
}

// ── Composed primitives (mirror deck.ts) ─────────────────────────────────────

function image(href: string, x: number, y: number, w: number, h: number, fit: 'slice' | 'meet', id?: string): string {
  const par = ` preserveAspectRatio="xMidYMid ${fit}"`
  const clip = id ? ` clip-path="url(#${id})"` : ''
  return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}"${par}${clip}/>`
}

/** Full-bleed cover image + readability scrim, anchored where text sits. The
 *  scrim is always DARK (even on light themes) so off-white text stays legible. */
function coverImage(c: Ctx, href: string, anchor: 'bottom' | 'full' | 'left'): string {
  const scrim = c.t.mode === 'dark' ? c.bgAlt : mix(c.t.text, '#000000', 0.25)
  let out = image(href, 0, 0, W, H, 'slice')
  if (anchor === 'full') {
    out += rect(0, 0, W, H, scrim, 0.38)
  } else if (anchor === 'bottom') {
    out += rect(0, 0, W, H, scrim, 0.34)
    out += rect(0, H - 3.4 * PX, W, 3.4 * PX, scrim, 0.16)
    out += rect(0, H - 1.7 * PX, W, 1.7 * PX, scrim, 0.04)
  } else {
    out += rect(0, 0, W, H, scrim, 0.3)
    out += rect(0, 0, W * 0.62, H, scrim, 0.12)
  }
  return out
}

/** A FRAMED content image: soft drop shadow, the photo (cover-fit, clipped), a
 *  thin soft-accent hairline frame, and an optional italic caption beneath. */
function framedImage(c: Ctx, href: string, x: number, y: number, w: number, h: number, caption?: string): string {
  const id = `frame${Math.round(x)}_${Math.round(y)}`
  const shadow = c.t.mode === 'dark' ? '#000000' : '#6B5E48'
  let out = rect(x + 0.07 * PX, y + 0.09 * PX, w, h, shadow, 0.36)
  out += `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`
  out += image(href, x, y, w, h, 'slice', id)
  out += strokeRect(x, y, w, h, c.softAccent, 1.25)
  if (caption?.trim()) {
    out += textLine(x + w / 2, y + h + 0.34 * PX, caption.trim(), {
      size: 11.5 * PT,
      fill: c.t.mode === 'dark' ? '#C4CBD8' : '#6B5E48',
      family: serifFam(c),
      italic: true,
      anchor: 'middle',
    })
  }
  return out
}

/** Rounded panel behind a text block. */
function panel(x: number, y: number, w: number, h: number, fill: string, opacity = 0.86): string {
  return rect(x, y, w, h, fill, opacity, 0.12 * PX)
}

function kicker(c: Ctx, x: number, y: number, text?: string, color?: string, align: 'start' | 'middle' = 'start'): string {
  if (!text?.trim()) return ''
  return textLine(x, y + 0.24 * PX, text, {
    size: 12.5 * PT,
    fill: color ?? c.accentText,
    family: sansFam(c),
    weight: 'bold',
    spacing: 4,
    upper: true,
    anchor: align,
  })
}

function accentRule(c: Ctx, x: number, y: number, w = 0.85 * PX, th = 0.035 * PX): string {
  return rect(x, y, w, th, c.accent)
}

/** Footer: slide title (muted, italic, left) + slide number (right). */
function footer(c: Ctx, title: string, slideNo: number): string {
  const muted = mutedOn(c.bg)
  const y = H - 0.46 * PX + 0.22 * PX
  return (
    textLine(MARGIN, y, title ?? '', { size: 9.5 * PT, fill: muted, family: sansFam(c), italic: true }) +
    textLine(W - MARGIN, y, String(slideNo), { size: 9.5 * PT, fill: muted, family: sansFam(c), anchor: 'end' })
  )
}

/** Subtle corner registration marks. */
function cornerMarks(c: Ctx, inset = 0.4 * PX, len = 0.5 * PX, th = 0.02 * PX): string {
  const pos: Array<[number, number, boolean, boolean]> = [
    [inset, inset, false, false],
    [W - inset - len, inset, true, false],
    [inset, H - inset, false, true],
    [W - inset - len, H - inset, true, true],
  ]
  let out = ''
  for (const [x, y, right, bottom] of pos) {
    out += rect(x, bottom ? y - th : y, len, th, c.accent)
    out += rect(right ? x + len - th : x, bottom ? y - len : y, th, len, c.accent)
  }
  return out
}

/** Multi-line body, wrapped + sized down, top-anchored at y. */
function bodyText(c: Ctx, lines: string[], x: number, y: number, w: number, color: string, size: number, anchor: 'start' | 'middle' = 'start'): string {
  if (!lines?.length) return ''
  const charW = size * 0.52
  const maxChars = Math.max(8, Math.floor(w / charW))
  const lineH = size * 1.28
  const paraGap = size * 0.45
  let cy = y + size * 0.85
  let out = ''
  for (const raw of lines) {
    const wrapped = wrap(raw || '', maxChars)
    for (const ln of wrapped) {
      out += textLine(x, cy, ln, { size, fill: color, family: sansFam(c), anchor })
      cy += lineH
    }
    cy += paraGap
  }
  return out
}

// ── SVG document scaffold ────────────────────────────────────────────────────

function svgDoc(bg: string, body: string): string {
  return (
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
    `<defs>` +
    `<filter id="txtShadow" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feDropShadow dx="3" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.45"/>` +
    `</filter>` +
    `</defs>` +
    rect(0, 0, W, H, bg) +
    body +
    `</svg>`
  )
}

// ── Programmatic full-composition (the visual IS the slide) ──────────────────

function programmaticSlide(c: Ctx, spec: SlideSpec, visual: string, opts: SlideSvgOpts): string {
  // The label-bearing visual (scriptureArt/timeline/map/route/diagram) placed
  // CONTAIN-fit centered on a bgAlt canvas, plus a quiet footer.
  let body = image(visual, 0, 0, W, H, 'meet')
  body += footer(c, spec.kicker || opts.title || 'Scripture', opts.slideNo)
  return svgDoc(c.bgDeep, body)
}

// ── Scene-image & text layouts ───────────────────────────────────────────────

function coverSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts, closing = false): string {
  let body = ''
  if (visual) body += coverImage(c, visual, 'bottom')
  else {
    body += rect(0, 0, W, H, c.bg)
    body += rect(0, H - 2.6 * PX, W, 2.6 * PX, c.bgAlt, 0.7)
  }
  body += cornerMarks(c)
  const x = MARGIN + 0.3 * PX
  body += kicker(c, x, (closing ? 4.1 : 4.35) * PX, spec.kicker, c.accent)
  body += accentRule(c, x, (closing ? 4.5 : 4.75) * PX, 0.95 * PX)
  const heading = spec.heading?.trim() || spec.kicker?.trim() || ''
  const hSize = sizeFor(heading, [[24, 50], [44, 42], [70, 34]], 30)
  const hMax = Math.max(10, Math.floor((W - x - MARGIN) / (hSize * 0.52)))
  body += textBlock(x, (closing ? 4.7 : 4.95) * PX + hSize * 0.85, wrap(heading, hMax), {
    size: hSize,
    fill: INK_LIGHT,
    family: serifFam(c),
    weight: 'bold',
    lineH: hSize * 1.12,
  })
  if (spec.subheading) {
    body += textLine(x, (closing ? 6.2 : 6.5) * PX + 0.3 * PX, spec.subheading, {
      size: 16 * PT,
      fill: '#E8E3D6',
      family: sansFam(c),
      italic: true,
    })
  }
  if (spec.reference && !closing) {
    body += textLine(x, 6.95 * PX + 0.28 * PX, spec.reference, {
      size: 14 * PT,
      fill: c.accent,
      family: serifFam(c),
      italic: true,
    })
  }
  body += textLine(W - MARGIN, H - 0.5 * PX + 0.26 * PX, dateLabel(), {
    size: 11 * PT,
    fill: '#CBD3E0',
    family: sansFam(c),
    anchor: 'end',
  })
  return svgDoc(c.bgDeep, body)
}

function fullBleedCaptionSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  let body = ''
  if (visual) body += coverImage(c, visual, 'bottom')
  else body += rect(0, 0, W, H, c.bgAlt)
  const phrase = spec.heading?.trim() || ''
  const size = sizeFor(phrase, [[40, 34], [80, 28]], 24)
  const x = MARGIN + 0.3 * PX
  const w = W - MARGIN * 2 - 0.6 * PX
  const maxChars = Math.max(12, Math.floor(w / (size * 0.5)))
  const lines = wrap(phrase, maxChars)
  body += kicker(c, x, 5.0 * PX, spec.kicker, c.accent)
  // valign bottom: last line sits near y=6.6in.
  const lineH = size * 1.2
  const bottom = 6.6 * PX
  const top = bottom - (lines.length - 1) * lineH
  lines.forEach((ln, i) => {
    body += textLine(x, top + i * lineH, ln, { size, fill: INK_LIGHT, family: serifFam(c), italic: true, shadow: !!visual })
  })
  return svgDoc(c.bgDeep, body)
}

function splitSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  let body = rect(0, 0, W, H, c.bg)
  const right = spec.imageSide !== 'left'
  const hasImg = !!visual
  const heading = spec.heading?.trim() || spec.kicker?.trim() || ''
  const panelW = 5.2 * PX
  const ink = inkOn(c.bg)
  const muted = mutedOn(c.bg)
  if (hasImg) {
    const ix = right ? W - panelW : 0
    body += image(visual!, ix, 0, panelW, H, 'slice')
    body += rect(right ? ix : panelW - 0.03 * PX, 0, 0.03 * PX, H, c.accent)
  }
  const tx = hasImg && right ? MARGIN : hasImg ? panelW + 0.6 * PX : MARGIN
  const tw = hasImg ? W - panelW - 0.6 * PX - MARGIN : W - MARGIN * 2
  body += kicker(c, tx, 1.35 * PX, spec.kicker)
  if (heading) {
    const hSize = sizeFor(heading, [[36, 32], [64, 27]], 22)
    const hMax = Math.max(10, Math.floor(tw / (hSize * 0.52)))
    body += textBlock(tx, 1.75 * PX + hSize * 0.85, wrap(heading, hMax), {
      size: hSize,
      fill: ink,
      family: serifFam(c),
      weight: 'bold',
      lineH: hSize * 1.12,
    })
  }
  body += accentRule(c, tx, 3.25 * PX, 0.8 * PX)
  body += bodyText(c, spec.body ?? [], tx, 3.55 * PX, tw, muted, sizeFor((spec.body ?? []).join(' '), [[180, 19], [320, 17]], 15))
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(c.bg, body)
}

function figureSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  if (!visual) return splitSlide(c, spec, null, opts)
  let body = rect(0, 0, W, H, c.bg)
  const ink = inkOn(c.bg)
  const muted = mutedOn(c.bg)
  const right = spec.imageSide !== 'left'
  const imgW = 5.4 * PX
  const imgH = 4.3 * PX
  const imgX = right ? W - MARGIN - imgW : MARGIN
  const imgY = (H - imgH) / 2 - 0.2 * PX
  body += framedImage(c, visual, imgX, imgY, imgW, imgH, spec.visual?.spec)
  const tx = right ? MARGIN : imgX + imgW + 0.7 * PX
  const tw = W - imgW - MARGIN * 2 - 0.7 * PX
  body += kicker(c, tx, 1.5 * PX, spec.kicker)
  const heading = spec.heading?.trim() || ''
  const hSize = sizeFor(heading, [[36, 30], [64, 25]], 21)
  const hMax = Math.max(10, Math.floor(tw / (hSize * 0.52)))
  body += textBlock(tx, 1.9 * PX + hSize * 0.85, wrap(heading, hMax), {
    size: hSize,
    fill: ink,
    family: serifFam(c),
    weight: 'bold',
    lineH: hSize * 1.12,
  })
  body += accentRule(c, tx, 3.35 * PX, 0.8 * PX)
  body += bodyText(c, spec.body ?? [], tx, 3.65 * PX, tw, muted, sizeFor((spec.body ?? []).join(' '), [[160, 18], [300, 16]], 14))
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(c.bg, body)
}

function showcaseSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  if (!visual) return fullBleedCaptionSlide(c, spec, null, opts)
  let body = rect(0, 0, W, H, c.bg)
  const ink = inkOn(c.bg)
  body += kicker(c, W / 2, 0.55 * PX, spec.kicker, c.accentText, 'middle')
  const heading = spec.heading?.trim() || ''
  const hSize = sizeFor(heading, [[40, 28], [70, 24]], 20)
  body += textLine(W / 2, 0.9 * PX + hSize * 0.85, heading, {
    size: hSize,
    fill: ink,
    family: serifFam(c),
    weight: 'bold',
    anchor: 'middle',
  })
  const imgW = 8.6 * PX
  const imgH = 4.4 * PX
  body += framedImage(c, visual, (W - imgW) / 2, 2.0 * PX, imgW, imgH, spec.visual?.spec || spec.subheading)
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(c.bg, body)
}

function scriptureSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  if (visual) return programmaticSlide(c, spec, visual, opts)
  let body = rect(0, 0, W, H, c.bgDeep)
  // big low-opacity quote glyph
  body += textLine(0.5 * PX, 0.2 * PX + 200 * PT * 0.78, '“', {
    size: 200 * PT,
    fill: c.softAccent,
    family: serifFam(c),
    weight: 'bold',
  })
  const verse = spec.heading?.trim() || spec.subheading?.trim() || spec.reference || 'Scripture'
  const vSize = sizeFor(verse, [[120, 30], [240, 24]], 20)
  const vMax = Math.max(16, Math.floor((W - 3.2 * PX) / (vSize * 0.5)))
  body += centeredBlock(W / 2, 3.6 * PX, wrap(verse, vMax), {
    size: vSize,
    fill: INK_LIGHT,
    family: serifFam(c),
    italic: true,
    anchor: 'middle',
    lineH: vSize * 1.3,
  })
  body += accentRule(c, W / 2 - 0.45 * PX, 5.6 * PX, 0.9 * PX)
  if (spec.reference) {
    body += textLine(W / 2, 5.85 * PX + 0.3 * PX, spec.reference.toUpperCase(), {
      size: 15 * PT,
      fill: c.accentText,
      family: sansFam(c),
      weight: 'bold',
      spacing: 4,
      anchor: 'middle',
    })
  }
  body += footer(c, spec.kicker || opts.title || 'Scripture', opts.slideNo)
  return svgDoc(c.bgDeep, body)
}

function bigStatSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  const bg = visual ? c.bgDeep : c.bg
  let body = rect(0, 0, W, H, bg)
  if (visual) body += coverImage(c, visual, 'full')
  const ink = visual ? INK_LIGHT : inkOn(c.bg)
  const muted = visual ? '#D8D2C4' : mutedOn(c.bg)
  body += kicker(c, MARGIN + 0.2 * PX, 1.6 * PX, spec.kicker)
  const value = spec.stat?.value ?? spec.heading?.trim() ?? ''
  const vSize = sizeFor(value, [[3, 150], [6, 120], [14, 80], [28, 50]], 34)
  const vMax = Math.max(3, Math.floor((W - MARGIN * 2) / (vSize * 0.56)))
  body += textBlock(MARGIN, 1.9 * PX + vSize * 0.85, wrap(value, vMax), {
    size: vSize,
    fill: c.accentText,
    family: serifFam(c),
    weight: 'bold',
    lineH: vSize * 1.05,
  })
  body += textLine(MARGIN + 0.2 * PX, 4.9 * PX + 22 * PT * 0.85, spec.stat?.label ?? spec.subheading ?? spec.heading ?? '', {
    size: 22 * PT,
    fill: ink,
    family: serifFam(c),
  })
  if (spec.body?.[0]) {
    body += textLine(MARGIN + 0.2 * PX, 5.9 * PX + 16 * PT * 0.85, spec.body[0], {
      size: 16 * PT,
      fill: muted,
      family: sansFam(c),
    })
  }
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(bg, body)
}

function bentoSlide(c: Ctx, spec: SlideSpec, opts: SlideSvgOpts): string {
  let body = rect(0, 0, W, H, c.bg)
  const ink = inkOn(c.bg)
  body += kicker(c, MARGIN, 0.6 * PX, spec.kicker)
  const heading = spec.heading?.trim() || ''
  const hSize = sizeFor(heading, [[36, 30], [60, 26]], 22)
  body += textLine(MARGIN, 0.95 * PX + hSize * 0.85, heading, {
    size: hSize,
    fill: ink,
    family: serifFam(c),
    weight: 'bold',
  })
  const items = (spec.body ?? []).slice(0, 5)
  const tileInk = inkOn(c.panel)
  const tileMuted = mutedOn(c.panel)
  const top = 2.1 * PX
  const heroW = colSpan(6)
  const rest = items.slice(1)
  if (items[0]) {
    body += panel(colX(1), top, heroW, 4.5 * PX, c.panel)
    body += textLine(colX(1) + 0.3 * PX, top + 0.25 * PX + 26 * PT * 0.85, '01', {
      size: 26 * PT,
      fill: c.accentText,
      family: serifFam(c),
      weight: 'bold',
    })
    const heroSize = sizeFor(items[0], [[80, 24], [160, 20]], 17)
    const heroMax = Math.max(12, Math.floor((heroW - 0.7 * PX) / (heroSize * 0.52)))
    body += textBlock(colX(1) + 0.35 * PX, top + 1.0 * PX + heroSize * 0.85, wrap(items[0], heroMax), {
      size: heroSize,
      fill: tileInk,
      family: serifFam(c),
      lineH: heroSize * 1.2,
    })
  }
  const rx = colX(7)
  const rw = colSpan(6)
  const rh = rest.length ? (4.5 * PX - (rest.length - 1) * 0.18 * PX) / rest.length : 4.5 * PX
  rest.forEach((it, i) => {
    const y = top + i * (rh + 0.18 * PX)
    body += panel(rx, y, rw, rh, c.panel)
    body += textLine(rx + 0.25 * PX, y + 0.15 * PX + 16 * PT * 0.85, String(i + 2).padStart(2, '0'), {
      size: 16 * PT,
      fill: c.accentText,
      family: serifFam(c),
      weight: 'bold',
    })
    const tSize = sizeFor(it, [[70, 16], [130, 14]], 12.5)
    const tMax = Math.max(10, Math.floor((rw - 1.4 * PX) / (tSize * 0.52)))
    // left-aligned, vertically centered within the tile (PPT valign: 'middle').
    body += centeredBlock(rx + 1.15 * PX, y + rh / 2, wrap(it, tMax), {
      size: tSize,
      fill: tileMuted,
      family: sansFam(c),
      anchor: 'start',
      lineH: tSize * 1.15,
    })
  })
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(c.bg, body)
}

function threeColSlide(c: Ctx, spec: SlideSpec, opts: SlideSvgOpts): string {
  let body = rect(0, 0, W, H, c.bg)
  const ink = inkOn(c.bg)
  const muted = mutedOn(c.bg)
  body += kicker(c, W / 2, 0.7 * PX, spec.kicker, c.accent, 'middle')
  const heading = spec.heading?.trim() || ''
  const hSize = sizeFor(heading, [[40, 28], [70, 24]], 20)
  body += textLine(W / 2, 1.05 * PX + hSize * 0.85, heading, {
    size: hSize,
    fill: ink,
    family: serifFam(c),
    weight: 'bold',
    anchor: 'middle',
  })
  const cols = (spec.body ?? []).slice(0, 3)
  const cw = colSpan(4)
  cols.forEach((text, i) => {
    const x = colX(1 + i * 4)
    const cx = x + cw / 2
    body += textLine(cx, 2.5 * PX + 40 * PT * 0.85, String(i + 1), {
      size: 40 * PT,
      fill: c.accentText,
      family: serifFam(c),
      weight: 'bold',
      anchor: 'middle',
    })
    body += accentRule(c, cx - 0.3 * PX, 3.45 * PX, 0.6 * PX)
    const tSize = sizeFor(text, [[90, 18], [170, 16]], 14)
    const tMax = Math.max(10, Math.floor(cw / (tSize * 0.5)))
    body += textBlock(cx, 3.7 * PX + tSize * 0.85, wrap(text, tMax), {
      size: tSize,
      fill: muted,
      family: sansFam(c),
      anchor: 'middle',
      lineH: tSize * 1.25,
    })
  })
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(c.bg, body)
}

function timelineSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  if (visual) return programmaticSlide(c, spec, visual, opts)
  let body = rect(0, 0, W, H, c.bg)
  const ink = inkOn(c.bg)
  body += kicker(c, MARGIN, 0.6 * PX, spec.kicker)
  const heading = spec.heading?.trim() || ''
  body += textLine(MARGIN, 0.95 * PX + 26 * PT * 0.85, heading, {
    size: 26 * PT,
    fill: ink,
    family: serifFam(c),
    weight: 'bold',
  })
  body += bodyText(c, spec.body ?? [], MARGIN + 0.4 * PX, 2.2 * PX, W - MARGIN * 2 - 0.4 * PX, mutedOn(c.bg), 18 * PT)
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(c.bg, body)
}

function pullQuoteSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  const bg = visual ? c.bgDeep : c.bgAlt
  let body = rect(0, 0, W, H, bg)
  if (visual) body += coverImage(c, visual, 'left')
  const ink = INK_LIGHT
  body += textLine(0.5 * PX, 0.7 * PX + 230 * PT * 0.78, '“', {
    size: 230 * PT,
    fill: c.softAccent,
    family: serifFam(c),
    weight: 'bold',
  })
  const quote = spec.heading?.trim() || ''
  const qlen = quote.length
  const qSize = sizeFor(quote, [[60, 40], [120, 32], [200, 26]], 22)
  const qw = (visual ? 7.4 : 11.5) * PX
  const qMax = Math.max(14, Math.floor(qw / (qSize * 0.5)))
  body += centeredBlock(0.9 * PX + qw / 2, 3.6 * PX, wrap(quote, qMax), {
    size: qSize,
    fill: ink,
    family: serifFam(c),
    italic: qlen < 120,
    anchor: 'middle',
    lineH: qSize * 1.3,
  })
  if (spec.reference) {
    body += textLine(0.9 * PX, 5.7 * PX + 16 * PT * 0.85, `— ${spec.reference}`, {
      size: 16 * PT,
      fill: c.accentText,
      family: sansFam(c),
    })
  }
  body += footer(c, spec.kicker || opts.title || '', opts.slideNo)
  return svgDoc(bg, body)
}

function twoUpSlide(c: Ctx, spec: SlideSpec, opts: SlideSvgOpts): string {
  let body = rect(0, 0, W, H, c.bg)
  const ink = inkOn(c.bg)
  body += kicker(c, W / 2, 0.6 * PX, spec.kicker, c.accent, 'middle')
  const heading = spec.heading?.trim() || ''
  body += textLine(W / 2, 0.95 * PX + 24 * PT * 0.85, heading, {
    size: 24 * PT,
    fill: ink,
    family: serifFam(c),
    weight: 'bold',
    anchor: 'middle',
  })
  const halfW = colSpan(6)
  const lx = colX(1)
  const rxx = colX(7)
  const lighter = mix(c.t.panel, '#ffffff', c.t.mode === 'dark' ? 0.16 : 0.55)
  const darker = c.t.mode === 'dark' ? c.bgAlt : mix(c.t.bgAlt, '#000000', 0.12)
  body += rect(lx, 2.0 * PX, halfW, 4.5 * PX, lighter)
  body += rect(rxx, 2.0 * PX, halfW, 4.5 * PX, darker)
  body += rect(W / 2 - 0.01 * PX, 2.0 * PX, 0.02 * PX, 4.5 * PX, c.accent)
  const lines = spec.body ?? []
  const mid = Math.ceil(lines.length / 2)
  const beforeLabel = spec.subheading?.split('|')[0] ?? 'Before'
  const afterLabel = spec.subheading?.split('|')[1] ?? 'After'
  body += textLine(lx + 0.4 * PX, 2.25 * PX + 20 * PT * 0.85, beforeLabel, {
    size: 20 * PT,
    fill: inkOn(lighter),
    family: serifFam(c),
    weight: 'bold',
  })
  body += bodyText(c, lines.slice(0, mid), lx + 0.4 * PX, 3.0 * PX, halfW - 0.8 * PX, mutedOn(lighter), 16 * PT)
  body += textLine(rxx + 0.4 * PX, 2.25 * PX + 20 * PT * 0.85, afterLabel, {
    size: 20 * PT,
    fill: inkOn(darker),
    family: serifFam(c),
    weight: 'bold',
  })
  body += bodyText(c, lines.slice(mid), rxx + 0.4 * PX, 3.0 * PX, halfW - 0.8 * PX, mutedOn(darker), 16 * PT)
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(c.bg, body)
}

function sectionDividerSlide(c: Ctx, spec: SlideSpec, visual: string | null, opts: SlideSvgOpts): string {
  let body = rect(0, 0, W, H, c.bgAlt)
  if (visual) body += coverImage(c, visual, 'left')
  const num = String(opts.slideNo).padStart(2, '0')
  // huge low-opacity accent numeral, right-aligned
  body += textLine(W - 0.2 * PX, 0.7 * PX + 300 * PT * 0.78, num, {
    size: 300 * PT,
    fill: c.softAccent,
    family: serifFam(c),
    weight: 'bold',
    anchor: 'end',
  })
  body += rect(0, 0, 0.18 * PX, H, c.accent)
  body += kicker(c, MARGIN + 0.1 * PX, 2.7 * PX, spec.kicker, c.accent)
  body += accentRule(c, MARGIN + 0.15 * PX, 3.15 * PX, 0.9 * PX)
  const heading = spec.heading?.trim() || ''
  const hSize = sizeFor(heading, [[30, 40], [60, 32]], 26)
  const hMax = Math.max(8, Math.floor(8 * PX / (hSize * 0.52)))
  body += textBlock(MARGIN + 0.1 * PX, 3.4 * PX + hSize * 0.85, wrap(heading, hMax), {
    size: hSize,
    fill: INK_LIGHT,
    family: serifFam(c),
    weight: 'bold',
    lineH: hSize * 1.12,
  })
  body += footer(c, opts.title, opts.slideNo)
  return svgDoc(c.bgAlt, body)
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Render one sermon slide to a self-contained SVG string that mirrors the
 * pptxgenjs layout of the same name. `opts.visual` is a data URL (or null);
 * when `opts.programmatic` is true the visual is itself a full composition and
 * IS the slide (contain-fit on bgAlt + footer).
 */
export function renderSlideSvg(spec: SlideSpec, t: ExportTheme, opts: SlideSvgOpts): string {
  const c = ctxFor(t)
  const visual = opts.visual ?? null

  // scriptureArt + any programmatic visual: the visual is the whole slide.
  if (visual && (opts.programmatic || spec.visual?.type === 'scriptureArt')) {
    return programmaticSlide(c, spec, visual, opts)
  }

  switch (spec.layout) {
    case 'cover':
      return coverSlide(c, spec, visual, opts)
    case 'closing':
      return coverSlide(c, spec, visual, opts, true)
    case 'fullBleedCaption':
      return fullBleedCaptionSlide(c, spec, visual, opts)
    case 'figure':
      return figureSlide(c, spec, visual, opts)
    case 'showcase':
      return showcaseSlide(c, spec, visual, opts)
    case 'scripture':
      return scriptureSlide(c, spec, visual, opts)
    case 'bigStat':
      return bigStatSlide(c, spec, visual, opts)
    case 'bento':
      return bentoSlide(c, spec, opts)
    case 'threeCol':
      return threeColSlide(c, spec, opts)
    case 'timelineSlide':
      return timelineSlide(c, spec, visual, opts)
    case 'pullQuote':
      return pullQuoteSlide(c, spec, visual, opts)
    case 'twoUp':
      return twoUpSlide(c, spec, opts)
    case 'sectionDivider':
      return sectionDividerSlide(c, spec, visual, opts)
    case 'split':
    default:
      return splitSlide(c, spec, visual, opts)
  }
}
