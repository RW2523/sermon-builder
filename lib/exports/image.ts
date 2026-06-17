// Browser-side image normalisation for exports. Gemini PNGs are large
// (often 1–2 MB each) and pptxgenjs/jsPDF embed a copy per use, so decks with
// an image on every slide balloon past 40 MB. Downscaling to a sane max width
// and re-encoding as JPEG once keeps exports a few MB while staying crisp on a
// projector. Returns a JPEG data URL plus pixel dimensions.

export interface PreparedImage {
  dataUrl: string
  w: number
  h: number
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

export async function prepareImage(url: string, maxW = 1600, quality = 0.82): Promise<PreparedImage | null> {
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxW / (img.naturalWidth || maxW))
    const w = Math.round((img.naturalWidth || maxW) * scale)
    const h = Math.round((img.naturalHeight || maxW) * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // White matte so any transparency flattens cleanly under JPEG.
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), w, h }
  } catch {
    return null
  }
}
