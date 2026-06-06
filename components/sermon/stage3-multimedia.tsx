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
  Map, Trash2, RefreshCw, GripVertical, Wand2, Download
} from 'lucide-react'
import type { Sermon, SermonDraft, SermonMedia } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
  const [selectedKind, setSelectedKind] = useState<'image' | 'map'>('image')
  const [highQuality, setHighQuality] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [editingCaption, setEditingCaption] = useState<string | null>(null)
  const [captionText, setCaptionText] = useState('')

  async function generateImage(opts: {
    prompt?: string
    kind: 'image' | 'map'
    autoPrompt?: boolean
    highQuality?: boolean
  }) {
    const isAuto = opts.autoPrompt ?? false
    if (isAuto) setAutoGenerating(true); else setGenerating(true)

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
      }),
    })

    if (isAuto) setAutoGenerating(false); else setGenerating(false)
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'Image generation failed'); return }
    onMediaChange([...media, json.media])
    toast.success('Image generated!')
  }

  async function handleGenerate() {
    await generateImage({ prompt: customPrompt, kind: selectedKind, highQuality })
    setCustomPrompt('')
  }

  async function handleAutoGenerate() {
    if (!draft) { toast.error('Polish your sermon first in Stage 2'); return }
    await generateImage({ kind: selectedKind, autoPrompt: true, highQuality })
  }

  async function handleDelete(id: string, storagePath: string) {
    const { error } = await supabase.from('sermon_media').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    onMediaChange(media.filter((m) => m.id !== id))
    toast.success('Image removed')
  }

  async function saveCaption(id: string) {
    const { data, error } = await supabase
      .from('sermon_media')
      .update({ caption: captionText })
      .eq('id', id)
      .select()
      .single()
    if (error) { toast.error(error.message); return }
    onMediaChange(media.map((m) => (m.id === id ? data : m)))
    setEditingCaption(null)
    toast.success('Caption saved')
  }

  return (
    <div className="space-y-6">
      {/* Generation controls */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white/80 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-blue-400" /> Generate AI Visuals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Kind selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedKind('image')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-all',
                selectedKind === 'image'
                  ? 'border-blue-500 bg-blue-900/40 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/30'
              )}
            >
              <ImageIcon className="h-4 w-4" /> Illustration
            </button>
            <button
              onClick={() => setSelectedKind('map')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-sm font-medium transition-all',
                selectedKind === 'map'
                  ? 'border-blue-500 bg-blue-900/40 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/30'
              )}
            >
              <Map className="h-4 w-4" /> Biblical Map
            </button>
          </div>

          {/* Custom prompt */}
          <div className="space-y-2">
            <Label className="text-white/60 text-xs">Custom Image Prompt (optional)</Label>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={
                selectedKind === 'map'
                  ? 'e.g. Map of ancient Israel showing Jerusalem, Galilee, and major trade routes'
                  : 'e.g. Jesus walking on water, disciples in the boat, stormy sea at night'
              }
              className="min-h-[80px] border-white/20 bg-white/10 text-white placeholder:text-white/30 resize-none text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-white/60 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={highQuality}
                onChange={(e) => setHighQuality(e.target.checked)}
                className="accent-purple-500"
              />
              High quality (Pro model)
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-500 gap-2"
              onClick={handleGenerate}
              disabled={generating || !customPrompt.trim()}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Generating…' : 'Generate'}
            </Button>
            <Button
              className="flex-1 bg-purple-600 hover:bg-purple-500 gap-2"
              onClick={handleAutoGenerate}
              disabled={autoGenerating || !draft}
              title="AI picks the best image prompt from your sermon"
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
          <h3 className="text-white/70 text-sm font-medium">Generated Visuals ({media.length})</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {media.map((item) => (
              <Card key={item.id} className="border-white/10 bg-white/5 text-white overflow-hidden">
                {item.public_url && (
                  <div className="relative w-full aspect-video bg-black/30">
                    <Image
                      src={item.public_url}
                      alt={item.caption ?? item.prompt ?? 'Sermon image'}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                    <Badge
                      className={cn(
                        'absolute top-2 left-2 text-xs',
                        item.kind === 'map' ? 'bg-amber-700' : 'bg-blue-700'
                      )}
                    >
                      {item.kind === 'map' ? <><Map className="h-3 w-3 mr-1" />Map</> : <><ImageIcon className="h-3 w-3 mr-1" />Image</>}
                    </Badge>
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
                      <Button size="sm" className="h-7 px-2 bg-purple-600 hover:bg-purple-500 text-xs" onClick={() => saveCaption(item.id)}>Save</Button>
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
                  <div className="flex gap-2 pt-1">
                    {item.public_url && (
                      <a
                        href={item.public_url}
                        download
                        className="flex-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button variant="ghost" size="sm" className="w-full h-7 text-white/50 hover:text-white hover:bg-white/10 text-xs gap-1">
                          <Download className="h-3 w-3" /> Download
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-7 text-red-400/60 hover:text-red-400 hover:bg-red-950/30 text-xs gap-1"
                      onClick={() => handleDelete(item.id, item.storage_path ?? '')}
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
          <p className="text-sm">No images yet — generate your first visual above</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={onNext}
          className="bg-purple-600 hover:bg-purple-500 gap-2"
        >
          Export & Share <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
