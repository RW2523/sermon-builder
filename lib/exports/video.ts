import type { SermonMedia } from '@/types'

export interface VideoConfig {
  audioBlob: Blob
  images: SermonMedia[]
  title: string
  onProgress?: (pct: number) => void
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

export async function renderAudioVideo({
  audioBlob,
  images,
  title,
  onProgress,
}: VideoConfig): Promise<Blob> {
  const WIDTH = 1280
  const HEIGHT = 720

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')!

  // Load images
  const imgElements: HTMLImageElement[] = []
  for (const item of images) {
    if (!item.public_url) continue
    try {
      const el = await loadImageElement(item.public_url)
      imgElements.push(el)
    } catch {
      // skip unloadable image
    }
  }

  // Determine audio duration
  const audioUrl = URL.createObjectURL(audioBlob)
  const audioEl = new Audio(audioUrl)
  const audioDuration = await new Promise<number>((resolve) => {
    audioEl.onloadedmetadata = () => resolve(audioEl.duration)
    audioEl.load()
  })

  // Set up MediaRecorder on canvas stream
  const canvasStream = canvas.captureStream(30)

  // Mix audio into the stream
  const audioContext = new AudioContext()
  const audioSource = audioContext.createMediaElementSource(audioEl)
  const streamDestination = audioContext.createMediaStreamDestination()
  audioSource.connect(streamDestination)
  audioSource.connect(audioContext.destination)

  // Combine video + audio tracks
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...streamDestination.stream.getAudioTracks(),
  ])

  // Pick best codec
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm'

  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(combinedStream, { mimeType })
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  // Draw loop
  const fps = 30
  const frameDuration = 1 / fps

  // Image per second allocation
  const imgDwell = imgElements.length > 0 ? audioDuration / imgElements.length : audioDuration
  let startTime: number | null = null
  let animFrameId: number

  function drawFrame(ts: number) {
    if (!startTime) startTime = ts
    const elapsed = (ts - startTime) / 1000

    // Determine current image
    const imgIndex = Math.min(Math.floor(elapsed / imgDwell), imgElements.length - 1)
    const nextIndex = Math.min(imgIndex + 1, imgElements.length - 1)

    // Cross-fade factor (last 0.5s of each image)
    const timeInSlide = elapsed - imgIndex * imgDwell
    const fadeStart = imgDwell - 0.5
    const alpha = timeInSlide > fadeStart && nextIndex !== imgIndex
      ? (timeInSlide - fadeStart) / 0.5
      : 0

    // Clear
    ctx.fillStyle = '#0D0020'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    if (imgElements.length > 0) {
      // Draw current image (cover)
      drawCoverImage(ctx, imgElements[imgIndex], WIDTH, HEIGHT)

      if (alpha > 0 && nextIndex !== imgIndex) {
        ctx.globalAlpha = Math.min(alpha, 1)
        drawCoverImage(ctx, imgElements[nextIndex], WIDTH, HEIGHT)
        ctx.globalAlpha = 1
      }
    } else {
      // No images — gradient background
      const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
      grad.addColorStop(0, '#1a0533')
      grad.addColorStop(1, '#0d0020')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }

    // Semi-transparent overlay for text readability
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, HEIGHT - 120, WIDTH, 120)

    // Title text
    ctx.fillStyle = '#F3E8FF'
    ctx.font = 'bold 32px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText(title, WIDTH / 2, HEIGHT - 65)

    // Progress bar
    const progress = Math.min(elapsed / audioDuration, 1)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fillRect(40, HEIGHT - 30, WIDTH - 80, 6)
    ctx.fillStyle = '#D4AF37'
    ctx.fillRect(40, HEIGHT - 30, (WIDTH - 80) * progress, 6)

    onProgress?.(Math.round(progress * 100))

    if (elapsed < audioDuration) {
      animFrameId = requestAnimationFrame(drawFrame)
    }
  }

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      URL.revokeObjectURL(audioUrl)
      audioContext.close()
      resolve(new Blob(chunks, { type: mimeType }))
    }
    recorder.onerror = reject

    recorder.start(100) // collect data every 100ms

    audioEl.play().then(() => {
      animFrameId = requestAnimationFrame(drawFrame)
    })

    audioEl.onended = () => {
      cancelAnimationFrame(animFrameId)
      recorder.stop()
    }

    // Safety timeout
    setTimeout(() => {
      if (recorder.state === 'recording') {
        cancelAnimationFrame(animFrameId)
        recorder.stop()
      }
    }, (audioDuration + 3) * 1000)
  })
}

function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  const sw = img.naturalWidth * scale
  const sh = img.naturalHeight * scale
  const sx = (W - sw) / 2
  const sy = (H - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh)
}
