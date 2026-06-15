'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Mic, MicOff, Type, FileAudio, Loader2, ArrowRight,
  X, FileText, BookOpen, FilePlus
} from 'lucide-react'
import type { Sermon, SermonInput } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  sermon: Sermon
  inputs: SermonInput[]
  onInputsChange: (inputs: SermonInput[]) => void
  onNext: () => void
}

const KIND_ICON: Record<string, React.ReactNode> = {
  text: <Type className="h-3.5 w-3.5" />,
  dictation: <Mic className="h-3.5 w-3.5" />,
  audio: <FileAudio className="h-3.5 w-3.5" />,
  document: <FileText className="h-3.5 w-3.5" />,
  bible_ref: <BookOpen className="h-3.5 w-3.5" />,
  file: <FilePlus className="h-3.5 w-3.5" />,
}

function uniqueStorageName(fileName: string) {
  return `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

const KIND_COLOR: Record<string, string> = {
  text: 'border-amber-400/40 text-amber-300',
  dictation: 'border-sky-500/40 text-sky-300',
  audio: 'border-blue-500/40 text-blue-300',
  document: 'border-amber-500/40 text-amber-300',
  bible_ref: 'border-green-500/40 text-green-300',
  file: 'border-cyan-500/40 text-cyan-300',
}

export default function Stage1Ingestion({ sermon, inputs, onInputsChange, onNext }: Props) {
  const supabase = createClient()

  // Text
  const [typedText, setTypedText] = useState('')
  const [savingText, setSavingText] = useState(false)

  // Dictation
  const [dictationText, setDictationText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Uploads
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)

  // Bible ref
  const [bibleVerse, setBibleVerse] = useState('')
  const [bibleNotes, setBibleNotes] = useState('')
  const [savingBible, setSavingBible] = useState(false)

  // Sermon meta
  const [title, setTitle] = useState(sermon.title)
  const [scriptureRef, setScriptureRef] = useState(sermon.scripture_ref ?? '')
  const [theme, setTheme] = useState(sermon.theme ?? '')
  const lastSavedMeta = useRef(
    JSON.stringify({ title: sermon.title, scripture_ref: sermon.scripture_ref ?? '', theme: sermon.theme ?? '' })
  )

  useEffect(() => {
    const SpeechRecognitionCtor =
      (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null
    if (!SpeechRecognitionCtor) return
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setDictationText(transcript)
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    return () => { recognition.stop() }
  }, [])

  async function saveSermonMeta() {
    const payload = JSON.stringify({ title, scripture_ref: scriptureRef, theme })
    if (payload === lastSavedMeta.current) return
    lastSavedMeta.current = payload
    try {
      const res = await fetch(`/api/sermons/${sermon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
      if (!res.ok) {
        lastSavedMeta.current = ''
        const json = await res.json().catch(() => null)
        toast.error(json?.error ?? 'Failed to save sermon details')
      }
    } catch {
      lastSavedMeta.current = ''
      toast.error('Failed to save sermon details — check your connection')
    }
  }

  async function saveTextInput() {
    if (!typedText.trim()) return
    setSavingText(true)
    const { data, error } = await supabase
      .from('sermon_inputs')
      .insert({ sermon_id: sermon.id, kind: 'text', raw_text: typedText.trim() })
      .select().single()
    setSavingText(false)
    if (error) { toast.error(error.message); return }
    onInputsChange([...inputs, data])
    setTypedText('')
    toast.success('Notes saved')
  }

  async function saveDictation() {
    if (!dictationText.trim()) return
    setSavingText(true)
    const { data, error } = await supabase
      .from('sermon_inputs')
      .insert({ sermon_id: sermon.id, kind: 'dictation', raw_text: dictationText.trim() })
      .select().single()
    setSavingText(false)
    if (error) { toast.error(error.message); return }
    onInputsChange([...inputs, data])
    setDictationText('')
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false) }
    toast.success('Dictation saved')
  }

  function toggleDictation() {
    if (!recognitionRef.current) {
      toast.error('Speech recognition is not supported in this browser')
      return
    }
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      setDictationText('')
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/')) { toast.error('Please upload an audio file'); return }
    if (file.size > 20 * 1024 * 1024) { toast.error('Audio file too large (max 20MB)'); return }
    setUploadingAudio(true)
    const { data: { user } } = await supabase.auth.getUser()
    const path = `${user?.id}/${sermon.id}/${uniqueStorageName(file.name)}`
    const { error: uploadError } = await supabase.storage.from('sermon-audio').upload(path, file)
    if (uploadError) { toast.error(uploadError.message); setUploadingAudio(false); return }
    toast.info('Transcribing audio…')
    try {
      // Audio is already in storage — send only the path so the request stays
      // under Vercel's body size limit regardless of recording length
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sermonId: sermon.id, storagePath: path, mimeType: file.type }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Transcription failed'); return }
      onInputsChange([...inputs, json.input])
      toast.success('Audio transcribed and saved')
      e.target.value = ''
    } catch {
      toast.error('Transcription failed — check your connection')
    } finally {
      setUploadingAudio(false)
    }
  }

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
    ]
    if (!allowed.includes(file.type)) {
      toast.error('Supported formats: PDF, Word (.docx), plain text')
      return
    }
    if (file.size > 4 * 1024 * 1024) { toast.error('Document too large (max 4MB)'); return }
    setUploadingDoc(true)
    toast.info('Extracting text from document…')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('sermonId', sermon.id)
    try {
      const res = await fetch('/api/extract-doc', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Extraction failed'); return }
      onInputsChange([...inputs, json.input])
      toast.success('Document text extracted and saved')
      e.target.value = ''
    } catch {
      toast.error('Extraction failed — check your connection')
    } finally {
      setUploadingDoc(false)
    }
  }

  async function saveBibleRef() {
    if (!bibleVerse.trim()) return
    setSavingBible(true)
    const content = bibleNotes.trim()
      ? `Scripture: ${bibleVerse.trim()}\n\nStudy Notes: ${bibleNotes.trim()}`
      : `Scripture: ${bibleVerse.trim()}`
    const { data, error } = await supabase
      .from('sermon_inputs')
      .insert({ sermon_id: sermon.id, kind: 'bible_ref', raw_text: content })
      .select().single()
    setSavingBible(false)
    if (error) { toast.error(error.message); return }
    onInputsChange([...inputs, data])
    setBibleVerse('')
    setBibleNotes('')
    toast.success('Scripture reference saved')
  }

  async function removeInput(id: string) {
    const { error } = await supabase.from('sermon_inputs').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    onInputsChange(inputs.filter((i) => i.id !== id))
  }

  return (
    <div className="space-y-6">
      {/* Sermon metadata */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white/80 flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber-400" />
            Sermon Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 sm:col-span-3">
            <Label className="text-white/60">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveSermonMeta}
              placeholder="Sermon title"
              className="border-white/20 bg-white/10 text-white placeholder:text-white/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60">Scripture Reference</Label>
            <Input
              value={scriptureRef}
              onChange={(e) => setScriptureRef(e.target.value)}
              onBlur={saveSermonMeta}
              placeholder="e.g. John 3:16"
              className="border-white/20 bg-white/10 text-white placeholder:text-white/30"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-white/60">Theme / Key Message</Label>
            <Input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onBlur={saveSermonMeta}
              placeholder="e.g. God's unconditional love and grace"
              className="border-white/20 bg-white/10 text-white placeholder:text-white/30"
            />
          </div>
        </CardContent>
      </Card>

      {/* Input method tabs */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardContent className="p-0">
          <Tabs defaultValue="notes" className="w-full">
            <TabsList className="w-full rounded-none rounded-t-lg border-b border-white/10 bg-transparent h-auto p-0 flex">
              {[
                { value: 'notes', icon: <Type className="h-3.5 w-3.5" />, label: 'Type Notes' },
                { value: 'dictate', icon: <Mic className="h-3.5 w-3.5" />, label: 'Dictate' },
                { value: 'audio', icon: <FileAudio className="h-3.5 w-3.5" />, label: 'Upload Audio' },
                { value: 'document', icon: <FileText className="h-3.5 w-3.5" />, label: 'Documents' },
                { value: 'bible', icon: <BookOpen className="h-3.5 w-3.5" />, label: 'Bible Refs' },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 px-2 text-xs text-white/50 data-[state=active]:text-white data-[state=active]:bg-white/10 rounded-none border-r border-white/10 last:border-r-0 data-[state=active]:shadow-none"
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Type Notes */}
            <TabsContent value="notes" className="p-4 mt-0 space-y-3">
              <p className="text-white/40 text-xs">Type your sermon outline, study notes, thoughts, or any raw content.</p>
              <Textarea
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type your sermon notes, outlines, key points, illustrations, or any raw content here…"
                className="min-h-[180px] border-white/20 bg-white/10 text-white placeholder:text-white/30 resize-none"
              />
              <Button
                size="sm"
                onClick={saveTextInput}
                disabled={!typedText.trim() || savingText}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 w-full"
              >
                {savingText && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                Save Notes
              </Button>
            </TabsContent>

            {/* Dictation */}
            <TabsContent value="dictate" className="p-4 mt-0 space-y-3">
              <p className="text-white/40 text-xs">Speak your sermon ideas aloud — your voice is transcribed in real time.</p>
              <div className="relative">
                <Textarea
                  value={dictationText}
                  onChange={(e) => setDictationText(e.target.value)}
                  placeholder="Click Start and begin speaking…"
                  className="min-h-[180px] border-white/20 bg-white/10 text-white placeholder:text-white/30 resize-none"
                  readOnly={isListening}
                />
                {isListening && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-red-600/80 text-white text-xs px-2 py-1 rounded-full">
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> Listening
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={isListening ? 'destructive' : 'default'}
                  onClick={toggleDictation}
                  className={cn('gap-1.5', isListening ? '' : 'bg-sky-600 hover:bg-sky-500')}
                >
                  {isListening ? <><MicOff className="h-3.5 w-3.5" />Stop</> : <><Mic className="h-3.5 w-3.5" />Start Dictation</>}
                </Button>
                <Button
                  size="sm"
                  onClick={saveDictation}
                  disabled={!dictationText.trim() || savingText}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950"
                >
                  {savingText && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                  Save Dictation
                </Button>
              </div>
            </TabsContent>

            {/* Audio Upload */}
            <TabsContent value="audio" className="p-4 mt-0 space-y-3">
              <p className="text-white/40 text-xs">Upload a sermon recording — it will be transcribed automatically.</p>
              <label className={cn(
                'flex flex-col items-center gap-3 border-2 border-dashed border-white/20 rounded-lg p-8 cursor-pointer transition-all',
                uploadingAudio ? 'border-amber-400/50 bg-amber-900/10' : 'hover:border-amber-400/50 hover:bg-white/5'
              )}>
                {uploadingAudio
                  ? <><Loader2 className="h-10 w-10 text-amber-400 animate-spin" /><span className="text-white/60 text-sm font-medium">Transcribing…</span></>
                  : <><FileAudio className="h-10 w-10 text-white/25" /><span className="text-white/60 text-sm font-medium">Drop or click to upload audio</span><span className="text-white/30 text-xs">MP3, WAV, M4A, OGG, WebM supported</span></>
                }
                <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} disabled={uploadingAudio} />
              </label>
            </TabsContent>

            {/* Document Upload */}
            <TabsContent value="document" className="p-4 mt-0 space-y-3">
              <p className="text-white/40 text-xs">Upload study materials, research documents, or sermon outlines — text is extracted automatically.</p>
              <label className={cn(
                'flex flex-col items-center gap-3 border-2 border-dashed border-white/20 rounded-lg p-8 cursor-pointer transition-all',
                uploadingDoc ? 'border-amber-400/50 bg-amber-900/10' : 'hover:border-amber-400/50 hover:bg-white/5'
              )}>
                {uploadingDoc
                  ? <><Loader2 className="h-10 w-10 text-amber-400 animate-spin" /><span className="text-white/60 text-sm font-medium">Extracting document text…</span></>
                  : <><FileText className="h-10 w-10 text-white/25" /><span className="text-white/60 text-sm font-medium">Drop or click to upload a document</span><span className="text-white/30 text-xs">PDF, Word (.docx), or plain text (.txt) supported</span></>
                }
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  className="hidden"
                  onChange={handleDocumentUpload}
                  disabled={uploadingDoc}
                />
              </label>
            </TabsContent>

            {/* Bible References */}
            <TabsContent value="bible" className="p-4 mt-0 space-y-4">
              <p className="text-white/40 text-xs">Add scripture references and study notes for contextual alignment and sermon enrichment.</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-green-400" /> Scripture Passage
                  </Label>
                  <Input
                    value={bibleVerse}
                    onChange={(e) => setBibleVerse(e.target.value)}
                    placeholder="e.g. John 3:16-17 or Romans 8:28"
                    className="border-white/20 bg-white/10 text-white placeholder:text-white/30"
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && saveBibleRef()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">Study Notes & Context (optional)</Label>
                  <Textarea
                    value={bibleNotes}
                    onChange={(e) => setBibleNotes(e.target.value)}
                    placeholder="Add commentary, cross-references, Greek/Hebrew insights, application notes…"
                    className="min-h-[100px] border-white/20 bg-white/10 text-white placeholder:text-white/30 resize-none text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={saveBibleRef}
                  disabled={!bibleVerse.trim() || savingBible}
                  className="w-full bg-green-700 hover:bg-green-600 gap-1.5"
                >
                  {savingBible ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                  Save Scripture Reference
                </Button>
              </div>

              {/* Quick common references */}
              <div className="space-y-2">
                <p className="text-white/30 text-xs">Quick add common passages:</p>
                <div className="flex flex-wrap gap-1.5">
                  {['John 3:16', 'Psalm 23', 'Romans 8:28', 'Phil 4:13', 'Isaiah 40:31', 'Jeremiah 29:11', 'Matthew 28:19-20', 'Proverbs 3:5-6'].map((ref) => (
                    <button
                      key={ref}
                      onClick={() => setBibleVerse(ref)}
                      className="text-xs px-2 py-1 rounded border border-white/10 text-white/40 hover:border-green-500/50 hover:text-green-300 transition-all"
                    >
                      {ref}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Saved inputs list */}
      {inputs.length > 0 && (
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <FilePlus className="h-4 w-4 text-white/50" />
              Collected Content ({inputs.length} {inputs.length === 1 ? 'item' : 'items'})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inputs.map((input) => (
              <div key={input.id} className="flex items-start gap-2 bg-white/5 rounded-lg p-3 group">
                <Badge
                  variant="outline"
                  className={cn('text-xs gap-1 mt-0.5 shrink-0', KIND_COLOR[input.kind] ?? 'border-white/20 text-white/60')}
                >
                  {KIND_ICON[input.kind]} {input.kind === 'bible_ref' ? 'scripture' : input.kind}
                </Badge>
                <p className="text-white/70 text-sm flex-1 line-clamp-3 leading-relaxed">
                  {input.transcription ?? input.raw_text ?? '(audio file)'}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove content source"
                  className="h-6 w-6 text-white/20 hover:text-red-400 hover:bg-red-950/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeInput(input.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Next step */}
      <div className="flex items-center justify-between">
        <p className="text-white/30 text-xs">
          {inputs.length === 0 ? 'Add at least one content source to continue' : `${inputs.length} source${inputs.length > 1 ? 's' : ''} ready for polishing`}
        </p>
        <Button
          onClick={onNext}
          disabled={inputs.length === 0}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 gap-2"
        >
          Polish & Edit <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
