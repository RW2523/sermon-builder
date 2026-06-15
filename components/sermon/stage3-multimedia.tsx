'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles, Loader2, ArrowLeft, ArrowRight, Image as ImageIcon,
  Map, Trash2, Wand2, Download, RefreshCw, Clock, BookMarked, Palette
} from 'lucide-react'
import type { Sermon, SermonDraft, SermonMedia, MediaKind } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const VISUAL_TYPES: { kind: MediaKind; label: string; desc: string; icon: React.ReactNode; color: string; placeholder: string }[] = [
  {
    kind: 'image',
    label: 'Illustration',
    desc: 'Action-based biblical scene',
    icon: <ImageIcon className="h-4 w-4" />,
    color: 'border-blue-500 bg-blue-900/30',
    placeholder: 'e.g. Jesus calming the storm, disciples in fear, waves crashing the boat at night',
  },
  {
    kind: 'map',
    label: 'Biblical Map',
    desc: 'Geographic / historical map',
    icon: <Map className="h-4 w-4" />,
    color: 'border-amber-500 bg-amber-900/30',
    placeholder: 'e.g. Map of ancient Israel showing the route from Egypt to Canaan',
  },
  {
    kind: 'timeline',
    label: 'Timeline',
    desc: 'Historical / biblical timeline',
    icon: <Clock className="h-4 w-4" />,
    color: 'border-teal-500 bg-teal-900/30',
    placeholder: 'e.g. Timeline of major events in the life of the Apostle Paul',
  },
  {
    kind: 'scripture_slide',
    label: 'Scripture Slide',
    desc: 'Highlighted verse presentation',
    icon: <BookMarked className="h-4 w-4" />,
    color: 'border-amber-400 bg-blue-950/40',
    placeholder: 'e.g. John 3:16 — For God so loved the world presentation slide',
  },
  {
    kind: 'graphic',
    label: 'Sermon Graphic',
    desc: 'Custom title / theme graphic',
    icon: <Palette className="h-4 w-4" />,
    color: 'border-rose-500 bg-rose-900/30',
    placeholder: 'e.g. Sermon title banner for "Walking in Faith" with cross and sunrise imagery',
  },
]

const KIND_BADGE_COLOR: Record<MediaKind, string> = {
  image: 'bg-blue-700',
  map: 'bg-amber-700',
  timeline: 'bg-teal-700',
  scripture_slide: 'bg-blue-800',
  graphic: 'bg-rose-700',
}

interface GeneratingState { [id: string]: boolean }

interface Props {
  sermon: Sermon
  draft: SermonDraft | null
  media: SermonMedia[]
  onMediaChange: (media: SermonMedia[]) => void
  onNext: () => void
  onBack: () => void
}

export default function Stage3Multimedia({ sermon, draft, media, onMediaChange, onNext, onBack }: Props) {
  const supabase = createClient()
  const [customPrompt, setCustomPrompt] = useState('')
  const [selectedKind, setSelectedKind] = useState<MediaKind>('image')
  const [highQuality, setHighQuality] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [regenerating, setRegenerating] = useState<GeneratingState>({})
  const [editingCaption, setEditingCaption] = useState<string | null>(null)
  const [captionText, setCaptionText] = useState('')
  const [savingCaption, setSavingCaption] = useState(false)

  const selectedType = VISUAL_TYPES.find(t => t.kind === selectedKind)!

  async function generateImage(opts: {
    prompt?: string
    kind: MediaKind
    autoPrompt?: boolean
    highQuality?: boolean
    regenerateId?: string
  }) {
    const isAuto = opts.autoPrompt ?? false
    const isRegen = !!opts.regenerateId

    if (isRegen) setRegenerating(r => ({ ...r, [opts.regenerateId!]: true }))
    else if (isAuto) setAutoGenerating(true)
    else setGenerating(true)

    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sermonId: sermon.id,
          prompt: opts.prompt ?? '',
          kind: opts.kind,
          highQuality: opts.highQuality ?? false,
          autoPrompt: isAuto,
          sermonText: draft?.polished_html ?? '',
          regenerateId: opts.regenerateId,
        }),
      })

      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Image generation failed'); return }

      if (isRegen) {
        onMediaChange(media.map(m => m.id === opts.regenerateId ? json.media : m))
        toast.success('Image regenerated!')
      } else {
        onMediaChange([...media, json.media])
        setCustomPrompt('')
        toast.success('Visual generated!')
      }
    } catch {
      toast.error('Image generation failed — check your connection')
    } finally {
      if (isRegen) setRegenerating(r => { const n = { ...r }; delete n[opts.regenerateId!]; return n })
      else if (isAuto) setAutoGenerating(false)
      else setGenerating(false)
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('sermon_media').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    onMediaChange(media.filter((m) => m.id !== id))
    toast.success('Removed')
  }

  async function saveCaption(id: string) {
    if (savingCaption) return
    setSavingCaption(true)
    const { data, error } = await supabase
      .from('sermon_media')
      .update({ caption: captionText })
      .eq('id', id)
      .select()
      .single()
    setSavingCaption(false)
    if (error) { toast.error(error.message); return }
    onMediaChange(media.map((m) => (m.id === id ? data : m)))
    setEditingCaption(null)
    toast.success('Caption saved')
  }

  const kindLabel: Record<MediaKind, string> = {
    image: 'Illustration',
    map: 'Map',
    timeline: 'Timeline',
    scripture_slide: 'Scripture',
    graphic: 'Graphic',
  }

  return (
    <div className="space-y-6">
      {/* Visual type selector */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white/80 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-400" /> Generate Visuals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Kind pills */}
          <div className="flex flex-wrap gap-2">
            {VISUAL_TYPES.map((t) => (
              <button
                key={t.kind}
                onClick={() => setSelectedKind(t.kind)}
                className={cn(
                  'flex items-center gap-1.5 py-1.5 px-3 rounded-full border text-xs font-medium transition-all',
                  selectedKind === t.kind
                    ? `${t.color} text-white border-opacity-100`
                    : 'border-white/10 text-white/50 hover:border-white/30 hover:text-white/70'
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="bg-white/5 rounded-lg px-3 py-2 text-white/40 text-xs border border-white/10">
            {selectedType.desc}
          </div>

          {/* Prompt input */}
          <div className="space-y-2">
            <Label className="text-white/60 text-xs">Custom Prompt (optional — or use Auto)</Label>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={selectedType.placeholder}
              className="min-h-[80px] border-white/20 bg-white/10 text-white placeholder:text-white/30 resize-none text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-white/60 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={highQuality}
                onChange={(e) => setHighQuality(e.target.checked)}
                className="accent-amber-400"
              />
              High quality (Pro model — slower)
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-500 gap-2"
              onClick={() => generateImage({ prompt: customPrompt, kind: selectedKind, highQuality })}
              disabled={generating || !customPrompt.trim()}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Generating…' : 'Generate'}
            </Button>
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 gap-2"
              onClick={() => generateImage({ kind: selectedKind, autoPrompt: true, highQuality })}
              disabled={autoGenerating || !draft}
              title="AI picks the best prompt from your sermon"
            >
              {autoGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {autoGenerating ? 'Thinking…' : 'Auto from Sermon'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Media gallery */}
      {media.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white/70 text-sm font-medium">Generated Visuals</h3>
            <div className="flex gap-1.5 flex-wrap">
              {(['image', 'map', 'timeline', 'scripture_slide', 'graphic'] as MediaKind[]).map(k => {
                const count = media.filter(m => m.kind === k).length
                if (!count) return null
                return (
                  <Badge key={k} className={cn('text-xs', KIND_BADGE_COLOR[k])}>
                    {kindLabel[k]} ×{count}
                  </Badge>
                )
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {media.map((item) => (
              <Card key={item.id} className="border-white/10 bg-white/5 text-white overflow-hidden">
                {item.public_url && (
                  <div className="relative w-full aspect-video bg-black/30">
                    <Image
                      src={item.public_url}
                      alt={item.caption ?? item.prompt ?? 'Sermon visual'}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                    <Badge className={cn('absolute top-2 left-2 text-xs gap-1', KIND_BADGE_COLOR[item.kind as MediaKind])}>
                      {VISUAL_TYPES.find(t => t.kind === item.kind)?.icon}
                      {kindLabel[item.kind as MediaKind]}
                    </Badge>
                    {/* Regenerate overlay button */}
                    <button
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg transition-all opacity-0 hover:opacity-100 group-hover:opacity-100"
                      onClick={() => item.prompt && generateImage({ prompt: item.prompt, kind: item.kind as MediaKind, regenerateId: item.id })}
                      title="Regenerate this image"
                      disabled={!!regenerating[item.id]}
                    >
                      {regenerating[item.id]
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
                <CardContent className="p-3 space-y-2">
                  {item.prompt && (
                    <p className="text-white/40 text-xs italic line-clamp-2">{item.prompt}</p>
                  )}
                  {editingCaption === item.id ? (
                    <div className="flex gap-2">
                      <Input
                        value={captionText}
                        onChange={(e) => setCaptionText(e.target.value)}
                        placeholder="Add caption…"
                        className="h-7 text-xs border-white/20 bg-white/10 text-white"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveCaption(item.id)}
                      />
                      <Button size="sm" disabled={savingCaption} className="h-7 px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs" onClick={() => saveCaption(item.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-white/50" onClick={() => setEditingCaption(null)}>✕</Button>
                    </div>
                  ) : (
                    <button
                      className="text-white/50 text-xs hover:text-white/80 transition-colors w-full text-left"
                      onClick={() => { setEditingCaption(item.id); setCaptionText(item.caption ?? '') }}
                    >
                      {item.caption ? `"${item.caption}"` : '+ Add caption'}
                    </button>
                  )}
                  <div className="flex gap-1.5 pt-1">
                    <Button
                      variant="ghost" size="sm"
                      className="flex-1 h-7 text-white/40 hover:text-white hover:bg-white/10 text-xs gap-1"
                      onClick={() => item.prompt && generateImage({ prompt: item.prompt, kind: item.kind as MediaKind, regenerateId: item.id })}
                      disabled={!!regenerating[item.id]}
                    >
                      {regenerating[item.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Regenerate
                    </Button>
                    {item.public_url && (
                      <a href={item.public_url} download className="flex-1">
                        <Button variant="ghost" size="sm" className="w-full h-7 text-white/40 hover:text-white hover:bg-white/10 text-xs gap-1">
                          <Download className="h-3 w-3" /> Download
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      className="flex-1 h-7 text-red-400/50 hover:text-red-400 hover:bg-red-950/30 text-xs gap-1"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-white/30 space-y-2">
          <ImageIcon className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">No visuals yet — generate your first one above</p>
          <p className="text-xs text-white/20">Try &ldquo;Auto from Sermon&rdquo; for a quick AI-suggested visual</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} className="bg-amber-500 hover:bg-amber-400 text-slate-950 gap-2">
          Export & Share <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
