'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import {
  FileText, Presentation, Video, Share2, Loader2, ArrowLeft,
  Copy, CheckCheck, Globe, Mic, MicOff, Download, Sparkles, Wand2,
  ExternalLink, BookOpen, Printer, ChevronDown, ChevronUp
} from 'lucide-react'
import type { Sermon, SermonDraft, SermonMedia, OutreachPost, ExportTemplateId, StructuredSermon } from '@/types'
import type { SlidePlan } from '@/types/slides'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { EXPORT_THEMES, SLIDE_COUNT, isComplexScript, withHash } from '@/lib/sermon/templates'
import { htmlToStructured } from '@/lib/sermon/legacy'

interface Props {
  sermon: Sermon
  draft: SermonDraft | null
  media: SermonMedia[]
  outreach: OutreachPost | null
  onOutreachChange: (o: OutreachPost) => void
  onSermonChange: (s: Sermon) => void
  onDraftChange: (d: SermonDraft) => void
  onBack: () => void
}

export default function Stage4Export({
  sermon, draft, media, outreach, onOutreachChange, onSermonChange, onDraftChange, onBack,
}: Props) {
  const supabase = createClient()

  // Export states
  const [exportingPDF, setExportingPDF] = useState(false)
  const [exportingPPT, setExportingPPT] = useState(false)
  const [renderingVideo, setRenderingVideo] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Design / format controls
  const [templateId, setTemplateId] = useState<ExportTemplateId>(sermon.export_template ?? 'navy_gold')
  const [slideCount, setSlideCount] = useState<number>(SLIDE_COUNT.default)
  const [slidePlan, setSlidePlan] = useState<SlidePlan | null>(draft?.slide_plan ?? null)
  const [planCount, setPlanCount] = useState<number>(draft?.slide_plan?.slides.length ?? 0)
  const [planning, setPlanning] = useState(false)

  // The deck "plan" decides each slide's layout + the right visual (scene,
  // map, route, timeline, diagram, scripture art, or clean text). Generated
  // once and reused; regenerate to honor a new slide count or for variety.
  async function ensurePlan(force = false): Promise<SlidePlan | null> {
    if (!force && slidePlan?.slides?.length) return slidePlan
    setPlanning(true)
    try {
      const res = await fetch('/api/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sermonId: sermon.id, themeId: templateId, targetSlideCount: slideCount }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Could not design the deck'); return null }
      setSlidePlan(json.plan)
      setPlanCount(json.plan?.slides?.length ?? 0)
      return json.plan
    } catch {
      toast.error('Could not design the deck — check your connection')
      return null
    } finally {
      setPlanning(false)
    }
  }

  async function handleRedesign() {
    const plan = await ensurePlan(true)
    if (plan) toast.success(`Deck designed — ${plan.slides.length} slides, each with the right visual`)
  }

  // The structured sermon is the export source of truth; fall back for legacy drafts
  function resolveStructured(): StructuredSermon | null {
    if (!draft) return null
    return draft.structured ?? htmlToStructured(draft.polished_html ?? '', sermon.title)
  }

  async function persistTemplate(id: ExportTemplateId) {
    setTemplateId(id)
    onSermonChange({ ...sermon, export_template: id })
    await supabase.from('sermons').update({ export_template: id }).eq('id', sermon.id)
  }

  // Speaker notes
  const [generatingNotes, setGeneratingNotes] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [editableNotes, setEditableNotes] = useState(draft?.speaker_notes ?? '')

  // Outreach
  const [generatingOutreach, setGeneratingOutreach] = useState(false)
  const [socialData, setSocialData] = useState<Record<string, unknown> | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // Audio recording for video
  const [isRecording, setIsRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null)
  const [audioDuration, setAudioDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startTimeRef = useRef<number>(0)

  async function handleExportPDF() {
    const structured = resolveStructured()
    if (!structured) { toast.error('Generate your sermon first'); return }
    // jsPDF can't shape complex scripts (Hindi/Tamil/Telugu/Malayalam) — the
    // browser print view renders those faithfully, so route there instead.
    if (isComplexScript(sermon.language)) {
      const { openPrintView } = await import('@/lib/exports/print')
      openPrintView(sermon, structured, media, { templateId, speakerNotes: editableNotes || draft?.speaker_notes, language: sermon.language })
      toast.info(`Opened print view for ${sermon.language} — use “Save as PDF” in the print dialog`)
      return
    }
    setExportingPDF(true)
    try {
      const { generatePDF } = await import('@/lib/exports/pdf')
      const blob = await generatePDF(sermon, structured, media, { templateId })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${sermon.title}.pdf`; a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded!')
    } catch (err) {
      console.error(err)
      toast.error('PDF export failed — please try again')
    } finally {
      setExportingPDF(false)
    }
  }

  async function handleExportPPT() {
    const structured = resolveStructured()
    if (!structured) { toast.error('Generate your sermon first'); return }
    setExportingPPT(true)
    try {
      // Refresh the plan if the slide count changed since it was built.
      const plan = await ensurePlan(planCount > 0 && Math.abs(planCount - slideCount) > 4)
      const { generatePPT } = await import('@/lib/exports/ppt')
      const blob = await generatePPT(sermon, structured, media, {
        templateId, slideCount, speakerNotes: editableNotes || draft?.speaker_notes, slidePlan: plan,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${sermon.title}.pptx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('PowerPoint downloaded!')
    } catch (err) {
      console.error(err)
      toast.error('PowerPoint export failed — please try again')
    } finally {
      setExportingPPT(false)
    }
  }

  async function handlePrintNotes() {
    const structured = resolveStructured()
    if (!structured) { toast.error('Generate your sermon first'); return }
    const { openPrintView } = await import('@/lib/exports/print')
    openPrintView(sermon, structured, media, { templateId, speakerNotes: editableNotes || draft?.speaker_notes, language: sermon.language })
    toast.success('Print view opened — use Ctrl/Cmd+P to print or save as PDF')
  }

  async function handleGenerateSpeakerNotes() {
    if (!draft) { toast.error('Polish your sermon first in Stage 2'); return }
    setGeneratingNotes(true)
    try {
      const res = await fetch('/api/speaker-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draft.id,
          sermonHtml: draft.polished_html,
          title: sermon.title,
          scriptureRef: sermon.scripture_ref,
          theme: sermon.theme,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to generate speaker notes'); return }
      setEditableNotes(json.notes)
      onDraftChange(json.draft)
      setShowNotes(true)
      toast.success('Speaker notes generated!')
    } catch {
      toast.error('Failed to generate speaker notes — check your connection')
    } finally {
      setGeneratingNotes(false)
    }
  }

  async function saveSpeakerNotes() {
    if (!draft?.id) return
    const { error } = await supabase
      .from('sermon_drafts')
      .update({ speaker_notes: editableNotes })
      .eq('id', draft.id)
    if (error) { toast.error(error.message); return }
    onDraftChange({ ...draft, speaker_notes: editableNotes })
    toast.success('Speaker notes saved')
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setRecordedAudio(blob)
        setAudioDuration((Date.now() - startTimeRef.current) / 1000)
        stream.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current = recorder
      startTimeRef.current = Date.now()
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      const e = err as DOMException
      if (e?.name === 'NotAllowedError') {
        toast.error('Microphone access denied — allow it in your browser settings')
      } else if (e?.name === 'NotFoundError') {
        toast.error('No microphone found on this device')
      } else {
        toast.error(`Could not start recording: ${e?.message ?? 'unknown error'}`)
      }
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  async function handleRenderVideo() {
    if (!recordedAudio) { toast.error('Record your sermon audio first'); return }
    if (media.length === 0) { toast.error('Add images in Stage 3 for the background visuals'); return }
    setRenderingVideo(true)
    setVideoProgress(0)
    try {
      const { renderAudioVideo } = await import('@/lib/exports/video')
      const blob = await renderAudioVideo({
        audioBlob: recordedAudio,
        images: media,
        title: sermon.title,
        onProgress: setVideoProgress,
      })
      const url = URL.createObjectURL(blob)
      setVideoUrl(url)
      toast.success('Video rendered! Click download to save.')
    } catch (err) {
      console.error(err)
      toast.error('Video rendering failed')
    } finally {
      setRenderingVideo(false)
    }
  }

  async function handleGenerateOutreach() {
    setGeneratingOutreach(true)
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sermonId: sermon.id,
          sermonHtml: draft?.polished_html ?? '',
          title: sermon.title,
          scriptureRef: sermon.scripture_ref,
          theme: sermon.theme,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to generate outreach content'); return }
      onOutreachChange(json.outreach)
      setSocialData(json.social)
      toast.success('Outreach content generated!')
    } catch {
      toast.error('Failed to generate outreach content — check your connection')
    } finally {
      setGeneratingOutreach(false)
    }
  }

  async function handlePublish() {
    if (!outreach) return
    setPublishing(true)
    const { data, error } = await supabase
      .from('outreach_posts')
      .update({ is_public: !outreach.is_public })
      .eq('id', outreach.id)
      .select()
      .single()
    setPublishing(false)
    if (error) { toast.error(error.message); return }
    onOutreachChange(data)
    onSermonChange({ ...sermon, status: data.is_public ? 'published' : 'exported' })
    toast.success(data.is_public ? 'Sermon published!' : 'Sermon unpublished')
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
    toast.success('Copied!')
  }

  const shareUrl = outreach?.is_public
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${outreach.share_slug}`
    : null

  return (
    <div className="space-y-6">
      {/* Speaker Notes card */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-amber-400" /> Speaker Notes
            </CardTitle>
            {(editableNotes || draft?.speaker_notes) && (
              <Button
                variant="ghost" size="sm"
                className="h-7 text-white/50 hover:text-white text-xs gap-1"
                onClick={() => setShowNotes(!showNotes)}
              >
                {showNotes ? <><ChevronUp className="h-3.5 w-3.5" />Hide</> : <><ChevronDown className="h-3.5 w-3.5" />View</>}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-white/40 text-sm">
            Generate speaker notes with delivery tips, timing, transitions, and altar call guidance. Notes are embedded into your PPT export.
          </p>
          <Button
            className="w-full bg-amber-700 hover:bg-amber-600 gap-2"
            onClick={handleGenerateSpeakerNotes}
            disabled={generatingNotes || !draft}
          >
            {generatingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generatingNotes ? 'Generating speaker notes…' : 'Generate Speaker Notes'}
          </Button>

          {showNotes && (editableNotes || draft?.speaker_notes) && (
            <div className="space-y-2">
              <Textarea
                value={editableNotes || draft?.speaker_notes || ''}
                onChange={(e) => setEditableNotes(e.target.value)}
                className="min-h-[200px] border-white/20 bg-white/10 text-white/80 text-xs font-mono resize-none"
                placeholder="Speaker notes will appear here…"
              />
              <Button
                size="sm"
                variant="outline"
                className="border-white/20 text-white/60 hover:text-white text-xs"
                onClick={saveSpeakerNotes}
              >
                Save Notes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Design & format controls */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/80 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" /> Design & Format
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-white/40 text-[11px] uppercase tracking-wider">Export theme</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {Object.values(EXPORT_THEMES).map((th) => (
                <button
                  key={th.id}
                  onClick={() => persistTemplate(th.id)}
                  className={cn(
                    'rounded-lg border p-2 text-left transition-all',
                    templateId === th.id ? 'border-amber-400 ring-1 ring-amber-400/40' : 'border-white/10 hover:border-white/30'
                  )}
                >
                  <div className="flex gap-1 mb-1.5">
                    <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: withHash(th.bg) }} />
                    <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: withHash(th.accent) }} />
                    <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: withHash(th.panel) }} />
                  </div>
                  <p className="text-white/70 text-[11px] leading-tight">{th.label}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-white/40 text-[11px] uppercase tracking-wider">Slide count (PowerPoint)</label>
              <span className="text-amber-300 text-sm font-medium">{slideCount} slides</span>
            </div>
            <input
              type="range"
              min={SLIDE_COUNT.min}
              max={SLIDE_COUNT.max}
              value={slideCount}
              onChange={(e) => setSlideCount(Number(e.target.value))}
              className="w-full accent-amber-400"
              aria-label="Slide count"
            />
            <div className="flex justify-between text-white/30 text-[10px]">
              <span>Concise · {SLIDE_COUNT.min}</span>
              <span>Detailed · {SLIDE_COUNT.max}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deck design — content-aware layout + visual planning */}
      <Card className="border-amber-400/25 bg-gradient-to-br from-amber-500/10 to-orange-600/5 text-white">
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 py-4">
          <div className="flex-1 space-y-0.5">
            <p className="text-white font-medium text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-300" /> Designed deck layout
            </p>
            <p className="text-white/50 text-xs leading-relaxed">
              Each slide gets a thoughtful layout and the right visual — a map for places, a route for journeys,
              a timeline for sequences, a diagram for ideas, scripture art for verses, or clean type.
              {planCount > 0 && <span className="text-amber-300"> · {planCount} slides planned</span>}
            </p>
          </div>
          <Button
            variant="outline"
            className="border-amber-400/40 text-amber-200 hover:bg-amber-400/10 gap-2 shrink-0"
            onClick={handleRedesign}
            disabled={planning || !draft}
          >
            {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {planning ? 'Designing…' : planCount > 0 ? 'Redesign Deck' : 'Design Deck'}
          </Button>
        </CardContent>
      </Card>

      {/* Export row */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* PDF */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <FileText className="h-4 w-4 text-red-400" /> PDF Export
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-white/40 text-xs">Beautifully formatted PDF with images and scripture formatting.</p>
            <Button
              className="w-full bg-red-700 hover:bg-red-600 gap-2"
              onClick={handleExportPDF}
              disabled={exportingPDF || !draft}
            >
              {exportingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportingPDF ? 'Generating…' : 'Download PDF'}
            </Button>
          </CardContent>
        </Card>

        {/* PPT with speaker notes */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Presentation className="h-4 w-4 text-orange-400" /> PowerPoint
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-white/40 text-xs">Designed slides with the right visual on each, speaker notes embedded.</p>
            <Button
              className="w-full bg-orange-700 hover:bg-orange-600 gap-2"
              onClick={handleExportPPT}
              disabled={exportingPPT || planning || !draft}
            >
              {exportingPPT || planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {planning ? 'Designing deck…' : exportingPPT ? 'Generating…' : 'Download PPT'}
            </Button>
          </CardContent>
        </Card>

        {/* Printable notes */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Printer className="h-4 w-4 text-green-400" /> Print Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-white/40 text-xs">Printable sermon notes with visuals and speaker notes.</p>
            <Button
              className="w-full bg-green-700 hover:bg-green-600 gap-2"
              onClick={handlePrintNotes}
              disabled={!draft}
            >
              <Printer className="h-4 w-4" />
              Open Print View
            </Button>
          </CardContent>
        </Card>

        {/* Video */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Video className="h-4 w-4 text-blue-400" /> Sermon Video
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-white/40 text-xs">Record your delivery — images play as the visual backdrop.</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={isRecording ? 'destructive' : 'default'}
                className={cn('flex-1', isRecording ? '' : 'bg-blue-700 hover:bg-blue-600')}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? <><MicOff className="h-3.5 w-3.5 mr-1" />Stop</> : <><Mic className="h-3.5 w-3.5 mr-1" />Record</>}
              </Button>
              {recordedAudio && !isRecording && (
                <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
                  {Math.floor(audioDuration)}s
                </Badge>
              )}
            </div>
            {renderingVideo && (
              <div className="space-y-1">
                <Progress value={videoProgress} className="h-1.5" />
                <p className="text-white/40 text-xs text-center">{videoProgress}% rendering…</p>
              </div>
            )}
            <Button
              className="w-full bg-blue-700 hover:bg-blue-600 gap-2"
              onClick={handleRenderVideo}
              disabled={renderingVideo || !recordedAudio}
            >
              {renderingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              {renderingVideo ? `${videoProgress}%…` : 'Render Video'}
            </Button>
            {videoUrl && (
              <a href={videoUrl} download={`${sermon.title}.webm`}>
                <Button variant="outline" size="sm" className="w-full border-blue-500/50 text-blue-400 gap-1">
                  <Download className="h-3.5 w-3.5" /> Download Video
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Outreach section */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/80 flex items-center gap-2">
            <Share2 className="h-4 w-4 text-green-400" /> Outreach & Social Media
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-white/40 text-sm">Generate congregation summaries and social media captions ready to copy and share.</p>
          <Button
            className="w-full bg-green-700 hover:bg-green-600 gap-2"
            onClick={handleGenerateOutreach}
            disabled={generatingOutreach}
          >
            {generatingOutreach ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generatingOutreach ? 'Generating outreach content…' : 'Generate Outreach Content'}
          </Button>

          {(socialData || outreach) && (
            <div className="space-y-4">
              {outreach?.summary && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">Congregation Summary</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => copyText(outreach.summary!, 'summary')}>
                      {copied === 'summary' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-white/70 text-sm bg-white/5 rounded-lg p-3 leading-relaxed">{outreach.summary}</p>
                </div>
              )}

              {outreach?.social_caption && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">Social Caption</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => copyText(outreach.social_caption!, 'caption')}>
                      {copied === 'caption' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-white/70 text-sm bg-white/5 rounded-lg p-3">{outreach.social_caption}</p>
                </div>
              )}

              {outreach?.hashtags?.length && (
                <div className="space-y-1">
                  <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">Hashtags</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {outreach.hashtags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="border-green-500/30 text-green-400 text-xs cursor-pointer hover:border-green-400"
                        onClick={() => copyText(`#${tag}`, tag)}
                      >
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {(socialData?.instagram_caption as string) && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">Instagram</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => copyText(socialData!.instagram_caption as string, 'ig')}>
                      {copied === 'ig' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <Textarea readOnly value={socialData!.instagram_caption as string} className="min-h-[80px] border-white/10 bg-white/5 text-white/70 text-xs resize-none" />
                </div>
              )}

              {(socialData?.facebook_post as string) && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-semibold uppercase tracking-wider">Facebook</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => copyText(socialData!.facebook_post as string, 'fb')}>
                      {copied === 'fb' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <Textarea readOnly value={socialData!.facebook_post as string} className="min-h-[80px] border-white/10 bg-white/5 text-white/70 text-xs resize-none" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publish card */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/80 flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-400" /> Publish & Share
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-white/50 text-sm">
            Create a public shareable link for your congregation and community to access this sermon online.
          </p>
          <Button
            className={cn('gap-2', outreach?.is_public ? 'bg-slate-600 hover:bg-slate-500' : 'bg-amber-500 hover:bg-amber-400 text-slate-950')}
            onClick={handlePublish}
            disabled={publishing || !outreach}
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            {outreach?.is_public ? 'Unpublish' : 'Publish Sermon'}
          </Button>
          {!outreach && (
            <p className="text-white/30 text-xs">Generate outreach content first to enable publishing.</p>
          )}
          {shareUrl && (
            <div className="flex items-center gap-2 bg-white/5 rounded-lg p-3">
              <p className="text-amber-300 text-sm flex-1 truncate">{shareUrl}</p>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white shrink-0" onClick={() => copyText(shareUrl, 'share')}>
                {copied === 'share' ? <CheckCheck className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
              <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Badge className="bg-green-600 text-white px-4 py-1.5 text-sm self-center">
          Sermon Complete
        </Badge>
      </div>
    </div>
  )
}
