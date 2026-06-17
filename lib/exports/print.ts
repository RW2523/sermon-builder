import type { Sermon, StructuredSermon, SermonMedia, ExportTemplateId } from '@/types'
import { escapeHtml } from '@/lib/sanitize'
import { getTheme, withHash } from '@/lib/sermon/templates'

interface PrintOpts {
  templateId?: ExportTemplateId
  speakerNotes?: string | null
  language?: string | null
}

/**
 * High-fidelity, theme-aware print view rendered straight from the structured
 * sermon. Because the browser does the rendering, every language/script — including
 * Hindi, Tamil, Telugu, Malayalam — displays correctly here, making this the
 * reliable "print / save as PDF" path for non-Latin sermons.
 */
export function openPrintView(
  sermon: Sermon,
  structured: StructuredSermon,
  media: SermonMedia[],
  opts: PrintOpts = {}
) {
  const t = getTheme(opts.templateId ?? sermon.export_template)
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const accent = withHash(t.accent)
  const ink = '#1d2330'
  const panel = t.mode === 'light' ? withHash(t.panel) : '#f3eee1'

  const p = (text: string) =>
    text.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)
      .map((x) => `<p>${escapeHtml(x).replace(/\n/g, '<br/>')}</p>`).join('')

  const pointsHtml = structured.main_points.map((pt, i) => `
    <h2>${i + 1}. ${escapeHtml(pt.heading)}</h2>
    ${pt.scripture ? `<blockquote>${escapeHtml(pt.scripture)}</blockquote>` : ''}
    ${p(pt.body)}
  `).join('')

  const appsHtml = structured.applications.length
    ? `<div class="section-header">Application</div><ol class="apps">${structured.applications.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ol>`
    : ''

  const mediaSection = media.some((m) => m.public_url) ? `
    <div class="section-header">Visuals</div>
    <div class="media-grid">
      ${media.map((m) => m.public_url ? `
        <div class="media-item">
          <img src="${escapeHtml(m.public_url)}" alt="${escapeHtml(m.caption ?? '')}" />
          ${m.caption ? `<p class="caption">${escapeHtml(m.caption)}</p>` : ''}
        </div>` : '').join('')}
    </div>` : ''

  const notesSection = opts.speakerNotes ? `
    <div class="page-break"></div>
    <div class="section-header notes-header">Speaker Notes (Private — Not For Distribution)</div>
    <div class="speaker-notes">${escapeHtml(opts.speakerNotes).replace(/\n/g, '<br/>')}</div>` : ''

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(opts.language ?? 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(structured.title || sermon.title)} — Sermon Notes</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color: ${ink}; background: #fff; max-width: 680px; margin: 0 auto; padding: 44px 34px; line-height: 1.7; }
    .header { border-bottom: 3px solid ${accent}; padding-bottom: 20px; margin-bottom: 26px; }
    .kicker { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: ${accent}; font-family: Arial, sans-serif; font-weight: bold; margin-bottom: 8px; }
    .title { font-size: 30px; font-weight: bold; color: ${ink}; line-height: 1.2; }
    .theme { font-style: italic; color: #6b7280; margin-top: 8px; font-size: 15px; }
    .meta { font-size: 12px; color: #6b7280; margin-top: 12px; display: flex; flex-wrap: wrap; gap: 14px; }
    .section-header { font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: ${accent}; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 26px 0 14px; font-family: Arial, sans-serif; }
    h2 { font-size: 20px; font-weight: bold; color: ${ink}; margin: 22px 0 8px; }
    p { margin-bottom: 12px; font-size: 15px; }
    blockquote { border-left: 4px solid ${accent}; margin: 16px 0; padding: 12px 18px; background: ${panel}; font-style: italic; color: #374151; border-radius: 0 6px 6px 0; }
    ol.apps { margin: 8px 0 12px 22px; } ol.apps li { margin-bottom: 8px; font-size: 15px; }
    .media-grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .media-item { flex: 1 1 280px; }
    .media-item img { width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; max-height: 220px; object-fit: cover; }
    .caption { font-size: 12px; color: #6b7280; margin-top: 4px; font-style: italic; text-align: center; }
    .page-break { page-break-before: always; }
    .notes-header { color: #b91c1c; border-color: #fca5a5; }
    .speaker-notes { font-family: 'Courier New', monospace; font-size: 13px; color: #374151; background: #fef9e7; padding: 16px; border-radius: 8px; border: 1px solid #f3e2a8; line-height: 1.8; white-space: pre-wrap; }
    .footer { margin-top: 44px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 22px; max-width: 100%; } a { text-decoration: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="kicker">${escapeHtml(sermon.tone || 'Sermon')}</div>
    <div class="title">${escapeHtml(structured.title || sermon.title)}</div>
    ${structured.theme ? `<div class="theme">${escapeHtml(structured.theme)}</div>` : ''}
    <div class="meta">
      ${(sermon.scripture_ref || structured.scripture) ? `<span>📖 ${escapeHtml((sermon.scripture_ref || structured.scripture).split('\n')[0])}</span>` : ''}
      <span>📅 ${date}</span>
      <span>🌐 ${escapeHtml(sermon.language || 'English')}</span>
    </div>
  </div>

  ${structured.scripture ? `<blockquote>${escapeHtml(structured.scripture)}</blockquote>` : ''}
  ${structured.introduction ? `<div class="section-header">Introduction</div>${p(structured.introduction)}` : ''}
  ${pointsHtml}
  ${appsHtml}
  ${structured.conclusion ? `<div class="section-header">Conclusion</div>${p(structured.conclusion)}` : ''}
  ${structured.prayer ? `<div class="section-header">Closing Prayer</div><blockquote>${escapeHtml(structured.prayer)}</blockquote>` : ''}
  ${mediaSection}
  ${notesSection}

  <div class="footer">Generated by SabAi Sermon • ${date}</div>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 400)
}
