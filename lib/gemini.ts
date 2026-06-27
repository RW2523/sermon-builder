import { GoogleGenAI } from '@google/genai'

export const MODELS = {
  flash: 'gemini-3-flash-preview',
  imageFlash: 'gemini-2.5-flash-image',
  imagePro: 'gemini-3-pro-image-preview',
} as const

function getAI() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY environment variable is not set')
  return new GoogleGenAI({ apiKey: key })
}

export interface GenTextOptions {
  /** Hard cap on generated tokens. Bounds cost on the preview reasoning models. */
  maxOutputTokens?: number
  temperature?: number
  /** Cap the (billed) thinking tokens these gemini-3 preview models emit. */
  thinkingBudget?: number
  /** Abort (and free the function) if the model hasn't responded in time. */
  timeoutMs?: number
  /** Ask the model for raw JSON (no prose/fences). */
  json?: boolean
}

export async function generateText(
  prompt: string,
  model = MODELS.flash,
  opts: GenTextOptions = {},
): Promise<string> {
  const ai = getAI()
  // NB: AbortSignal is client-side — it frees our serverless function from a
  // hung request (returning a clean error instead of dying at maxDuration); it
  // does not cancel upstream billing. maxOutputTokens/thinkingBudget are what
  // actually bound spend.
  const config: Record<string, unknown> = {
    abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    temperature: opts.temperature ?? 0.8,
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
    thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 4096 },
  }
  if (opts.json) config.responseMimeType = 'application/json'

  let response
  try {
    response = await ai.models.generateContent({ model, contents: prompt, config })
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new Error(`Gemini request timed out (model: ${model})`)
    }
    throw err
  }
  const text = (response.candidates?.[0]?.content?.parts ?? [])
    .map((part) => ('text' in part ? part.text ?? '' : ''))
    .join('')
  if (!text.trim()) {
    throw new Error(`Gemini returned an empty response (model: ${model}, finishReason: ${response.candidates?.[0]?.finishReason ?? 'unknown'})`)
  }
  return text
}

/** Parse JSON from a model response, tolerating ```json fences and stray prose. */
export function parseModelJson<T = unknown>(raw: string): T {
  let text = raw.replace(/```json\s*|```/gi, '').trim()
  // Fall back to the outermost { … } if the model added a preamble
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) text = text.slice(start, end + 1)
  }
  return JSON.parse(text) as T
}

/**
 * Generate an image, trying models in order until one returns image data.
 * Mirrors the resilient fallback approach so a single model outage doesn't
 * fail the whole request.
 */
export async function generateImageBase64(prompt: string, highQuality = false): Promise<string> {
  const ai = getAI()
  const chain = highQuality
    ? [MODELS.imagePro, MODELS.imageFlash]
    : [MODELS.imageFlash, MODELS.imagePro]

  let lastErr: unknown = null
  for (const model of chain) {
    try {
      // Per-attempt timeout so a single hung model fails fast and we move to
      // the fallback instead of eating the whole route's maxDuration budget.
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { abortSignal: AbortSignal.timeout(45_000) },
      })
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if ('inlineData' in part && part.inlineData?.data) {
          return part.inlineData.data
        }
      }
      lastErr = new Error(`Model ${model} returned no image data`)
    } catch (err) {
      lastErr = err
      console.warn(`Image model ${model} failed, trying next:`, err)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No image generated')
}
