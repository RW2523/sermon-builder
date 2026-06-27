import { describe, it, expect } from 'vitest'
import { normalizeStructured, emptyStructured, structuredToPlainText } from './structured'

describe('normalizeStructured', () => {
  it('passes through a well-formed sermon', () => {
    const s = normalizeStructured({
      title: 'The Good Shepherd',
      theme: 'Rest',
      scripture: 'Psalm 23',
      introduction: 'Intro',
      main_points: [{ heading: 'Point 1', body: 'Body 1', scripture: 'Ps 23:1' }],
      applications: ['Trust Him'],
      conclusion: 'Conclusion',
      prayer: 'Amen',
    })
    expect(s.title).toBe('The Good Shepherd')
    expect(s.main_points).toHaveLength(1)
    expect(s.main_points[0]).toMatchObject({ heading: 'Point 1', body: 'Body 1', scripture: 'Ps 23:1' })
  })

  it('coerces aliased keys (mainPoints/points, title/heading, verse)', () => {
    const s = normalizeStructured({
      title: 'X',
      verse: 'John 3:16',
      mainPoints: [{ title: 'Heading via title', content: 'Body via content' }],
      application: ['One', 'Two'],
    })
    expect(s.scripture).toBe('John 3:16')
    expect(s.main_points[0].heading).toBe('Heading via title')
    expect(s.main_points[0].body).toBe('Body via content')
    expect(s.applications).toEqual(['One', 'Two'])
  })

  it('never throws on garbage and uses the fallback title', () => {
    expect(() => normalizeStructured(null)).not.toThrow()
    expect(() => normalizeStructured('a string')).not.toThrow()
    expect(normalizeStructured({}, 'Fallback').title).toBe('Fallback')
    expect(normalizeStructured(undefined).main_points).toEqual([])
  })

  it('drops empty points', () => {
    const s = normalizeStructured({ main_points: [{ heading: '', body: '' }, { heading: 'Keep', body: '' }] })
    expect(s.main_points).toHaveLength(1)
    expect(s.main_points[0].heading).toBe('Keep')
  })
})

describe('emptyStructured', () => {
  it('produces a valid empty shell', () => {
    const e = emptyStructured('My Title')
    expect(e.title).toBe('My Title')
    expect(e.main_points).toEqual([])
    expect(e.applications).toEqual([])
  })
})

describe('structuredToPlainText', () => {
  it('includes the point headings, bodies and applications', () => {
    const text = structuredToPlainText(
      normalizeStructured({
        title: 'Faith',
        main_points: [{ heading: 'Believe', body: 'Have faith.' }],
        applications: ['Pray daily'],
      }),
    )
    expect(text).toContain('Believe')
    expect(text).toContain('Have faith.')
    expect(text).toContain('Pray daily')
  })
})
