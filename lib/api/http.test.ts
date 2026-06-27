import { describe, it, expect } from 'vitest'
import { parseJsonBody } from './http'

const post = (body: string) =>
  new Request('http://localhost/api/test', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } })

describe('parseJsonBody', () => {
  it('returns the parsed object for valid JSON', async () => {
    expect(await parseJsonBody(post('{"sermonId":"abc","count":3}'))).toEqual({ sermonId: 'abc', count: 3 })
  })

  it('returns null for an empty body', async () => {
    expect(await parseJsonBody(post(''))).toBeNull()
  })

  it('returns null for malformed JSON', async () => {
    expect(await parseJsonBody(post('{not valid'))).toBeNull()
  })

  it('returns null for a non-object JSON body', async () => {
    expect(await parseJsonBody(post('"just a string"'))).toBeNull()
    expect(await parseJsonBody(post('42'))).toBeNull()
  })
})
