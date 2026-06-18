import type { StructuredSermon } from '@/types'
import type { SlidePlan, SlideSpec } from '@/types/slides'

// Deterministic plan built directly from a StructuredSermon — no LLM. Used as
// a guaranteed fallback (and baseline) when the planner is unavailable. It can
// only choose scene / scriptureArt / none (it cannot infer maps/timelines from
// raw text the way the LLM planner does), so it stays conservative and clean.

function firstSentence(text: string, max = 90): string {
  const s = text.split(/(?<=[.!?])\s/)[0] ?? text
  return s.length > max ? s.slice(0, max).trim() + '…' : s.trim()
}

function paras(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

export function buildFallbackPlan(s: StructuredSermon, themeId: string): SlidePlan {
  const slides: SlideSpec[] = []

  slides.push({
    layout: 'cover', role: 'cover', emphasis: 'climax',
    kicker: 'Sermon', heading: s.title,
    subheading: s.theme || undefined,
    reference: s.scripture ? s.scripture.split('\n')[0].split('(')[0].trim().slice(0, 60) : undefined,
    visual: { type: 'scene', spec: s.theme || s.title, highQuality: true },
  })

  if (s.scripture) {
    slides.push({
      layout: 'scripture', role: 'scripture', emphasis: 'breath',
      kicker: 'Scripture', heading: s.scripture.split('(')[0].split('\n')[0].trim().slice(0, 60),
      reference: s.scripture.match(/\(([^)]+)\)/)?.[1],
      visual: { type: 'scriptureArt', scripture: { text: s.scripture.replace(/^[^:]*:\s*/, '').slice(0, 320), reference: s.scripture.split('(')[0].split('\n')[0].trim() } },
    })
  }

  const introParas = paras(s.introduction)
  if (introParas.length) {
    const p = introParas
    slides.push({
      layout: 'split', role: 'teaching', emphasis: 'normal', imageSide: 'right',
      kicker: 'Introduction', heading: firstSentence(p[0] ?? s.introduction, 60),
      body: p.slice(0, 3).map((x) => firstSentence(x, 160)),
      visual: { type: 'scene', spec: `${s.theme} introduction mood` },
    })
  }

  s.main_points.forEach((pt, i) => {
    slides.push({
      layout: 'sectionDivider', role: 'section', emphasis: 'normal',
      kicker: `Part ${i + 1}`, heading: pt.heading || `Point ${i + 1}`,
      visual: { type: 'scene', spec: pt.heading },
    })
    if (pt.scripture) {
      slides.push({
        layout: 'scripture', role: 'scripture', emphasis: 'breath',
        kicker: 'Scripture', heading: pt.scripture.split('(')[0].trim().slice(0, 60),
        reference: pt.scripture.match(/\(([^)]+)\)/)?.[1],
        visual: { type: 'scriptureArt', scripture: { text: pt.scripture.replace(/^[^:]*:\s*/, '').slice(0, 280), reference: pt.scripture.split('(')[0].trim() } },
      })
    }
    if (pt.body?.trim() || pt.heading?.trim()) {
      slides.push({
        layout: 'split', role: 'teaching', emphasis: 'normal',
        imageSide: i % 2 === 0 ? 'right' : 'left',
        kicker: pt.heading?.slice(0, 24), heading: firstSentence(pt.body || pt.heading, 56),
        body: paras(pt.body).slice(0, 3).map((x) => firstSentence(x, 150)),
        visual: { type: 'none' },
      })
    }
  })

  const applications = (s.applications ?? []).filter((a) => a?.trim())
  if (applications.length) {
    slides.push({
      layout: 'bento', role: 'application', emphasis: 'normal',
      kicker: 'This Week', heading: 'Living It Out',
      body: applications.slice(0, 5),
      visual: { type: 'none' },
    })
  }

  if (s.conclusion) {
    slides.push({
      layout: 'split', role: 'teaching', emphasis: 'normal', imageSide: 'left',
      kicker: 'Conclusion', heading: firstSentence(s.conclusion, 56),
      body: paras(s.conclusion).slice(0, 2).map((x) => firstSentence(x, 170)),
      visual: { type: 'scene', spec: `${s.theme} resolution` },
    })
  }

  slides.push({
    layout: 'closing', role: s.prayer ? 'prayer' : 'closing', emphasis: 'climax',
    kicker: s.prayer ? 'Closing Prayer' : 'Benediction',
    heading: s.prayer ? firstSentence(s.prayer, 80) : 'Go in Peace',
    body: s.prayer ? paras(s.prayer).slice(0, 1) : undefined,
    visual: { type: 'scene', spec: `${s.theme} benediction, peaceful` },
  })

  return { meta: { title: s.title, theme: themeId, generatedFor: 'fallback' }, slides }
}
