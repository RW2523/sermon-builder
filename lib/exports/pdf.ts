import jsPDF from 'jspdf'
import type { Sermon, StructuredSermon, SermonMedia, ExportTemplateId } from '@/types'
import { getTheme, withHash } from '@/lib/sermon/templates'

interface ExportOpts {
  templateId?: ExportTemplateId
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generatePDF(
  sermon: Sermon,
  structured: StructuredSermon,
  media: SermonMedia[],
  opts: ExportOpts = {}
): Promise<Blob> {
  const t = getTheme(opts.templateId ?? sermon.export_template)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentW = pageW - margin * 2

  const accent = withHash(t.accent)
  const heading = withHash(t.mode === 'light' ? t.heading : '1B2A4A')
  const body = withHash(t.mode === 'light' ? t.text : '23272E')
  const muted = withHash(t.textMuted)

  let y = 0
  let page = 1

  function footer(pageNum: number) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(muted)
    doc.text('SabAi Sermon', margin, pageH - 8)
    doc.text(String(pageNum), pageW - margin, pageH - 8, { align: 'right' })
  }

  function checkPage(needed = 10) {
    if (y + needed > pageH - 16) {
      footer(page)
      doc.addPage()
      page += 1
      y = margin
    }
  }

  // ── Cover band ──
  doc.setFillColor(accent)
  doc.rect(0, 0, pageW, 4, 'F')
  y = margin + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(accent)
  doc.text((sermon.tone || 'Sermon').toUpperCase(), margin, y)
  y += 9

  doc.setFont('times', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(heading)
  const titleLines = doc.splitTextToSize(structured.title || sermon.title, contentW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 10 + 2

  if (structured.theme) {
    doc.setFont('times', 'italic')
    doc.setFontSize(12)
    doc.setTextColor(muted)
    const themeLines = doc.splitTextToSize(structured.theme, contentW)
    doc.text(themeLines, margin, y)
    y += themeLines.length * 6 + 2
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(muted)
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), margin, y)
  y += 6
  doc.setDrawColor(accent)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  function sectionHeading(label: string) {
    checkPage(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(accent)
    doc.text(label.toUpperCase(), margin, y)
    y += 6
  }

  function paragraph(text: string, size = 10.5) {
    doc.setFont('times', 'normal')
    doc.setFontSize(size)
    doc.setTextColor(body)
    for (const para of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
      for (const line of doc.splitTextToSize(para, contentW)) {
        checkPage(6)
        doc.text(line, margin, y)
        y += size * 0.52
      }
      y += 2.5
    }
  }

  function scriptureBlock(text: string) {
    const lines = doc.splitTextToSize(text, contentW - 8)
    const blockH = lines.length * 5.4 + 6
    checkPage(blockH)
    doc.setFillColor(withHash(t.panel))
    doc.rect(margin, y - 1, contentW, blockH, 'F')
    doc.setFillColor(accent)
    doc.rect(margin, y - 1, 1.5, blockH, 'F')
    doc.setFont('times', 'italic')
    doc.setFontSize(10.5)
    doc.setTextColor(t.mode === 'light' ? withHash(t.text) : withHash('2A3142'))
    let yy = y + 4
    for (const line of lines) {
      doc.text(line, margin + 6, yy)
      yy += 5.4
    }
    y += blockH + 4
  }

  // ── Scripture ──
  if (structured.scripture) scriptureBlock(structured.scripture)

  // ── Preload media ──
  const imgData: { data: string; w: number; h: number; caption: string | null }[] = []
  for (const m of media) {
    if (!m.public_url) continue
    const data = await urlToDataUrl(m.public_url)
    if (!data) continue
    try {
      const props = doc.getImageProperties(data)
      imgData.push({ data, w: props.width, h: props.height, caption: m.caption })
    } catch { /* skip undecodable */ }
  }

  function placeImage(img: { data: string; w: number; h: number; caption: string | null }, widthMm: number) {
    const imgW = Math.min(widthMm, contentW)
    const imgH = (img.h / img.w) * imgW
    checkPage(imgH + (img.caption ? 8 : 4))
    const x = margin + (contentW - imgW) / 2
    const fmt = img.data.includes('image/png') ? 'PNG' : 'JPEG'
    doc.addImage(img.data, fmt, x, y, imgW, imgH)
    y += imgH + 3
    if (img.caption) {
      doc.setFont('times', 'italic')
      doc.setFontSize(8.5)
      doc.setTextColor(muted)
      for (const line of doc.splitTextToSize(img.caption, imgW)) { checkPage(5); doc.text(line, pageW / 2, y, { align: 'center' }); y += 4 }
      y += 2
    }
  }

  if (imgData[0]) placeImage(imgData[0], contentW * 0.8)

  // ── Introduction ──
  if (structured.introduction) {
    sectionHeading('Introduction')
    paragraph(structured.introduction)
    y += 3
  }

  // ── Main points (image interleaved) ──
  structured.main_points.forEach((pt, i) => {
    checkPage(18)
    doc.setFont('times', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(heading)
    for (const line of doc.splitTextToSize(`${i + 1}. ${pt.heading}`, contentW)) { checkPage(8); doc.text(line, margin, y); y += 7 }
    y += 1
    if (pt.scripture) scriptureBlock(pt.scripture)
    if (pt.body) paragraph(pt.body)
    const img = imgData[i + 1]
    if (img) placeImage(img, contentW * 0.62)
    y += 3
  })

  // ── Applications ──
  if (structured.applications.length) {
    sectionHeading('Application')
    doc.setFont('times', 'normal')
    doc.setFontSize(10.5)
    doc.setTextColor(body)
    structured.applications.forEach((a, i) => {
      const lines = doc.splitTextToSize(`${i + 1}.  ${a}`, contentW - 4)
      for (let li = 0; li < lines.length; li++) {
        checkPage(6)
        doc.text(lines[li], margin + (li === 0 ? 0 : 5), y)
        y += 5.4
      }
      y += 1.5
    })
    y += 2
  }

  // ── Conclusion ──
  if (structured.conclusion) {
    sectionHeading('Conclusion')
    paragraph(structured.conclusion)
    y += 3
  }

  // ── Prayer ──
  if (structured.prayer) {
    checkPage(20)
    doc.setDrawColor(accent)
    doc.setLineWidth(0.4)
    doc.line(margin, y, pageW - margin, y)
    y += 6
    sectionHeading('Closing Prayer')
    doc.setFont('times', 'italic')
    doc.setFontSize(10.5)
    doc.setTextColor(body)
    for (const line of doc.splitTextToSize(structured.prayer, contentW)) {
      checkPage(6); doc.text(line, margin, y); y += 5.6
    }
  }

  footer(page)
  return doc.output('blob')
}
