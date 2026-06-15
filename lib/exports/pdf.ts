import jsPDF from 'jspdf'
import type { Sermon, SermonDraft, SermonMedia } from '@/types'
import { parseSermonHtml, runsToText, splitQuoteReference, promoteHeadings, type Run } from './sermon-html'

// Brand palette (RGB)
const NAVY: [number, number, number] = [15, 27, 51]
const GOLD: [number, number, number] = [214, 164, 62]
const INK: [number, number, number] = [38, 45, 58]
const MUTED: [number, number, number] = [115, 125, 140]
const CREAM: [number, number, number] = [247, 243, 232]

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 22
const CONTENT_W = PAGE_W - MARGIN * 2
const TOP_Y = 34
const BOTTOM_Y = PAGE_H - 24

interface Word {
  text: string
  bold: boolean
  italic: boolean
}

function runsToWords(runs: Run[]): Word[] {
  const words: Word[] = []
  for (const run of runs) {
    for (const token of run.text.split(/\s+/)) {
      if (token) words.push({ text: token, bold: !!run.bold, italic: !!run.italic })
    }
  }
  return words
}

function fontStyle(w: Word): string {
  if (w.bold && w.italic) return 'bolditalic'
  if (w.bold) return 'bold'
  if (w.italic) return 'italic'
  return 'normal'
}

export async function generatePDF(
  sermon: Sermon,
  draft: SermonDraft,
  media: SermonMedia[]
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const dateLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const templateLabel = (draft.template_type ?? 'sermon').replace(/_/g, ' ').toUpperCase()

  // Preload images
  const images: { data: string; caption: string | null }[] = []
  for (const item of media) {
    if (!item.public_url) continue
    try {
      const res = await fetch(item.public_url)
      const blob = await res.blob()
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      images.push({ data, caption: item.caption })
    } catch {
      // skip unloadable image
    }
  }

  // ── Cover page ──────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')
  // Classic double frame
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.9)
  doc.rect(9, 9, PAGE_W - 18, PAGE_H - 18, 'S')
  doc.setLineWidth(0.25)
  doc.rect(12, 12, PAGE_W - 24, PAGE_H - 24, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GOLD)
  doc.text(templateLabel.split('').join(' '), PAGE_W / 2, 70, { align: 'center' })

  doc.setFont('times', 'bold')
  doc.setFontSize(34)
  doc.setTextColor(255, 255, 255)
  const titleLines = doc.splitTextToSize(sermon.title, CONTENT_W - 10)
  let coverY = 92
  doc.text(titleLines, PAGE_W / 2, coverY, { align: 'center' })
  coverY += titleLines.length * 13 + 6

  doc.setFillColor(...GOLD)
  doc.rect(PAGE_W / 2 - 14, coverY, 28, 0.8, 'F')
  coverY += 12

  if (sermon.scripture_ref) {
    doc.setFont('times', 'italic')
    doc.setFontSize(16)
    doc.setTextColor(...GOLD)
    doc.text(sermon.scripture_ref, PAGE_W / 2, coverY, { align: 'center' })
    coverY += 10
  }
  if (sermon.theme) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...CREAM)
    const themeLines = doc.splitTextToSize(sermon.theme, CONTENT_W - 30)
    doc.text(themeLines, PAGE_W / 2, coverY, { align: 'center' })
    coverY += themeLines.length * 5.5 + 6
  }

  // Hero image inset on the cover
  if (images[0]) {
    const imgW = 120
    const imgH = imgW * 0.5625
    const imgY = Math.max(coverY + 6, 150)
    if (imgY + imgH < 250) {
      doc.setDrawColor(...GOLD)
      doc.setLineWidth(0.6)
      doc.addImage(images[0].data, 'PNG', (PAGE_W - imgW) / 2, imgY, imgW, imgH)
      doc.rect((PAGE_W - imgW) / 2, imgY, imgW, imgH, 'S')
    }
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(150, 160, 175)
  doc.text(dateLabel, PAGE_W / 2, 262, { align: 'center' })
  doc.setFontSize(8)
  doc.text('Prepared with SabAi Sermon', PAGE_W / 2, 270, { align: 'center' })

  // ── Content pages ───────────────────────────────────────────
  let y = TOP_Y

  function drawHeader() {
    doc.setFont('times', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(sermon.title, MARGIN, 16)
    if (sermon.scripture_ref) {
      doc.text(sermon.scripture_ref, PAGE_W - MARGIN, 16, { align: 'right' })
    }
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, 20, PAGE_W - MARGIN, 20)
  }

  function newPage() {
    doc.addPage()
    drawHeader()
    y = TOP_Y
  }

  function ensureSpace(needed: number) {
    if (y + needed > BOTTOM_Y) newPage()
  }

  /**
   * Word-flow renderer preserving bold/italic runs.
   * When measure=true it only returns the height without drawing.
   */
  function flowRuns(
    runs: Run[],
    opts: {
      x?: number
      maxW?: number
      size?: number
      font?: 'helvetica' | 'times'
      color?: [number, number, number]
      lineH?: number
      measure?: boolean
      breakPages?: boolean
    } = {}
  ): number {
    const x = opts.x ?? MARGIN
    const maxW = opts.maxW ?? CONTENT_W
    const size = opts.size ?? 11
    const font = opts.font ?? 'helvetica'
    const color = opts.color ?? INK
    const lineH = opts.lineH ?? size * 0.48
    const words = runsToWords(runs)
    doc.setFontSize(size)
    if (!opts.measure) doc.setTextColor(...color)

    let cursorX = x
    let lines = 1
    let firstWord = true
    for (const word of words) {
      doc.setFont(font, fontStyle(word))
      const wordW = doc.getTextWidth(word.text)
      const spaceW = doc.getTextWidth(' ')
      // Pull closing punctuation back against the previous word.
      // Straight quotes stay spaced — they are usually openers mid-sentence.
      if (!firstWord && /^[,.;:!?)\]’”]/.test(word.text)) cursorX -= spaceW
      if (!firstWord && cursorX + wordW > x + maxW) {
        cursorX = x
        lines += 1
        if (!opts.measure) {
          y += lineH
          if (opts.breakPages !== false && y > BOTTOM_Y) {
            newPage()
            doc.setFontSize(size)
            doc.setTextColor(...color)
          }
        }
      }
      if (!opts.measure) doc.text(word.text, cursorX, y)
      cursorX += wordW + spaceW
      firstWord = false
    }
    return lines * lineH
  }

  newPage()

  const blocks = promoteHeadings(parseSermonHtml(draft.polished_html ?? ''))
  let sectionIdx = 0

  for (const block of blocks) {
    const plain = runsToText(block.runs)

    if (block.type === 'h1' || block.type === 'h2') {
      // The AI draft often opens with a "Title: …" heading that duplicates the cover
      if (sectionIdx === 0 && /^title\s*:/i.test(plain)) continue
      sectionIdx += 1
      // Keep the heading attached to at least two lines of its section
      ensureSpace(36)
      y += 6
      doc.setFillColor(...GOLD)
      doc.rect(MARGIN, y - 4.6, 1.6, 6, 'F')
      doc.setFont('times', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(...NAVY)
      const lines = doc.splitTextToSize(plain, CONTENT_W - 8)
      doc.text(lines, MARGIN + 5, y)
      y += lines.length * 7 + 4
      continue
    }

    if (block.type === 'h3') {
      ensureSpace(16)
      y += 3
      doc.setFont('times', 'bold')
      doc.setFontSize(12.5)
      doc.setTextColor(...NAVY)
      const lines = doc.splitTextToSize(plain, CONTENT_W)
      doc.text(lines, MARGIN, y)
      y += lines.length * 5.8 + 2.5
      continue
    }

    if (block.type === 'quote') {
      const { body, reference } = splitQuoteReference(plain)
      const bodyRuns: Run[] = [{ text: body, italic: true }]
      // Measure first so the cream panel sizes exactly to the text
      const innerX = MARGIN + 13
      const innerW = CONTENT_W - 21
      const textH = flowRuns(bodyRuns, { maxW: innerW, size: 11.5, font: 'times', measure: true, lineH: 5.6 })
      const panelH = textH + 10 + (reference ? 7 : 0)
      ensureSpace(panelH + 6)
      const panelTop = y - 5
      doc.setFillColor(...CREAM)
      doc.rect(MARGIN, panelTop, CONTENT_W, panelH, 'F')
      doc.setFillColor(...GOLD)
      doc.rect(MARGIN, panelTop, 1.6, panelH, 'F')
      // Large gold opening quote mark
      doc.setFont('times', 'bold')
      doc.setFontSize(30)
      doc.setTextColor(...GOLD)
      doc.text('“', MARGIN + 4.5, panelTop + 12)
      y += 1.5
      flowRuns(bodyRuns, { x: innerX, maxW: innerW, size: 11.5, font: 'times', color: NAVY, lineH: 5.6, breakPages: false })
      if (reference) {
        y += 7.5
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(...GOLD)
        doc.setCharSpace(0.5)
        doc.text(`— ${reference.toUpperCase()}`, MARGIN + CONTENT_W - 6, y, { align: 'right' })
        doc.setCharSpace(0)
      }
      // Clear the panel's bottom padding plus a paragraph gap
      y += 16
      continue
    }

    if (block.type === 'list' && block.items) {
      for (const item of block.items) {
        const itemH = flowRuns(item, { x: MARGIN + 7, maxW: CONTENT_W - 7, measure: true, lineH: 5.4 })
        ensureSpace(itemH + 3)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(...GOLD)
        doc.text('•', MARGIN + 2, y)
        flowRuns(item, { x: MARGIN + 7, maxW: CONTENT_W - 7, lineH: 5.4 })
        y += 5.4 + 1.6
      }
      y += 2
      continue
    }

    // Paragraph
    if (!plain) continue
    ensureSpace(12)
    flowRuns(block.runs, { lineH: 5.4 })
    y += 5.4 + 3.2
  }

  // ── End-of-sermon ornament ──────────────────────────────────
  ensureSpace(20)
  y += 6
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.4)
  doc.line(PAGE_W / 2 - 26, y, PAGE_W / 2 - 6, y)
  doc.line(PAGE_W / 2 + 6, y, PAGE_W / 2 + 26, y)
  doc.setFillColor(...GOLD)
  // Small diamond between the rules
  doc.triangle(PAGE_W / 2, y - 2.2, PAGE_W / 2 + 2.2, y, PAGE_W / 2, y + 2.2, 'F')
  doc.triangle(PAGE_W / 2, y - 2.2, PAGE_W / 2 - 2.2, y, PAGE_W / 2, y + 2.2, 'F')

  // ── Visual aids ─────────────────────────────────────────────
  const galleryImages = images.slice(1) // first image lives on the cover
  if (galleryImages.length) {
    newPage()
    doc.setFillColor(...GOLD)
    doc.rect(MARGIN, y - 4.6, 1.6, 6, 'F')
    doc.setFont('times', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...NAVY)
    doc.text('Visual Aids', MARGIN + 5, y)
    y += 12

    for (const img of galleryImages) {
      const imgW = CONTENT_W * 0.78
      const imgH = imgW * 0.5625
      ensureSpace(imgH + 18)
      const imgX = MARGIN + (CONTENT_W - imgW) / 2
      doc.addImage(img.data, 'PNG', imgX, y, imgW, imgH)
      doc.setDrawColor(...GOLD)
      doc.setLineWidth(0.4)
      doc.rect(imgX, y, imgW, imgH, 'S')
      y += imgH + 5
      if (img.caption) {
        doc.setFont('times', 'italic')
        doc.setFontSize(9.5)
        doc.setTextColor(...MUTED)
        const capLines = doc.splitTextToSize(img.caption, imgW)
        doc.text(capLines, PAGE_W / 2, y, { align: 'center' })
        y += capLines.length * 4.4 + 8
      } else {
        y += 6
      }
    }
  }

  // ── Footer pass: page numbers on all content pages ──────────
  const total = doc.getNumberOfPages()
  for (let i = 2; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(`${i - 1} of ${total - 1}`, PAGE_W / 2, PAGE_H - 12, { align: 'center' })
    doc.setFillColor(...GOLD)
    doc.rect(MARGIN, PAGE_H - 14, 2.2, 2.2, 'F')
    doc.text(dateLabel, PAGE_W - MARGIN, PAGE_H - 12, { align: 'right' })
  }

  return doc.output('blob')
}
