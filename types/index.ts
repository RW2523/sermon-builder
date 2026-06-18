import type { SlidePlan } from './slides'

export type SermonStatus = 'draft' | 'polished' | 'multimedia' | 'exported' | 'published'
export type SermonStage = 1 | 2 | 3 | 4
export type InputKind = 'text' | 'dictation' | 'audio' | 'file' | 'bible_ref' | 'document'
export type TemplateType =
  | 'prayer'
  | 'message'
  | 'story'
  | 'devotional'
  | 'teaching'
  | 'testimony'
  | 'youth'
  | 'small_group'
  | 'storytelling'
  | 'custom'
export type MediaKind = 'image' | 'map' | 'timeline' | 'scripture_slide' | 'graphic'
export type ExportFormat = 'pdf' | 'ppt' | 'video' | 'print'

// ── v2 structured sermon model (source of truth for editor + exports) ──
export interface SermonPoint {
  heading: string
  body: string
  scripture?: string | null
}

export interface StructuredSermon {
  title: string
  theme: string
  scripture: string
  introduction: string
  main_points: SermonPoint[]
  applications: string[]
  conclusion: string
  prayer: string
}

export type ExportTemplateId =
  | 'navy_gold'
  | 'light_classic'
  | 'royal_purple'
  | 'minimal_slate'
  | 'warm_sand'

export interface SermonTone {
  id: string
  label: string
  hint: string
}

export interface SermonLanguage {
  code: string
  label: string
  /** true when the script needs system/browser fonts (not Latin) for faithful PDF rendering */
  complexScript?: boolean
}

export interface Profile {
  id: string
  full_name: string | null
  church: string | null
  role: string
  avatar_url: string | null
  created_at: string
}

export interface Sermon {
  id: string
  user_id: string
  title: string
  status: SermonStatus
  current_stage: SermonStage
  scripture_ref: string | null
  theme: string | null
  language: string
  tone: string
  export_template: ExportTemplateId
  created_at: string
  updated_at: string
}

export interface SermonInput {
  id: string
  sermon_id: string
  kind: InputKind
  raw_text: string | null
  storage_path: string | null
  transcription: string | null
  created_at: string
}

export interface SermonDraft {
  id: string
  sermon_id: string
  polished_html: string | null
  structured: StructuredSermon | null
  slide_plan: SlidePlan | null
  template_type: TemplateType
  version: number
  speaker_notes: string | null
  created_at: string
  updated_at: string
}

export interface SermonMedia {
  id: string
  sermon_id: string
  kind: MediaKind
  prompt: string | null
  storage_path: string | null
  public_url: string | null
  caption: string | null
  order_index: number
  created_at: string
}

export interface SermonExport {
  id: string
  sermon_id: string
  format: ExportFormat
  storage_path: string | null
  public_url: string | null
  created_at: string
}

export interface OutreachPost {
  id: string
  sermon_id: string
  share_slug: string
  is_public: boolean
  social_caption: string | null
  hashtags: string[] | null
  summary: string | null
  created_at: string
}

export interface SermonWithDraft extends Sermon {
  draft?: SermonDraft | null
  media?: SermonMedia[]
  outreach?: OutreachPost | null
}
