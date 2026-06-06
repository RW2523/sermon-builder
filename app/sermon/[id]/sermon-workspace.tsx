'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  { num: 2, label: 'AI Polish & Edit', desc: 'Refine & structure' },
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
  const router = useRouter()
  const [sermon, setSermon] = useState(initialSermon)
  const [inputs, setInputs] = useState(initialInputs)
  const [draft, setDraft] = useState(initialDraft)
  const [media, setMedia] = useState(initialMedia)
  const [outreach, setOutreach] = useState(initialOutreach)
  const [activeStage, setActiveStage] = useState(initialSermon.current_stage)

  async function goToStage(stage: number) {
    setActiveStage(stage as 1 | 2 | 3 | 4)
    // Persist stage to server
    await fetch(`/api/sermons/${sermon.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_stage: stage }),
    })
    setSermon((prev) => ({ ...prev, current_stage: stage as 1 | 2 | 3 | 4 }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="rounded-full bg-purple-600 p-1">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-white font-semibold text-lg truncate flex-1">{sermon.title}</h1>
        </div>
      </header>

      {/* Stepper */}
      <div className="border-b border-white/10 bg-black/10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STEPS.map((step, i) => {
              const completed = sermon.current_stage > step.num || (activeStage > step.num)
              const active = activeStage === step.num
              return (
                <div key={step.num} className="flex items-center shrink-0">
                  <button
                    onClick={() => goToStage(step.num)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      active
                        ? 'bg-purple-600 text-white'
                        : completed
                        ? 'bg-white/10 text-white/70 hover:bg-white/15'
                        : 'text-white/40 hover:text-white/60'
                    )}
                  >
                    {completed && !active ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                    ) : (
                      <span className={cn(
                        'h-5 w-5 rounded-full border-2 flex items-center justify-center text-xs shrink-0',
                        active ? 'border-white bg-white text-purple-700' : 'border-white/30 text-white/40'
                      )}>
                        {step.num}
                      </span>
                    )}
                    <span className="hidden sm:block">{step.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn('h-px w-6 mx-1', completed ? 'bg-white/30' : 'bg-white/10')} />
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
