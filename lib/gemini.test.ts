import { describe, it, expect } from 'vitest'
import { parseModelJson } from './gemini'

describe('parseModelJson', () => {
  it('parses a plain JSON object', () => {
    expect(parseModelJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' })
  })

  it('strips ```json fences', () => {
    expect(parseModelJson('```json\n{"ok":true}\n```')).toEqual({ ok: true })
  })

  it('recovers JSON from surrounding prose', () => {
    expect(parseModelJson('Sure! Here you go: {"title":"Grace"} — enjoy')).toEqual({ title: 'Grace' })
  })

  it('parses arrays', () => {
    expect(parseModelJson('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('throws on genuinely unparseable input', () => {
    expect(() => parseModelJson('not json at all')).toThrow()
  })
})
