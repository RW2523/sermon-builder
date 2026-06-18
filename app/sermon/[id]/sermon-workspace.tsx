'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BookOpen, CheckCircle2 } from 'lucide-react'
import type { Sermon, SermonInput, SermonDraft, SermonMedia, OutreachPost } from '@/types'
import Stage1Ingestion from '@/components/sermon/stage1-ingestion'
import Stage2Polish from '@/components/sermon/stage2-polish'
import Stage3Multimedia from '@/components/sermon/stage3-multimedia'
import Stage4Export from '@/components/sermon/stage4-export'
import { cn } from '@/lib/utils'

const STEPS = [
  { num: 1, label: 'Content Ingestion', desc: 'Notes, voice & documents' },
  { num: 2, label: 'Polish & Edit', desc: 'Refine & structure' },
  { num: 3, label: 'Multimedia', desc: 'Visuals & imagery' },
  { num: 4, label: 'Presentation & Publish', desc: 'Export & distribute' },
]

interface Props {
  sermon: Sermon
  inputs: SermonInput[]
  draft: SermonDraft | null
  media: SermonMedia[]
  outreach: OutreachPost | null
}

export default function SermonWorkspace({ sermon: initialSermon, inputs: initialInputs, draft: initialDraft, media: initialMedia, outreach: initialOutreach }: Props) {
  const [sermon, setSermon] = useState(initialSermon)
  const [inputs, setInputs] = useState(initialInputs)
  const [draft, setDraft] = useState(initialDraft)
  const [media, setMedia] = useState(initialMedia)
  const [outreach, setOutreach] = useState(initialOutreach)
  const [activeStage, setActiveStage] = useState(initialSermon.current_stage)

  async function goToStage(stage: number) {
    // Navigation is optimistic; stage persistence failing shouldn't block the UI
    setActiveStage(stage as 1 | 2 | 3 | 4)
    try {
      const res = await fetch(`/api/sermons/${sermon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_stage: stage }),
      })
      if (res.ok) {
        setSermon((prev) => ({ ...prev, current_stage: stage as 1 | 2 | 3 | 4 }))
      }
    } catch {
      // offline / transient failure — stage will re-sync on next successful save
    }
  }

  return (
    <div className="app-shell flex flex-col text-white">
      {/* Header */}
      <header className="border-b border-white/[0.07] bg-black/20 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Back to dashboard" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 p-1.5 shadow shadow-amber-950/40">
            <BookOpen className="h-3.5 w-3.5 text-slate-900" />
          </div>
          <h1 className="font-display text-white font-semibold text-lg truncate flex-1">{sermon.title}</h1>
          <span className="hidden sm:block text-xs text-white/35 font-mono">Stage {activeStage} of 4</span>
        </div>
      </header>

      {/* Stepper */}
      <div className="border-b border-white/[0.07] bg-black/10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center overflow-x-auto pb-1">
            {STEPS.map((step, i) => {
              const completed = activeStage > step.num
              const active = activeStage === step.num
              return (
                <div key={step.num} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
                  <button
                    onClick={() => goToStage(step.num)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60',
                      active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.05]'
                    )}
                  >
                    <span
                      className={cn(
                        'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all',
                        active
                          ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-lg shadow-amber-950/50 ring-2 ring-amber-400/40'
                          : completed
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                          : 'border border-white/20 text-white/40'
                      )}
                    >
                      {completed ? <CheckCircle2 className="h-4 w-4" /> : step.num}
                    </span>
                    <span className="hidden md:block text-left leading-tight">
                      <span className={cn('block font-medium', active ? 'text-white' : completed ? 'text-white/70' : 'text-white/40')}>
                        {step.label}
                      </span>
                      <span className="block text-[11px] text-white/30">{step.desc}</span>
                    </span>
                    <span className={cn('md:hidden font-medium', active ? 'text-white' : 'text-white/40')}>
                      {active && step.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 mx-2 rounded-full bg-white/10 overflow-hidden min-w-6">
                      <div
                        className={cn(
                          'h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-500',
                          completed ? 'w-full' : 'w-0'
                        )}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stage content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {activeStage === 1 && (
          <Stage1Ingestion
            sermon={sermon}
            inputs={inputs}
            onInputsChange={setInputs}
            onNext={() => { setSermon(s => ({...s, current_stage: 2})); goToStage(2) }}
          />
        )}
        {activeStage === 2 && (
          <Stage2Polish
            sermon={sermon}
            inputs={inputs}
            draft={draft}
            onDraftChange={setDraft}
            onSermonChange={setSermon}
            onNext={() => { goToStage(3) }}
            onBack={() => { goToStage(1) }}
          />
        )}
        {activeStage === 3 && (
          <Stage3Multimedia
            sermon={sermon}
            draft={draft}
            media={media}
            onMediaChange={setMedia}
            onNext={() => { goToStage(4) }}
            onBack={() => { goToStage(2) }}
          />
        )}
        {activeStage === 4 && (
          <Stage4Export
            sermon={sermon}
            draft={draft}
            media={media}
            outreach={outreach}
            onOutreachChange={setOutreach}
            onSermonChange={setSermon}
            onDraftChange={setDraft}
            onBack={() => { goToStage(3) }}
          />
        )}
      </main>
    </div>
  )
}
