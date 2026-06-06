import PptxGenJS from 'pptxgenjs'
import type { Sermon, SermonDraft, SermonMedia } from '@/types'

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(h[1-6]|p|li|blockquote|div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim()
}

function chunkText(text: string, maxChars = 600): string[] {
  const paragraphs = text.split('\n\n').filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if ((current + p).length > maxChars && current) {
      chunks.push(current.trim())
      current = p + '\n\n'
    } else {
      current += p + '\n\n'
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length ? chunks : [text.slice(0, maxChars)]
}

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generatePPT(
  sermon: Sermon,
  draft: SermonDraft,
  media: SermonMedia[]
): Promise<Blob> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'

  const PURPLE = '3C1464'
  const LIGHT = 'F3E8FF'
  const WHITE = 'FFFFFF'
  const GOLD = 'D4AF37'

  // ── Title slide ──
  const titleSlide = pptx.addSlide()
  titleSlide.background = { color: PURPLE }
  titleSlide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 3.2, w: '100%', h: 0.6, fill: { color: GOLD, transparency: 70 },
  })
  titleSlide.addText(sermon.title, {
    x: 0.5, y: 1.2, w: 9, h: 1.8,
    fontSize: 40, bold: true, color: WHITE, align: 'center', fontFace: 'Georgia',
  })
  if (sermon.scripture_ref) {
    titleSlide.addText(sermon.scripture_ref, {
      x: 0.5, y: 3.2, w: 9, h: 0.6,
      fontSize: 18, color: GOLD, align: 'center', italic: true,
    })
  }
  if (sermon.theme) {
    titleSlide.addText(sermon.theme, {
      x: 0.5, y: 3.9, w: 9, h: 0.5,
      fontSize: 14, color: LIGHT, align: 'center',
    })
  }
  titleSlide.addText(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), {
    x: 0.5, y: 4.6, w: 9, h: 0.4,
    fontSize: 12, color: 'AAAAAA', align: 'center',
  })

  // ── Content slides ──
  const bodyText = stripHtml(draft.polished_html ?? '')
  const sections = chunkText(bodyText, 500)

  sections.forEach((chunk, i) => {
    const slide = pptx.addSlide()
    slide.background = { color: '1A0533' }
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: '100%', h: 0.08, fill: { color: GOLD },
    })
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 4.92, w: '100%', h: 0.08, fill: { color: GOLD },
    })
    slide.addText(sermon.title, {
      x: 0.3, y: 0.12, w: 9.4, h: 0.35,
      fontSize: 9, color: GOLD, align: 'right', italic: true,
    })
    slide.addText(chunk, {
      x: 0.6, y: 0.6, w: 8.8, h: 4.1,
      fontSize: 16, color: WHITE, fontFace: 'Calibri', lineSpacingMultiple: 1.3,
      valign: 'top',
    })
    slide.addText(`${i + 1}`, {
      x: 0.3, y: 4.6, w: 9.4, h: 0.25,
      fontSize: 9, color: '666666', align: 'center',
    })
  })

  // ── Image slides ──
  for (const item of media) {
    if (!item.public_url) continue
    const imgData = await urlToBase64(item.public_url)
    if (!imgData) continue

    const slide = pptx.addSlide()
    slide.background = { color: '0D0020' }
    slide.addImage({
      data: `image/png;base64,${imgData}`,
      x: 0.3, y: 0.3, w: 9.4, h: 4.4, sizing: { type: 'contain', w: 9.4, h: 4.4 },
    })
    if (item.caption) {
      slide.addText(item.caption, {
        x: 0.3, y: 4.7, w: 9.4, h: 0.4,
        fontSize: 11, color: LIGHT, align: 'center', italic: true,
      })
    }
  }

  // ── Closing slide ──
  const closeSlide = pptx.addSlide()
  closeSlide.background = { color: PURPLE }
  closeSlide.addText('God Bless You', {
    x: 0.5, y: 1.5, w: 9, h: 1.2,
    fontSize: 42, bold: true, color: GOLD, align: 'center', fontFace: 'Georgia',
  })
  closeSlide.addText(sermon.scripture_ref ?? '', {
    x: 0.5, y: 3, w: 9, h: 0.5,
    fontSize: 16, color: WHITE, align: 'center', italic: true,
  })

  const blob = await pptx.write({ outputType: 'blob' }) as Blob
  return blob
}
