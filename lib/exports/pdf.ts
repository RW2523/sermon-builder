import jsPDF from 'jspdf'
import type { Sermon, StructuredSermon, SermonMedia, ExportTemplateId } from '@/types'
import { getTheme, withHash, contrastText } from '@/lib/sermon/templates'
import { prepareImage } from '@/lib/exports/image'

interface ExportOpts {
  templateId?: ExportTemplateId
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

  // On the white-paper PDF the panel must stay light regardless of theme —
  // dark-mode themes (navy/purple/slate) have a dark t.panel, so use a warm
  // light tint there and let contrastText pick readable (dark) text.
  const scripturePanel = t.mode === 'light' ? t.panel : 'F2ECDE'
  const scriptureText = withHash(contrastText(scripturePanel))

  function scriptureBlock(text: string) {
    const lines = doc.splitTextToSize(text, contentW - 8)
    const blockH = lines.length * 5.4 + 6
    checkPage(blockH)
    doc.setFillColor(withHash(scripturePanel))
    doc.rect(margin, y - 1, contentW, blockH, 'F')
    doc.setFillColor(accent)
    doc.rect(margin, y - 1, 1.5, blockH, 'F')
    doc.setFont('times', 'italic')
    doc.setFontSize(10.5)
    doc.setTextColor(scriptureText)
    let yy = y + 4
    for (const line of lines) {
      doc.text(line, margin + 6, yy)
      yy += 5.4
    }
    y += blockH + 4
  }

  // ── Scripture ──
  if (structured.scripture) scriptureBlock(structured.scripture)

  // ── Preload + compress media (parallel) ──
  const prepared = await Promise.all(
    media.map(async (m) => {
      if (!m.public_url) return null
      const p = await prepareImage(m.public_url)
      return p ? { data: p.dataUrl, w: p.w, h: p.h, caption: m.caption } : null
    })
  )
  const imgData = prepared.filter(Boolean) as { data: string; w: number; h: number; caption: string | null }[]

  function placeImage(img: { data: string; w: number; h: number; caption: string | null }, widthMm: number) {
    const imgW = Math.min(widthMm, contentW)
    const imgH = (img.h / img.w) * imgW
    checkPage(imgH + (img.caption ? 8 : 4))
    const x = margin + (contentW - imgW) / 2
    doc.addImage(img.data, 'JPEG', x, y, imgW, imgH)
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
