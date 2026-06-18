'use client'

import { useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles, Loader2, ArrowLeft, ArrowRight, Bold, Italic,
  Heading2, Heading3, List, Quote, Undo, Redo, Save,
  Lightbulb, ChevronDown, ChevronUp, Copy, CheckCheck
} from 'lucide-react'
import type { Sermon, SermonInput, SermonDraft, TemplateType } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { TONES, LANGUAGES } from '@/lib/sermon/templates'
import { TEMPLATE_STRUCTURES } from '@/lib/sermon/templateStructures'
import { htmlToStructured } from '@/lib/sermon/legacy'

const TEMPLATES: { value: TemplateType; label: string; desc: string; icon: string; color: string }[] = [
  { value: 'message',     label: 'Sunday Message',   desc: 'Classic 3-point sermon',       icon: '📖', color: 'border-amber-400 bg-blue-950/40' },
  { value: 'prayer',      label: 'Prayer Focus',     desc: 'Intercession & praise',         icon: '🙏', color: 'border-blue-500 bg-blue-900/40' },
  { value: 'story',       label: 'Story-Driven',     desc: 'Narrative sermon style',        icon: '📜', color: 'border-amber-500 bg-amber-900/40' },
  { value: 'devotional',  label: 'Devotional',       desc: 'Short daily reflection',        icon: '✨', color: 'border-sky-500 bg-sky-950/40' },
  { value: 'teaching',    label: 'Bible Teaching',   desc: 'Deep expository study',         icon: '🎓', color: 'border-teal-500 bg-teal-900/40' },
  { value: 'testimony',   label: 'Testimony',        desc: 'Personal witness format',       icon: '🙌', color: 'border-orange-500 bg-orange-900/40' },
  { value: 'youth',       label: 'Youth Message',    desc: 'High-energy, relevant style',   icon: '⚡', color: 'border-yellow-500 bg-yellow-900/40' },
  { value: 'small_group', label: 'Small Group',      desc: 'Discussion guide format',       icon: '👥', color: 'border-cyan-500 bg-cyan-900/40' },
  { value: 'storytelling',label: 'Storytelling',     desc: 'Cinematic narrative format',    icon: '🎬', color: 'border-rose-500 bg-rose-900/40' },
  { value: 'custom',      label: 'Custom Polish',    desc: 'Enhance without restructuring', icon: '✏️', color: 'border-slate-500 bg-slate-800/40' },
]

interface Suggestions {
  illustrations?: { title: string; description: string }[]
  applications?: { point: string; suggestion: string }[]
  scripture_connections?: { reference: string; connection: string }[]
  opening_hooks?: string[]
  closing_calls?: string[]
  strengthening_tips?: string[]
}

interface Props {
  sermon: Sermon
  inputs: SermonInput[]
  draft: SermonDraft | null
  onDraftChange: (draft: SermonDraft) => void
  onSermonChange: (sermon: Sermon) => void
  onNext: () => void
  onBack: () => void
}

export default function Stage2Polish({ sermon, inputs, draft, onDraftChange, onSermonChange, onNext, onBack }: Props) {
  const supabase = createClient()
  const [polishing, setPolishing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(draft?.template_type ?? 'message')
  const [tone, setTone] = useState(sermon.tone ?? 'Inspirational')
  const [language, setLanguage] = useState(sermon.language ?? 'English')
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [copiedSuggestion, setCopiedSuggestion] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Your polished sermon will appear here. Click "Polish" to generate it from your Stage 1 content.' }),
      Link.configure({ openOnClick: false }),
    ],
    content: draft?.polished_html ?? '',
    editorProps: {
      attributes: { class: 'prose prose-invert max-w-none focus:outline-none min-h-[420px] text-white/90' },
    },
  })

  async function handlePolish() {
    if (!inputs.length) { toast.error('Add content in Stage 1 first'); return }
    setPolishing(true)
    try {
      const res = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sermonId: sermon.id,
          inputs,
          title: sermon.title,
          scriptureRef: sermon.scripture_ref,
          theme: sermon.theme,
          tone,
          language,
          style: selectedTemplate,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Generation failed'); return }
      editor?.commands.setContent(json.draft.polished_html)
      onDraftChange(json.draft)
      onSermonChange({ ...sermon, status: 'polished', tone, language, title: json.draft.structured?.title ?? sermon.title })
      toast.success('Sermon ready!')
    } catch {
      toast.error('Polish failed — check your connection')
    } finally {
      setPolishing(false)
    }
  }

  async function handleApplyTemplate() {
    if (!draft?.id) { toast.error('Generate your sermon first'); return }
    const html = editor?.getHTML() ?? ''
    const structured = draft.structured ?? htmlToStructured(html, sermon.title)
    setApplying(true)
    try {
      const res = await fetch('/api/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sermonId: sermon.id,
          draftId: draft.id,
          structured,
          templateType: selectedTemplate,
          tone,
          language,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Reformat failed'); return }
      editor?.commands.setContent(json.draft.polished_html)
      onDraftChange(json.draft)
      const tpl = TEMPLATES.find(t => t.value === selectedTemplate)
      toast.success(`Reformatted to ${tpl?.label ?? selectedTemplate}!`)
    } catch {
      toast.error('Reformat failed — check your connection')
    } finally {
      setApplying(false)
    }
  }

  async function handleGetSuggestions() {
    const html = editor?.getHTML() ?? ''
    if (!html || html === '<p></p>') { toast.error('Polish your sermon first to get suggestions'); return }
    setLoadingSuggestions(true)
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sermonHtml: html,
          title: sermon.title,
          scriptureRef: sermon.scripture_ref,
          theme: sermon.theme,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to get suggestions'); return }
      setSuggestions(json.suggestions)
      setShowSuggestions(true)
      toast.success('Suggestions generated!')
    } catch {
      toast.error('Failed to get suggestions — check your connection')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  function copySuggestion(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopiedSuggestion(key)
    setTimeout(() => setCopiedSuggestion(null), 2000)
    toast.success('Copied to clipboard')
  }

  const saveManualEdits = useCallback(async () => {
    const html = editor?.getHTML() ?? ''
    if (!draft?.id) return
    setSaving(true)
    // Keep the structured source of truth in sync with manual HTML edits so exports stay accurate
    const structured = htmlToStructured(html, sermon.title)
    const { data, error } = await supabase
      .from('sermon_drafts')
      .update({ polished_html: html, structured })
      .eq('id', draft.id)
      .select()
      .single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    onDraftChange(data)
    toast.success('Draft saved')
  }, [editor, draft, supabase, onDraftChange, sermon.title])

  if (!editor) return null

  return (
    <div className="space-y-6">
      {/* Top controls */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Polish */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-400" /> Step 1 — Polish
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-white/50 text-sm leading-relaxed">
              All your Stage 1 content is shaped into one structured sermon draft — in your chosen voice and language.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-white/40 text-[11px] uppercase tracking-wider">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-white/10 text-white text-sm px-2 py-1.5 focus:outline-none focus:border-amber-400/60"
                >
                  {TONES.map((t) => <option key={t.id} value={t.id} className="bg-slate-900">{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-white/40 text-[11px] uppercase tracking-wider">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-white/10 text-white text-sm px-2 py-1.5 focus:outline-none focus:border-amber-400/60"
                >
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code} className="bg-slate-900">{l.label}</option>)}
                </select>
              </div>
            </div>
            <p className="text-white/30 text-[11px] leading-snug">{TONES.find((t) => t.id === tone)?.hint}</p>
            <Button
              className="w-full bg-yellow-600 hover:bg-yellow-500 gap-2"
              onClick={handlePolish}
              disabled={polishing || !inputs.length}
            >
              {polishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {polishing ? 'Generating…' : `Generate from ${inputs.length} Source${inputs.length !== 1 ? 's' : ''}`}
            </Button>
            {!inputs.length && (
              <p className="text-white/30 text-xs text-center">← Go to Stage 1 to add content first</p>
            )}
          </CardContent>
        </Card>

        {/* Template chooser */}
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80">Step 2 — Choose Template Format</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSelectedTemplate(t.value)}
                  className={cn(
                    'text-left p-2 rounded-lg border text-xs transition-all',
                    selectedTemplate === t.value
                      ? `${t.color} text-white`
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:text-white/80'
                  )}
                >
                  <span className="text-base leading-none">{t.icon}</span>
                  <p className="font-medium mt-1 leading-tight">{t.label}</p>
                  <p className="text-white/40 text-[10px] mt-0.5 leading-tight">{t.desc}</p>
                </button>
              ))}
            </div>

            {/* Selected format's outline — the sections the content is mapped into */}
            {TEMPLATE_STRUCTURES[selectedTemplate] && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                <p className="text-white/70 text-xs">{TEMPLATE_STRUCTURES[selectedTemplate].summary}</p>
                <div className="space-y-1.5">
                  {TEMPLATE_STRUCTURES[selectedTemplate].sections.map((sec, i) => (
                    <div key={sec.name} className="flex gap-2 text-[11px] leading-tight">
                      <span className="text-amber-400 font-semibold shrink-0">{i + 1}.</span>
                      <div>
                        <span className="text-white/80 font-medium">{sec.name}</span>
                        <span className="text-white/35"> — {sec.subtopics.join(' · ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-white/40 text-[10px] pt-1 border-t border-white/5">
                  All of your raw content is re-mapped into these sections — nothing is dropped.
                </p>
              </div>
            )}

            <Button
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 gap-2"
              onClick={handleApplyTemplate}
              disabled={applying}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {applying ? 'Reorganizing your content…' : `Apply ${TEMPLATES.find(t => t.value === selectedTemplate)?.label ?? ''} Format`}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Editor */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-0 border-b border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              Edit Draft
              {draft && <Badge variant="outline" className="border-white/20 text-white/40 text-xs">v{draft.version}</Badge>}
            </CardTitle>
            <div className="flex items-center gap-1 flex-wrap">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3"><Heading3 className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleBulletList().run()} title="List"><List className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote className="h-3.5 w-3.5" /></Button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo className="h-3.5 w-3.5" /></Button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <Button variant="ghost" size="sm" className="h-7 text-white/60 hover:text-white hover:bg-white/10 gap-1 text-xs" onClick={saveManualEdits} disabled={saving || !draft}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <EditorContent editor={editor} className="text-white/90" />
        </CardContent>
      </Card>

      {/* Suggestions panel */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-400" /> Suggestions & Improvements
            </CardTitle>
            {suggestions && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-white/50 hover:text-white text-xs gap-1"
                onClick={() => setShowSuggestions(!showSuggestions)}
              >
                {showSuggestions ? <><ChevronUp className="h-3.5 w-3.5" />Hide</> : <><ChevronDown className="h-3.5 w-3.5" />Show</>}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-white/40 text-sm">
            Get suggestions for stronger illustrations, better applications, scripture connections, and more.
          </p>
          <Button
            className="w-full bg-amber-700 hover:bg-amber-600 gap-2"
            onClick={handleGetSuggestions}
            disabled={loadingSuggestions || !draft}
          >
            {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            {loadingSuggestions ? 'Analyzing sermon…' : 'Get Suggestions'}
          </Button>

          {suggestions && showSuggestions && (
            <div className="space-y-5 pt-2">
              {/* Strengthening tips */}
              {suggestions.strengthening_tips?.length && (
                <div className="space-y-2">
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Strengthening Tips</p>
                  <ul className="space-y-1.5">
                    {suggestions.strengthening_tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                        <span className="text-amber-400 shrink-0 mt-0.5">•</span> {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Illustrations */}
              {suggestions.illustrations?.length && (
                <div className="space-y-2">
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Illustration Ideas</p>
                  <div className="space-y-2">
                    {suggestions.illustrations.map((ill, i) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3 space-y-1 group relative">
                        <p className="text-white/80 text-sm font-medium">{ill.title}</p>
                        <p className="text-white/50 text-xs leading-relaxed">{ill.description}</p>
                        <Button variant="ghost" size="icon" className="h-5 w-5 absolute top-2 right-2 text-white/20 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copySuggestion(`${ill.title}: ${ill.description}`, `ill-${i}`)}>
                          {copiedSuggestion === `ill-${i}` ? <CheckCheck className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Applications */}
              {suggestions.applications?.length && (
                <div className="space-y-2">
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Application Points</p>
                  <div className="space-y-2">
                    {suggestions.applications.map((app, i) => (
                      <div key={i} className="bg-white/5 rounded-lg p-3 space-y-1 group relative">
                        <p className="text-white/60 text-xs text-amber-300">{app.point}</p>
                        <p className="text-white/70 text-sm leading-relaxed">{app.suggestion}</p>
                        <Button variant="ghost" size="icon" className="h-5 w-5 absolute top-2 right-2 text-white/20 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copySuggestion(app.suggestion, `app-${i}`)}>
                          {copiedSuggestion === `app-${i}` ? <CheckCheck className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scripture connections */}
              {suggestions.scripture_connections?.length && (
                <div className="space-y-2">
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Scripture Cross-References</p>
                  <div className="space-y-1.5">
                    {suggestions.scripture_connections.map((sc, i) => (
                      <div key={i} className="flex items-start gap-2 bg-white/5 rounded-lg p-2.5 group relative">
                        <Badge variant="outline" className="border-green-500/40 text-green-300 text-xs shrink-0">{sc.reference}</Badge>
                        <p className="text-white/60 text-xs leading-relaxed">{sc.connection}</p>
                        <Button variant="ghost" size="icon" className="h-5 w-5 absolute top-2 right-2 text-white/20 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copySuggestion(sc.reference, `sc-${i}`)}>
                          {copiedSuggestion === `sc-${i}` ? <CheckCheck className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Opening hooks */}
              {suggestions.opening_hooks?.length && (
                <div className="space-y-2">
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Opening Hook Ideas</p>
                  {suggestions.opening_hooks.map((hook, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-2.5 group relative">
                      <p className="text-white/70 text-sm leading-relaxed pr-8">&ldquo;{hook}&rdquo;</p>
                      <Button variant="ghost" size="icon" className="h-5 w-5 absolute top-2 right-2 text-white/20 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copySuggestion(hook, `hook-${i}`)}>
                        {copiedSuggestion === `hook-${i}` ? <CheckCheck className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Closing calls */}
              {suggestions.closing_calls?.length && (
                <div className="space-y-2">
                  <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Closing Call to Action Ideas</p>
                  {suggestions.closing_calls.map((cta, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-2.5 group relative">
                      <p className="text-white/70 text-sm leading-relaxed pr-8">&ldquo;{cta}&rdquo;</p>
                      <Button variant="ghost" size="icon" className="h-5 w-5 absolute top-2 right-2 text-white/20 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copySuggestion(cta, `cta-${i}`)}>
                        {copiedSuggestion === `cta-${i}` ? <CheckCheck className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!draft} className="bg-amber-500 hover:bg-amber-400 text-slate-950 gap-2">
          Add Multimedia <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
