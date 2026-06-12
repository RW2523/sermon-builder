import sanitize from 'sanitize-html'

// AI-polished sermon HTML originates from user-uploaded documents and
// transcripts, so it must be treated as untrusted before rendering.
// sanitize-html is pure JS (no jsdom), so it runs in both the serverless
// share page and the browser print view.
export function sanitizeHtml(html: string): string {
  return sanitize(html, {
    allowedTags: sanitize.defaults.allowedTags.concat(['img', 'h1', 'h2']),
    allowedAttributes: {
      ...sanitize.defaults.allowedAttributes,
      img: ['src', 'alt'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
  })
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
