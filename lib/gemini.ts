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

export async function generateImageBase64(prompt: string, highQuality = false): Promise<string> {
  const ai = getAI()
  const model = highQuality ? MODELS.imagePro : MODELS.imageFlash
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  })

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if ('inlineData' in part && part.inlineData?.data) {
      return part.inlineData.data
    }
  }
  throw new Error('No image generated')
}
