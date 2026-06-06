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

export function openPrintView(sermon: Sermon, draft: SermonDraft, media: SermonMedia[], speakerNotes?: string | null) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const mediaSection = media.length > 0 ? `
    <div class="section-header">Visual Aids (${media.length})</div>
    <div class="media-grid">
      ${media.map(m => m.public_url ? `
        <div class="media-item">
          <img src="${m.public_url}" alt="${m.caption ?? m.prompt ?? ''}" />
          ${m.caption ? `<p class="caption">${m.caption}</p>` : ''}
          ${m.prompt ? `<p class="prompt-text">${m.prompt}</p>` : ''}
        </div>
      ` : '').join('')}
    </div>
  ` : ''

  const notesSection = (speakerNotes || draft.speaker_notes) ? `
    <div class="page-break"></div>
    <div class="section-header speaker-notes-header">Speaker Notes (Private — Not For Distribution)</div>
    <div class="speaker-notes">${(speakerNotes ?? draft.speaker_notes ?? '').replace(/\n/g, '<br/>')}</div>
  ` : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sermon.title} — Sermon Notes</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      color: #1a1a2e;
      background: #fff;
      max-width: 680px;
      margin: 0 auto;
      padding: 40px 32px;
      line-height: 1.7;
    }
    .sermon-header { border-bottom: 3px solid #4c1d95; padding-bottom: 20px; margin-bottom: 28px; }
    .sermon-title { font-size: 28px; font-weight: bold; color: #1e1b4b; margin-bottom: 8px; }
    .sermon-meta { font-size: 13px; color: #6b7280; display: flex; flex-wrap: wrap; gap: 12px; }
    .sermon-meta span { display: flex; align-items: center; gap: 4px; }
    .badge { background: #4c1d95; color: white; padding: 2px 10px; border-radius: 12px; font-size: 11px; }
    .section-header {
      font-size: 11px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase;
      color: #7c3aed; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;
      margin: 28px 0 14px;
    }
    .sermon-body { font-size: 15px; }
    .sermon-body h2 { font-size: 20px; font-weight: bold; color: #1e1b4b; margin: 24px 0 8px; }
    .sermon-body h3 { font-size: 16px; font-weight: bold; color: #4c1d95; margin: 18px 0 6px; }
    .sermon-body p { margin-bottom: 12px; }
    .sermon-body ul, .sermon-body ol { margin: 8px 0 12px 24px; }
    .sermon-body li { margin-bottom: 6px; }
    .sermon-body blockquote {
      border-left: 4px solid #7c3aed; margin: 16px 0;
      padding: 10px 16px; background: #f5f3ff; font-style: italic; color: #374151;
      border-radius: 0 8px 8px 0;
    }
    .sermon-body strong { color: #1e1b4b; }
    .media-grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .media-item { flex: 1 1 280px; }
    .media-item img { width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; max-height: 200px; object-fit: cover; }
    .caption { font-size: 12px; color: #6b7280; margin-top: 4px; font-style: italic; text-align: center; }
    .prompt-text { font-size: 11px; color: #9ca3af; margin-top: 2px; text-align: center; }
    .page-break { page-break-before: always; margin-top: 40px; }
    .speaker-notes-header { color: #dc2626; border-color: #fca5a5; }
    .speaker-notes {
      font-family: 'Courier New', Courier, monospace; font-size: 13px;
      color: #374151; background: #fef3c7; padding: 16px;
      border-radius: 8px; border: 1px solid #fde68a; line-height: 1.8;
      white-space: pre-wrap;
    }
    .print-footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
    @media print {
      body { padding: 20px; max-width: 100%; }
      .page-break { page-break-before: always; }
      a { text-decoration: none; }
    }
  </style>
</head>
<body>
  <div class="sermon-header">
    <div class="sermon-title">${sermon.title}</div>
    <div class="sermon-meta">
      ${sermon.scripture_ref ? `<span>📖 ${sermon.scripture_ref}</span>` : ''}
      ${sermon.theme ? `<span>🎯 ${sermon.theme}</span>` : ''}
      <span>📅 ${date}</span>
      <span><span class="badge">${(draft.template_type ?? 'sermon').replace('_', ' ').toUpperCase()}</span></span>
    </div>
  </div>

  <div class="section-header">Sermon Content</div>
  <div class="sermon-body">${draft.polished_html ?? ''}</div>

  ${mediaSection}
  ${notesSection}

  <div class="print-footer">Generated by Sermon Builder Studio • ${date}</div>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 400)
}
