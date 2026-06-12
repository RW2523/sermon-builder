import DOMPurify from 'isomorphic-dompurify'

// AI-polished sermon HTML originates from user-uploaded documents and
// transcripts, so it must be treated as untrusted before rendering.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
