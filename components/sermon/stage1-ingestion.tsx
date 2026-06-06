'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mic, MicOff, Upload, Type, FileAudio, Trash2, Loader2, ArrowRight, X } from 'lucide-react'
import type { Sermon, SermonInput } from '@/types'
import { toast } from 'sonner'

interface Props {
  sermon: Sermon
  inputs: SermonInput[]
  onInputsChange: (inputs: SermonInput[]) => void
  onNext: () => void
}

export default function Stage1Ingestion({ sermon, inputs, onInputsChange, onNext }: Props) {
  const supabase = createClient()
  const [typedText, setTypedText] = useState('')
  const [dictationText, setDictationText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [savingText, setSavingText] = useState(false)
  const [title, setTitle] = useState(sermon.title)
  const [scriptureRef, setScriptureRef] = useState(sermon.scripture_ref ?? '')
  const [theme, setTheme] = useState(sermon.theme ?? '')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
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
    await fetch(`/api/sermons/${sermon.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, scripture_ref: scriptureRef, theme }),
    })
  }

  async function saveTextInput() {
    if (!typedText.trim()) return
    setSavingText(true)
    const { data, error } = await supabase
      .from('sermon_inputs')
      .insert({ sermon_id: sermon.id, kind: 'text', raw_text: typedText.trim() })
      .select()
      .single()
    setSavingText(false)
    if (error) { toast.error(error.message); return }
    onInputsChange([...inputs, data])
    setTypedText('')
    toast.success('Text input saved')
  }

  async function saveDictation() {
    if (!dictationText.trim()) return
    setSavingText(true)
    const { data, error } = await supabase
      .from('sermon_inputs')
      .insert({ sermon_id: sermon.id, kind: 'dictation', raw_text: dictationText.trim() })
      .select()
      .single()
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
    setUploading(true)
    const path = `${(await supabase.auth.getUser()).data.user?.id}/${sermon.id}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('sermon-audio').upload(path, file)
    if (uploadError) { toast.error(uploadError.message); setUploading(false); return }

    // Transcribe via API
    toast.info('Transcribing audio with Gemini…')
    const formData = new FormData()
    formData.append('audio', file)
    formData.append('sermonId', sermon.id)
    formData.append('storagePath', path)
    const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { toast.error(json.error ?? 'Transcription failed'); return }

    onInputsChange([...inputs, json.input])
    toast.success('Audio transcribed and saved')
    e.target.value = ''
  }

  async function removeInput(id: string) {
    const { error } = await supabase.from('sermon_inputs').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    onInputsChange(inputs.filter((i) => i.id !== id))
  }

  const kindIcon: Record<string, React.ReactNode> = {
    text: <Type className="h-3.5 w-3.5" />,
    dictation: <Mic className="h-3.5 w-3.5" />,
    audio: <FileAudio className="h-3.5 w-3.5" />,
    file: <Upload className="h-3.5 w-3.5" />,
  }

  return (
    <div className="space-y-6">
      {/* Sermon metadata */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white/80">Sermon Details</CardTitle>
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
              placeholder="e.g. God's unconditional love"
              className="border-white/20 bg-white/10 text-white placeholder:text-white/30"
            />
          </div>
        </CardContent>
      </Card>

      {/* Input methods */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Type */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-white/80">
              <Type className="h-4 w-4 text-purple-400" /> Type Content
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder="Type your sermon notes, thoughts, scriptures, or any raw content here…"
              className="min-h-[140px] border-white/20 bg-white/10 text-white placeholder:text-white/30 resize-none"
            />
            <Button
              size="sm"
              onClick={saveTextInput}
              disabled={!typedText.trim() || savingText}
              className="bg-purple-600 hover:bg-purple-500 w-full"
            >
              {savingText && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              Save Text
            </Button>
          </CardContent>
        </Card>

        {/* Dictation */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-white/80">
              <Mic className="h-4 w-4 text-pink-400" /> Live Dictation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Textarea
                value={dictationText}
                onChange={(e) => setDictationText(e.target.value)}
                placeholder="Click the microphone and start speaking…"
                className="min-h-[140px] border-white/20 bg-white/10 text-white placeholder:text-white/30 resize-none"
                readOnly={isListening}
              />
              {isListening && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-red-600/80 text-white text-xs px-2 py-1 rounded-full">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  Listening
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={isListening ? 'destructive' : 'default'}
                onClick={toggleDictation}
                className={isListening ? '' : 'bg-pink-600 hover:bg-pink-500'}
              >
                {isListening ? <><MicOff className="h-3.5 w-3.5 mr-1.5" />Stop</> : <><Mic className="h-3.5 w-3.5 mr-1.5" />Start</>}
              </Button>
              <Button
                size="sm"
                onClick={saveDictation}
                disabled={!dictationText.trim() || savingText}
                className="flex-1 bg-purple-600 hover:bg-purple-500"
              >
                Save Dictation
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audio upload */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-white/80">
            <FileAudio className="h-4 w-4 text-blue-400" /> Upload Audio (Gemini Transcription)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex flex-col items-center gap-3 border-2 border-dashed border-white/20 rounded-lg p-6 cursor-pointer hover:border-purple-400/50 hover:bg-white/5 transition-all">
            {uploading ? (
              <><Loader2 className="h-8 w-8 text-purple-400 animate-spin" /><span className="text-white/60 text-sm">Uploading & transcribing…</span></>
            ) : (
              <><Upload className="h-8 w-8 text-white/30" /><span className="text-white/60 text-sm">Drop or click to upload an audio file</span><span className="text-white/30 text-xs">MP3, WAV, M4A, OGG supported</span></>
            )}
            <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} disabled={uploading} />
          </label>
        </CardContent>
      </Card>

      {/* Saved inputs list */}
      {inputs.length > 0 && (
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80">Saved Inputs ({inputs.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inputs.map((input) => (
              <div key={input.id} className="flex items-start gap-2 bg-white/5 rounded-lg p-3">
                <Badge variant="outline" className="border-white/20 text-white/60 text-xs gap-1 mt-0.5 shrink-0">
                  {kindIcon[input.kind]} {input.kind}
                </Badge>
                <p className="text-white/70 text-sm flex-1 line-clamp-3 leading-relaxed">
                  {input.transcription ?? input.raw_text ?? '(audio file)'}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-white/30 hover:text-red-400 hover:bg-red-950/30 shrink-0"
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
      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={inputs.length === 0}
          className="bg-purple-600 hover:bg-purple-500 gap-2"
        >
          Polish & Edit <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
