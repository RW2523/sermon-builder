import { describe, it, expect } from 'vitest'
import { buildContentPlan } from './contentPlan'
import { normalizeStructured } from '@/lib/sermon/structured'

const sermon = normalizeStructured({
  title: 'The Good Shepherd',
  theme: 'Finding rest',
  scripture: 'Psalm 23 (KJV): The Lord is my shepherd; I shall not want.',
  introduction: 'We are restless people. We chase and we strive. Yet rest is offered.',
  main_points: [
    { heading: 'The Shepherd Provides', body: 'He makes me lie down in green pastures. He leads me beside still waters. He restores my soul. This is His promise to every weary heart that comes.' },
    { heading: 'The Shepherd Protects', body: 'Though I walk through the valley of the shadow of death, I will fear no evil. His rod and staff comfort me.' },
  ],
  applications: ['Rest in Him this week', 'Trust His leading', 'Release your striving'],
  conclusion: 'Come to the Shepherd and find rest for your soul.',
  prayer: 'Lord, be our shepherd. Amen.',
})

describe('buildContentPlan', () => {
  it('opens with a cover and ends with a closing/prayer', () => {
    const plan = buildContentPlan(sermon, { themeId: 'navy_gold' })
    expect(plan.slides[0].layout).toBe('cover')
    const last = plan.slides[plan.slides.length - 1]
    expect(['closing']).toContain(last.layout)
    expect(['prayer', 'closing']).toContain(last.role)
  })

  it('carries the real scripture verse text onto a scripture slide', () => {
    const plan = buildContentPlan(sermon, { themeId: 'navy_gold' })
    const scriptureSlide = plan.slides.find((s) => s.role === 'scripture')
    expect(scriptureSlide).toBeTruthy()
    expect(scriptureSlide?.visual.type).toBe('scriptureArt')
  })

  it('carries each main point heading and real teaching body', () => {
    const plan = buildContentPlan(sermon, { themeId: 'navy_gold' })
    const headings = plan.slides.map((s) => s.heading)
    expect(headings).toContain('The Shepherd Provides')
    expect(headings).toContain('The Shepherd Protects')
    const teaching = plan.slides.filter((s) => s.role === 'teaching')
    const allBody = teaching.flatMap((s) => (Array.isArray(s.body) ? s.body : [s.body ?? ''])).join(' ')
    expect(allBody).toContain('green pastures')
  })

  it('lists the applications on an application slide', () => {
    const plan = buildContentPlan(sermon, { themeId: 'navy_gold' })
    const appSlide = plan.slides.find((s) => s.role === 'application')
    expect(appSlide).toBeTruthy()
    expect((appSlide?.body as string[]).join(' ')).toContain('Rest in Him this week')
  })

  it('produces a reasonable deck size and never zero slides', () => {
    const plan = buildContentPlan(sermon, { themeId: 'navy_gold', targetSlideCount: 16 })
    expect(plan.slides.length).toBeGreaterThan(6)
    expect(plan.slides.length).toBeLessThanOrEqual(60)
  })
})
