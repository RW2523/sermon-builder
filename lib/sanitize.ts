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

// The single HTML/SVG escaper for the app — full quote-escaping so it is safe
// in both text-content and attribute positions. Coerces non-strings (SVG
// builders pass numbers). structured.ts and visuals/svg.ts both import this.
export function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
