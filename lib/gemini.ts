import { GoogleGenAI } from '@google/genai'

export const MODELS = {
  flash: 'gemini-3-flash-preview',
  pro: 'gemini-3-pro-preview',
  imageFlash: 'gemini-2.5-flash-image',
  imagePro: 'gemini-3-pro-image-preview',
} as const

function getAI() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY environment variable is not set')
  return new GoogleGenAI({ apiKey: key })
}

export async function generateText(prompt: string, model = MODELS.flash): Promise<string> {
  const ai = getAI()
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  })
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
      const response = await ai.models.generateContent({ model, contents: prompt })
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
