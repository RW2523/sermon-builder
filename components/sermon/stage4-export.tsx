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
  Copy, CheckCheck, Globe, Mic, MicOff, Download, Sparkles, ExternalLink
} from 'lucide-react'
import type { Sermon, SermonDraft, SermonMedia, OutreachPost } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  sermon: Sermon
  draft: SermonDraft | null
  media: SermonMedia[]
  outreach: OutreachPost | null
  onOutreachChange: (o: OutreachPost) => void
  onSermonChange: (s: Sermon) => void
  onBack: () => void
}

export default function Stage4Export({ sermon, draft, media, outreach, onOutreachChange, onSermonChange, onBack }: Props) {
  const supabase = createClient()

  // Export states
  const [exportingPDF, setExportingPDF] = useState(false)
  const [exportingPPT, setExportingPPT] = useState(false)
  const [renderingVideo, setRenderingVideo] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Outreach states
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
    if (!draft) { toast.error('No draft available'); return }
    setExportingPDF(true)
    const { generatePDF } = await import('@/lib/exports/pdf')
    const blob = await generatePDF(sermon, draft, media)
    setExportingPDF(false)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${sermon.title}.pdf`; a.click()
    URL.revokeObjectURL(url)
    toast.success('PDF downloaded!')
  }

  async function handleExportPPT() {
    if (!draft) { toast.error('No draft available'); return }
    setExportingPPT(true)
    const { generatePPT } = await import('@/lib/exports/ppt')
    const blob = await generatePPT(sermon, draft, media)
    setExportingPPT(false)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${sermon.title}.pptx`; a.click()
    URL.revokeObjectURL(url)
    toast.success('PowerPoint downloaded!')
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
    } catch {
      toast.error('Microphone access denied')
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
    setGeneratingOutreach(false)
    if (!res.ok) { toast.error(json.error); return }
    onOutreachChange(json.outreach)
    setSocialData(json.social)
    toast.success('Outreach content generated!')
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
      {/* Export row */}
      <div className="grid sm:grid-cols-3 gap-4">
        {/* PDF */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <FileText className="h-4 w-4 text-red-400" /> PDF Export
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-white/40 text-xs">Download a beautifully formatted PDF of your sermon with images.</p>
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

        {/* PPT */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Presentation className="h-4 w-4 text-orange-400" /> PowerPoint
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-white/40 text-xs">Export as a presentation with beautiful slides and your images.</p>
            <Button
              className="w-full bg-orange-700 hover:bg-orange-600 gap-2"
              onClick={handleExportPPT}
              disabled={exportingPPT || !draft}
            >
              {exportingPPT ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exportingPPT ? 'Generating…' : 'Download PPT'}
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
            <p className="text-white/40 text-xs">Record your sermon delivery — images play behind your voice.</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={isRecording ? 'destructive' : 'default'}
                className={isRecording ? '' : 'bg-blue-700 hover:bg-blue-600 flex-1'}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? <><MicOff className="h-3.5 w-3.5 mr-1" />Stop</> : <><Mic className="h-3.5 w-3.5 mr-1" />Record</>}
              </Button>
              {recordedAudio && !isRecording && (
                <Badge variant="outline" className="border-green-500/50 text-green-400 text-xs">
                  {Math.floor(audioDuration)}s recorded
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
              {renderingVideo ? `Rendering… ${videoProgress}%` : 'Render Video'}
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
              {/* Summary */}
              {outreach?.summary && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-medium uppercase tracking-wider">Congregation Summary</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => copyText(outreach.summary!, 'summary')}>
                      {copied === 'summary' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-white/70 text-sm bg-white/5 rounded-lg p-3 leading-relaxed">{outreach.summary}</p>
                </div>
              )}

              {/* Social caption */}
              {outreach?.social_caption && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-medium uppercase tracking-wider">Social Caption</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => copyText(outreach.social_caption!, 'caption')}>
                      {copied === 'caption' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <p className="text-white/70 text-sm bg-white/5 rounded-lg p-3">{outreach.social_caption}</p>
                </div>
              )}

              {/* Hashtags */}
              {outreach?.hashtags?.length && (
                <div className="space-y-1">
                  <span className="text-white/50 text-xs font-medium uppercase tracking-wider">Hashtags</span>
                  <div className="flex flex-wrap gap-1.5">
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

              {/* Instagram */}
              {(socialData?.instagram_caption as string) && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-medium uppercase tracking-wider">Instagram</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => copyText(socialData!.instagram_caption as string, 'ig')}>
                      {copied === 'ig' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={socialData!.instagram_caption as string}
                    className="min-h-[80px] border-white/10 bg-white/5 text-white/70 text-xs resize-none"
                  />
                </div>
              )}

              {/* Facebook */}
              {(socialData?.facebook_post as string) && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-white/50 text-xs font-medium uppercase tracking-wider">Facebook</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white" onClick={() => copyText(socialData!.facebook_post as string, 'fb')}>
                      {copied === 'fb' ? <CheckCheck className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={socialData!.facebook_post as string}
                    className="min-h-[80px] border-white/10 bg-white/5 text-white/70 text-xs resize-none"
                  />
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
            <Globe className="h-4 w-4 text-purple-400" /> Publish & Share
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-white/50 text-sm">
            Publish a public shareable page for this sermon that your congregation and community can access.
          </p>
          <Button
            className={cn('gap-2', outreach?.is_public ? 'bg-slate-600 hover:bg-slate-500' : 'bg-purple-600 hover:bg-purple-500')}
            onClick={handlePublish}
            disabled={publishing || !outreach}
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            {outreach?.is_public ? 'Unpublish' : 'Publish Sermon'}
          </Button>
          {shareUrl && (
            <div className="flex items-center gap-2 bg-white/5 rounded-lg p-3">
              <p className="text-purple-300 text-sm flex-1 truncate">{shareUrl}</p>
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
