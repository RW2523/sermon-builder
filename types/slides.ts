// Content-aware slide plan emitted by the LLM planner and consumed by the
// export engine. The planner decides, per slide, one of the named layouts and
// at most one visual via a strict priority cascade
// (route > map > timeline > diagram > scriptureArt > scene > none).

export type LayoutName =
  | 'cover'             // full-bleed hero, lower-anchored title
  | 'fullBleedCaption'  // image fills slide, one short phrase
  | 'split'             // 60/40 image + text (imageSide L/R)
  | 'figure'            // text + a FRAMED content image with caption
  | 'showcase'          // a large framed image as the hero subject
  | 'scripture'         // featured verse, quiet + spacious
  | 'bigStat'           // one oversized number/word
  | 'bento'             // asymmetric tile grid
  | 'threeCol'          // three parallel points
  | 'timelineSlide'     // sequence / progression
  | 'pullQuote'         // non-scripture quote
  | 'twoUp'             // before/after, law/grace
  | 'sectionDivider'    // numbered section break
  | 'closing'           // benediction / sending

export type SlideRole =
  | 'cover' | 'section' | 'teaching' | 'scripture' | 'application'
  | 'illustration' | 'stat' | 'comparison' | 'framework' | 'prayer' | 'closing'

export type VisualType =
  | 'none'          // text-only (default, majority)
  | 'scene'         // AI full-bleed background (label-free)
  | 'scriptureArt'  // programmatic verse card
  | 'map'           // programmatic biblical-location map
  | 'route'         // programmatic ordered journey route
  | 'timeline'      // programmatic timeline
  | 'diagram'       // programmatic concept diagram

export type DiagramShape = 'hubSpoke' | 'flow' | 'compare' | 'pyramid' | 'list'
export type Emphasis = 'normal' | 'breath' | 'climax'
export type ImageSide = 'left' | 'right'

export interface VisualSpec {
  type: VisualType
  /** Human-readable intent (AI subject or diagram purpose). Doubles as a
   *  caption for framed content images (figure/showcase). */
  spec?: string
  /** scene only — full cinematic prompt; must forbid text in the image. */
  prompt?: string
  /** Resolved per-slide AI image URL (filled in after the plan is generated). */
  imageUrl?: string
  highQuality?: boolean
  // Structured payloads — exactly the one matching `type` is populated:
  scripture?: { text: string; reference: string }
  places?: Array<{ name: string; note?: string }>
  routeStops?: Array<{ name: string; order: number; note?: string }>
  events?: Array<{ label: string; date?: string; note?: string }>
  diagram?: {
    shape: DiagramShape
    center?: string
    nodes: Array<{ label: string; detail?: string }>
    leftHeader?: string
    rightHeader?: string
    leftItems?: string[]
    rightItems?: string[]
  }
}

export interface SlideSpec {
  layout: LayoutName
  role: SlideRole
  emphasis: Emphasis
  kicker?: string        // tracked-caps eyebrow, <= 4 words
  heading: string        // <= 10 words, the single headline
  subheading?: string
  body?: string[]        // 0–5 short lines
  reference?: string     // scripture ref / attribution
  stat?: { value: string; label?: string }
  imageSide?: ImageSide
  visual: VisualSpec
}

export interface SlidePlan {
  meta: { title: string; theme: string; generatedFor: string }
  slides: SlideSpec[]
}
