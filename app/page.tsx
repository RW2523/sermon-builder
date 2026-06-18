export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import {
  BookOpen, Sparkles, Mic, ImageIcon, Share2, ArrowRight,
  FileText, Presentation, Printer, Video, Zap,
} from 'lucide-react'

const STAGES = [
  {
    icon: Mic,
    title: 'Collect everything',
    desc: 'Type notes, dictate out loud, upload recordings or documents — every scattered idea lands in one place.',
    color: 'text-amber-400 bg-amber-500/10 border-amber-400/20',
  },
  {
    icon: Sparkles,
    title: 'Polish your message',
    desc: 'Your raw material is shaped into a structured sermon, restyled into any of 10 formats you preach in.',
    color: 'text-amber-400 bg-amber-500/10 border-amber-400/20',
  },
  {
    icon: ImageIcon,
    title: 'Generate visuals',
    desc: 'Biblical scenes, maps, timelines and scripture slides — matched to your message, ready for the screen.',
    color: 'text-amber-400 bg-amber-500/10 border-amber-400/20',
  },
  {
    icon: Share2,
    title: 'Publish everywhere',
    desc: 'PDF, PowerPoint, print notes, narrated video, plus a beautiful share page with social captions written for you.',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
]

const OUTPUTS = [
  { icon: FileText, label: 'PDF manuscript' },
  { icon: Presentation, label: 'Slide deck' },
  { icon: Printer, label: 'Pulpit notes' },
  { icon: Video, label: 'Narrated video' },
  { icon: Share2, label: 'Share page' },
]

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="app-shell text-white overflow-hidden">
      {/* Nav */}
      <header className="relative z-10 max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-2 shadow-lg shadow-amber-950/40">
            <BookOpen className="h-5 w-5 text-slate-900" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">SabAi Sermon</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10">Sign in</Button>
          </Link>
          <Link href="/signup">
            <Button className="bg-white text-slate-950 hover:bg-white/90 font-medium">Get started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-sm text-amber-200 mb-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
          <Zap className="h-3.5 w-3.5 text-amber-300" />
          A complete sermon studio for pastors
        </div>
        <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-semibold leading-[1.05] tracking-tight animate-in fade-in slide-in-from-bottom-3 duration-700">
          From scattered notes
          <br />
          to <span className="bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent">Sunday-ready</span>.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-3 duration-700 delay-150 fill-mode-both">
          Bring your voice memos, study notes and scripture. Leave with a polished sermon,
          presentation visuals, a video, and social posts — all in one guided flow.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-300 fill-mode-both">
          <Link href="/login?demo=1">
            <Button size="lg" className="h-12 px-7 text-base bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-xl shadow-amber-950/40 gap-2">
              Try the live demo <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="lg" variant="outline" className="h-12 px-7 text-base border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              Create free account
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-sm text-white/35">One click, no signup — explore with the shared demo account.</p>
      </section>

      {/* 4 stages */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STAGES.map((s, i) => (
            <div
              key={s.title}
              className="glass rounded-2xl p-6 card-lift animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both"
              style={{ animationDelay: `${300 + i * 120}ms` }}
            >
              <div className={`inline-flex rounded-xl border p-2.5 ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-white/30 text-sm font-mono">0{i + 1}</span>
                <h3 className="font-semibold">{s.title}</h3>
              </div>
              <p className="mt-2 text-sm text-white/55 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Output strip */}
      <section className="relative z-10 border-t border-white/5 bg-black/20">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <p className="text-center text-sm text-white/40 uppercase tracking-widest mb-6">One sermon in, five formats out</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {OUTPUTS.map((o) => (
              <div key={o.label} className="flex items-center gap-2.5 text-white/70">
                <o.icon className="h-4.5 w-4.5 text-amber-300" />
                <span className="text-sm font-medium">{o.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-white/35">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>SabAi Sermon</span>
          </div>
          <span>Built for pastors.</span>
        </div>
      </footer>
    </div>
  )
}
