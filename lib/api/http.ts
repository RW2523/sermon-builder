import { NextResponse } from 'next/server'

/**
 * Parse a JSON request body without letting a malformed/empty body become an
 * unhandled 500. Returns the parsed object, or null when the body isn't valid
 * JSON — callers return a 400 in that case.
 */
export async function parseJsonBody<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as T) : null
  } catch {
    return null
  }
}

export const badRequest = (message = 'Invalid request body') =>
  NextResponse.json({ error: message }, { status: 400 })

/** Standard upstream/model-failure response (empty/blocked/malformed model output). */
export const upstreamError = (message = 'The service is temporarily unavailable — please try again') =>
  NextResponse.json({ error: message }, { status: 502 })
