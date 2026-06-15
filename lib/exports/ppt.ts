import PptxGenJS from 'pptxgenjs'
import type { Sermon, SermonDraft, SermonMedia } from '@/types'
import { parseSermonHtml, chunkRuns, runsToText, splitQuoteReference, promoteHeadings, type Run, type Block } from './sermon-html'

// Widescreen 16:9 canvas (inches)
const W = 13.33
const H = 7.5

// Brand palette — navy + gold
const NAVY = '0F1B33'
const NAVY_DEEP = '0A1326'
const PANEL = '16243F'
const GOLD = 'E3B448'
const CREAM = 'F5F1E6'
const WHITE = 'FFFFFF'
const MUTED = '8FA1BE'

const SERIF = 'Georgia'
const SANS = 'Calibri'

interface Section {
  heading: string | null
  blocks: Block[]
}

function groupSections(blocks: Block[]): Section[] {
  const sections: Section[] = []
  let current: Section = { heading: null, blocks: [] }
  let isFirstHeading = true
  for (const block of blocks) {
    if (block.type === 'h1' || block.type === 'h2') {
      const headingText = runsToText(block.runs)
      // The AI draft often opens with a "Title: …" heading duplicating the title slide
      if (isFirstHeading && /^title\s*:/i.test(headingText)) {
        isFirstHeading = false
        continue
      }
      isFirstHeading = false
      if (current.blocks.length || current.heading) sections.push(current)
      current = { heading: headingText, blocks: [] }
    } else {
      current.blocks.push(block)
    }
  }
  if (current.blocks.length || current.heading) sections.push(current)
  return sections
}

type PptTextRun = { text: string; options?: Record<string, unknown> }

/** Convert parser runs to pptxgenjs rich-text runs. Bold text pops in gold. */
function toPptRuns(runs: Run[], opts: { baseColor: string; boldColor?: string } = { baseColor: CREAM }): PptTextRun[] {
  const out: PptTextRun[] = []
  for (const run of runs) {
    const pieces = run.text.split('\n')
    pieces.forEach((piece, i) => {
      if (piece) {
        out.push({
          text: piece,
          options: {
            bold: run.bold ?? false,
            italic: run.italic ?? false,
            color: run.bold ? (opts.boldColor ?? GOLD) : opts.baseColor,
            breakLine: i < pieces.length - 1,
          },
        })
      } else if (i < pieces.length - 1 && out.length) {
        out[out.length - 1].options = { ...out[out.length - 1].options, breakLine: true }
      }
    })
  }
  if (!out.length) out.push({ text: '' })
  return out
}

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generatePPT(
  sermon: Sermon,
  draft: SermonDraft,
  media: SermonMedia[],
  speakerNotes?: string | null
): Promise<Blob> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'SabAi Sermon'
  pptx.title = sermon.title

  const blocks = promoteHeadings(parseSermonHtml(draft.polished_html ?? ''))
  const sections = groupSections(blocks)
  const globalNotes = speakerNotes ?? draft.speaker_notes ?? ''
  const dateLabel = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const templateLabel = (draft.template_type ?? 'sermon').replace(/_/g, ' ').toUpperCase()

  // Preload images once
  const images: { data: string; caption: string | null; kind: string }[] = []
  for (const item of media) {
    if (!item.public_url) continue
    const data = await urlToBase64(item.public_url)
    if (data) images.push({ data, caption: item.caption, kind: item.kind })
  }

  /** Thin gold L-shaped corner flourishes — the hand-finished touch */
  function addCorners(slide: PptxGenJS.Slide, inset = 0.42, len = 0.85, thickness = 0.022) {
    const positions: [number, number, boolean, boolean][] = [
      [inset, inset, false, false],
      [W - inset - len, inset, true, false],
      [inset, H - inset, false, true],
      [W - inset - len, H - inset, true, true],
    ]
    for (const [x, y, right, bottom] of positions) {
      slide.addShape(pptx.ShapeType.rect, {
        x, y: bottom ? y - thickness : y, w: len, h: thickness, fill: { color: GOLD },
      })
      slide.addShape(pptx.ShapeType.rect, {
        x: right ? x + len - thickness : x,
        y: bottom ? y - len : y,
        w: thickness, h: len, fill: { color: GOLD },
      })
    }
  }

  let slideNo = 0
  function footer(slide: PptxGenJS.Slide) {
    slideNo += 1
    if (slideNo === 1) return // no footer on title slide
    slide.addText(sermon.title, {
      x: 0.5, y: H - 0.42, w: 6, h: 0.3,
      fontSize: 10, color: MUTED, fontFace: SANS, italic: true,
    })
    slide.addText(String(slideNo), {
      x: W - 1.1, y: H - 0.42, w: 0.6, h: 0.3,
      fontSize: 10, color: MUTED, fontFace: SANS, align: 'right',
    })
  }

  // ── Title slide ─────────────────────────────────────────────
  const title = pptx.addSlide()
  slideNo += 1
  if (images[0]) {
    title.background = { data: images[0].data }
    // Dark overlay so text stays readable over any photo
    title.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: W, h: H, fill: { color: NAVY_DEEP, transparency: 30 },
    })
  } else {
    title.background = { color: NAVY }
  }
  addCorners(title)
  title.addText(templateLabel, {
    x: 1, y: 1.45, w: W - 2, h: 0.4,
    fontSize: 14, color: GOLD, fontFace: SANS, align: 'center', charSpacing: 6, bold: true,
  })
  title.addText(sermon.title, {
    x: 0.8, y: 2.1, w: W - 1.6, h: 1.9,
    fontSize: 48, bold: true, color: WHITE, align: 'center', fontFace: SERIF,
    shadow: { type: 'outer', color: '000000', blur: 8, offset: 3, angle: 90, opacity: 0.5 },
  })
  // Gold divider
  title.addShape(pptx.ShapeType.rect, {
    x: W / 2 - 0.8, y: 4.25, w: 1.6, h: 0.045, fill: { color: GOLD },
  })
  if (sermon.scripture_ref) {
    title.addText(sermon.scripture_ref, {
      x: 1, y: 4.5, w: W - 2, h: 0.6,
      fontSize: 22, color: GOLD, align: 'center', italic: true, fontFace: SERIF,
      shadow: { type: 'outer', color: '000000', blur: 6, offset: 2, angle: 90, opacity: 0.5 },
    })
  }
  if (sermon.theme) {
    title.addText(sermon.theme, {
      x: 1.5, y: 5.2, w: W - 3, h: 0.5,
      fontSize: 16, color: CREAM, align: 'center', fontFace: SANS,
      shadow: { type: 'outer', color: '000000', blur: 6, offset: 2, angle: 90, opacity: 0.5 },
    })
  }
  title.addText(dateLabel, {
    x: 1, y: H - 1.0, w: W - 2, h: 0.4,
    fontSize: 12, color: MUTED, align: 'center', fontFace: SANS,
  })
  title.addNotes(
    `${sermon.title}\n${sermon.scripture_ref ?? ''}\nTheme: ${sermon.theme ?? ''}\n\n— SPEAKER NOTES —\n${globalNotes || '(generate speaker notes in Stage 4 to see them here)'}`
  )

  // ── Body: sections → divider + content slides ───────────────
  const numberedSections = sections.filter((s) => s.heading)
  let sectionIdx = 0

  for (const section of sections) {
    if (section.heading) {
      sectionIdx += 1
      const divider = pptx.addSlide()
      divider.background = { color: NAVY_DEEP }
      divider.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: H, fill: { color: GOLD } })
      // Giant watermark number bleeding off the right edge
      divider.addText(String(sectionIdx).padStart(2, '0'), {
        x: W - 5.6, y: 0.8, w: 5.8, h: 5.8,
        fontSize: 290, color: PANEL, bold: true, fontFace: SERIF, align: 'right',
      })
      divider.addText(sermon.title.toUpperCase(), {
        x: 0.9, y: 0.55, w: W - 2, h: 0.35,
        fontSize: 12, color: GOLD, fontFace: SANS, charSpacing: 4,
      })
      divider.addText(`PART ${String(sectionIdx).padStart(2, '0')} · OF ${String(numberedSections.length).padStart(2, '0')}`, {
        x: 0.9, y: 2.75, w: 6, h: 0.4,
        fontSize: 13, color: GOLD, fontFace: SANS, charSpacing: 5, bold: true,
      })
      divider.addText(section.heading, {
        x: 0.9, y: 3.45, w: W - 2.4, h: 1.6,
        fontSize: 38, bold: true, color: WHITE, fontFace: SERIF, valign: 'top',
      })
      divider.addShape(pptx.ShapeType.rect, { x: 0.95, y: 3.3, w: 1.4, h: 0.04, fill: { color: GOLD } })
      const sectionText = section.blocks.map((b) => runsToText(b.runs)).join('\n\n')
      divider.addNotes(`Section ${sectionIdx} of ${numberedSections.length}: ${section.heading}\n\n${sectionText.slice(0, 2200)}`)
      footer(divider)
    }

    for (const block of section.blocks) {
      if (block.type === 'quote') {
        // Dedicated high-impact scripture / quote slide
        const { body, reference } = splitQuoteReference(runsToText(block.runs))
        const quote = pptx.addSlide()
        quote.background = { color: NAVY }
        addCorners(quote)
        quote.addText('“', {
          x: 0.9, y: 0.55, w: 2, h: 1.6,
          fontSize: 130, color: GOLD, fontFace: SERIF, bold: true,
        })
        quote.addText(body, {
          x: 1.6, y: 1.8, w: W - 3.2, h: 3.4,
          fontSize: body.length > 260 ? 22 : 27, fontFace: SERIF, align: 'center', valign: 'middle',
          lineSpacingMultiple: 1.3, italic: true, color: CREAM,
        })
        quote.addShape(pptx.ShapeType.rect, {
          x: W / 2 - 0.7, y: 5.6, w: 1.4, h: 0.04, fill: { color: GOLD },
        })
        const refLabel = reference ?? sermon.scripture_ref
        if (refLabel) {
          quote.addText(refLabel.toUpperCase(), {
            x: 1, y: 5.82, w: W - 2, h: 0.5,
            fontSize: 16, color: GOLD, align: 'center', fontFace: SANS, charSpacing: 3, bold: true,
          })
        }
        quote.addNotes(`Scripture / quote:\n${runsToText(block.runs)}`)
        footer(quote)
        continue
      }

      if (block.type === 'list' && block.items) {
        // Bullet slides — max 5 points per slide so text stays large
        for (let i = 0; i < block.items.length; i += 5) {
          const slice = block.items.slice(i, i + 5)
          const slide = pptx.addSlide()
          slide.background = { color: NAVY }
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: GOLD } })
          if (section.heading) {
            slide.addText(section.heading.toUpperCase(), {
              x: 0.9, y: 0.5, w: W - 1.8, h: 0.4,
              fontSize: 13, color: GOLD, fontFace: SANS, charSpacing: 4, bold: true,
            })
          }
          const runs: PptTextRun[] = []
          slice.forEach((item) => {
            const itemRuns = toPptRuns(item, { baseColor: CREAM, boldColor: GOLD })
            itemRuns.forEach((r, j) => {
              runs.push({
                ...r,
                options: {
                  ...r.options,
                  ...(j === 0 ? { bullet: { code: '2022', color: GOLD, indent: 24 } } : {}),
                  breakLine: j === itemRuns.length - 1 ? true : r.options?.breakLine ?? false,
                },
              })
            })
          })
          slide.addText(runs, {
            x: 1.1, y: 1.35, w: W - 2.4, h: 5.1,
            fontSize: 22, fontFace: SANS, valign: 'top', lineSpacingMultiple: 1.4, paraSpaceAfter: 14,
          })
          slide.addNotes(slice.map((it) => `• ${runsToText(it)}`).join('\n'))
          footer(slide)
        }
        continue
      }

      // h3 mini-heading inside a section becomes a kicker on its own content slide flow
      if (block.type === 'h3') {
        const slide = pptx.addSlide()
        slide.background = { color: NAVY }
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: GOLD } })
        slide.addText(runsToText(block.runs), {
          x: 1, y: 2.9, w: W - 2, h: 1.4,
          fontSize: 32, bold: true, color: WHITE, fontFace: SERIF, align: 'center',
        })
        slide.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.7, y: 4.4, w: 1.4, h: 0.04, fill: { color: GOLD } })
        footer(slide)
        continue
      }

      // Paragraphs — chunk so every slide stays glanceable
      const text = runsToText(block.runs)
      if (!text) continue
      for (const chunk of chunkRuns(block.runs, 420)) {
        const slide = pptx.addSlide()
        slide.background = { color: NAVY }
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.09, fill: { color: GOLD } })
        if (section.heading) {
          slide.addText(section.heading.toUpperCase(), {
            x: 0.9, y: 0.5, w: W - 1.8, h: 0.4,
            fontSize: 13, color: GOLD, fontFace: SANS, charSpacing: 4, bold: true,
          })
        }
        slide.addText(toPptRuns(chunk, { baseColor: CREAM, boldColor: GOLD }), {
          x: 1.1, y: 1.5, w: W - 2.6, h: 4.9,
          fontSize: 21, fontFace: SANS, valign: 'middle', lineSpacingMultiple: 1.45,
        })
        slide.addNotes(runsToText(chunk))
        footer(slide)
      }
    }
  }

  // ── Visual slides ───────────────────────────────────────────
  for (const img of images) {
    const slide = pptx.addSlide()
    slide.background = { color: NAVY_DEEP }
    slide.addImage({
      data: img.data,
      x: 0, y: 0, w: W, h: H,
      sizing: { type: 'contain', w: W, h: H },
    })
    addCorners(slide, 0.3, 0.7)
    if (img.caption) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0, y: H - 0.85, w: W, h: 0.85, fill: { color: NAVY_DEEP, transparency: 25 },
      })
      slide.addText(img.caption, {
        x: 0.8, y: H - 0.78, w: W - 1.6, h: 0.7,
        fontSize: 16, color: CREAM, align: 'center', italic: true, fontFace: SERIF, valign: 'middle',
      })
    }
    slide.addNotes(`Visual (${img.kind.replace(/_/g, ' ')})${img.caption ? `: ${img.caption}` : ''}`)
    footer(slide)
  }

  // ── Closing slide ───────────────────────────────────────────
  const close = pptx.addSlide()
  close.background = { color: NAVY_DEEP }
  addCorners(close)
  close.addText('Amen', {
    x: 1, y: 2.5, w: W - 2, h: 1.4,
    fontSize: 60, bold: true, color: GOLD, align: 'center', fontFace: SERIF, italic: true,
  })
  if (sermon.scripture_ref) {
    close.addText(sermon.scripture_ref, {
      x: 1, y: 4.2, w: W - 2, h: 0.6,
      fontSize: 18, color: CREAM, align: 'center', italic: true, fontFace: SERIF,
    })
  }
  close.addNotes('Closing — altar call, prayer, or final benediction.')
  footer(close)

  return (await pptx.write({ outputType: 'blob' })) as Blob
}
