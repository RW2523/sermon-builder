import jsPDF from 'jspdf'
import type { Sermon, SermonDraft, SermonMedia } from '@/types'

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(h[1-6]|p|li|blockquote|div)[^>]*>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function generatePDF(
  sermon: Sermon,
  draft: SermonDraft,
  media: SermonMedia[]
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentW = pageW - margin * 2
  let y = margin

  function checkPage(needed = 10) {
    if (y + needed > pageH - margin) {
      doc.addPage()
      y = margin
    }
  }

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(60, 20, 100)
  const titleLines = doc.splitTextToSize(sermon.title, contentW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 9 + 4

  // Metadata
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120, 80, 160)
  if (sermon.scripture_ref) {
    doc.text(`Scripture: ${sermon.scripture_ref}`, margin, y)
    y += 5
  }
  if (sermon.theme) {
    doc.text(`Theme: ${sermon.theme}`, margin, y)
    y += 5
  }
  doc.text(`Template: ${draft.template_type}   |   Date: ${new Date().toLocaleDateString()}`, margin, y)
  y += 8

  // Divider
  doc.setDrawColor(180, 130, 220)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // Body text — parse basic HTML structure
  const text = stripHtml(draft.polished_html ?? '')
  const lines = text.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { y += 3; continue }

    // Detect headings by length heuristic (short lines ≤ 80 chars after stripping)
    const isLikelyHeading = trimmed.length <= 80 && !trimmed.includes('. ') && !trimmed.endsWith('.')

    if (isLikelyHeading && trimmed.length < 60) {
      checkPage(12)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(60, 20, 100)
      const wrapped = doc.splitTextToSize(trimmed, contentW)
      doc.text(wrapped, margin, y)
      y += wrapped.length * 6 + 3
    } else {
      checkPage(6)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(40, 40, 40)
      const wrapped = doc.splitTextToSize(trimmed, contentW)
      doc.text(wrapped, margin, y)
      y += wrapped.length * 5.5 + 2
    }
  }

  // Add images if any
  for (const item of media) {
    if (!item.public_url) continue
    try {
      const response = await fetch(item.public_url)
      const blob = await response.blob()
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })

      const imgW = contentW * 0.7
      const imgH = imgW * 0.5625 // 16:9
      checkPage(imgH + 20)
      doc.addImage(base64, 'PNG', margin + (contentW - imgW) / 2, y, imgW, imgH)
      y += imgH + 4

      if (item.caption) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(9)
        doc.setTextColor(120, 100, 150)
        const capLines = doc.splitTextToSize(item.caption, imgW)
        doc.text(capLines, margin + (contentW - imgW) / 2, y)
        y += capLines.length * 4 + 6
      }
    } catch {
      // Image load failed — skip
    }
  }

  return doc.output('blob')
}
