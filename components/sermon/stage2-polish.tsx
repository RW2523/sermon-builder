'use client'

import { useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sparkles, Loader2, ArrowLeft, ArrowRight, Bold, Italic,
  Heading2, Heading3, List, Quote, Undo, Redo, Save
} from 'lucide-react'
import type { Sermon, SermonInput, SermonDraft, TemplateType } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TEMPLATES: { value: TemplateType; label: string; desc: string; icon: string }[] = [
  { value: 'message', label: 'Sunday Message', desc: 'Classic 3-point sermon', icon: '📖' },
  { value: 'prayer', label: 'Prayer Focus', desc: 'Intercession & praise', icon: '🙏' },
  { value: 'story', label: 'Story-Driven', desc: 'Narrative sermon style', icon: '📜' },
  { value: 'devotional', label: 'Devotional', desc: 'Short daily reflection', icon: '✨' },
  { value: 'teaching', label: 'Bible Teaching', desc: 'Deep expository study', icon: '🎓' },
  { value: 'custom', label: 'Custom', desc: 'Polish as-is', icon: '✏️' },
]

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Your polished sermon will appear here. Click "Polish with AI" to generate it.' }),
      Link.configure({ openOnClick: false }),
    ],
    content: draft?.polished_html ?? '',
    editorProps: {
      attributes: { class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px] text-white/90' },
    },
    onUpdate: () => {},
  })

  async function handlePolish() {
    if (!inputs.length) { toast.error('Add content in Stage 1 first'); return }
    setPolishing(true)
    const res = await fetch('/api/polish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sermonId: sermon.id,
        inputs,
        title: sermon.title,
        scriptureRef: sermon.scripture_ref,
        theme: sermon.theme,
      }),
    })
    const json = await res.json()
    setPolishing(false)
    if (!res.ok) { toast.error(json.error ?? 'Polish failed'); return }
    editor?.commands.setContent(json.draft.polished_html)
    onDraftChange(json.draft)
    onSermonChange({ ...sermon, status: 'polished' })
    toast.success('Sermon polished by AI!')
  }

  async function handleApplyTemplate() {
    const html = editor?.getHTML() ?? ''
    if (!html || html === '<p></p>') { toast.error('Polish your sermon first'); return }
    setApplying(true)
    const res = await fetch('/api/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sermonId: sermon.id,
        draftId: draft?.id,
        currentHtml: html,
        templateType: selectedTemplate,
      }),
    })
    const json = await res.json()
    setApplying(false)
    if (!res.ok) { toast.error(json.error ?? 'Template conversion failed'); return }
    editor?.commands.setContent(json.draft.polished_html)
    onDraftChange(json.draft)
    toast.success(`Converted to ${selectedTemplate} format!`)
  }

  const saveManualEdits = useCallback(async () => {
    const html = editor?.getHTML() ?? ''
    if (!draft?.id) return
    setSaving(true)
    const { data, error } = await supabase
      .from('sermon_drafts')
      .update({ polished_html: html })
      .eq('id', draft.id)
      .select()
      .single()
    setSaving(false)
    if (error) { toast.error(error.message); return }
    onDraftChange(data)
    toast.success('Draft saved')
  }, [editor, draft, supabase, onDraftChange])

  if (!editor) return null

  return (
    <div className="space-y-6">
      {/* AI Polish + Template row */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-yellow-400" /> AI Polish
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-white/50 text-sm">
              Gemini will transform your raw inputs into a powerful, structured sermon draft.
            </p>
            <Button
              className="w-full bg-yellow-600 hover:bg-yellow-500 gap-2"
              onClick={handlePolish}
              disabled={polishing || !inputs.length}
            >
              {polishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {polishing ? 'Polishing…' : 'Polish with Gemini AI'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white/80">Choose Template Format</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSelectedTemplate(t.value)}
                  className={cn(
                    'text-left p-2 rounded-lg border text-xs transition-all',
                    selectedTemplate === t.value
                      ? 'border-purple-500 bg-purple-900/40 text-white'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
                  )}
                >
                  <span className="text-base">{t.icon}</span>
                  <p className="font-medium mt-0.5">{t.label}</p>
                  <p className="text-white/40 text-[10px]">{t.desc}</p>
                </button>
              ))}
            </div>
            <Button
              className="w-full bg-purple-600 hover:bg-purple-500 gap-2"
              onClick={handleApplyTemplate}
              disabled={applying}
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {applying ? 'Converting…' : 'Apply Template'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Editor */}
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader className="pb-2 border-b border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm text-white/80">Edit Draft</CardTitle>
            <div className="flex items-center gap-1 flex-wrap">
              {/* Toolbar */}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
                <Italic className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
                <Heading2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
                <Heading3 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleBulletList().run()} title="List">
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
                <Quote className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().undo().run()} title="Undo">
                <Undo className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10" onClick={() => editor.chain().focus().redo().run()} title="Redo">
                <Redo className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-white/60 hover:text-white hover:bg-white/10 gap-1 text-xs"
                onClick={saveManualEdits}
                disabled={saving || !draft}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <EditorContent editor={editor} className="text-white/90" />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} className="text-white/60 hover:text-white gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!draft}
          className="bg-purple-600 hover:bg-purple-500 gap-2"
        >
          Add Multimedia <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
