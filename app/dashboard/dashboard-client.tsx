'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from './format-date'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  BookOpen, Plus, Trash2, LogOut, Loader2, FileText,
  Sparkles, BookMarked, Target, ArrowRight, Share2,
} from 'lucide-react'
import type { Sermon, Profile } from '@/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<string, { label: string; class: string }> = {
  draft: { label: 'Draft', class: 'bg-slate-500/20 text-slate-300 border-slate-400/30' },
  polished: { label: 'Polished', class: 'bg-blue-500/20 text-blue-300 border-blue-400/30' },
  multimedia: { label: 'Multimedia', class: 'bg-amber-500/20 text-amber-300 border-amber-400/30' },
  exported: { label: 'Exported', class: 'bg-green-500/20 text-green-300 border-green-400/30' },
  published: { label: 'Published', class: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' },
}

const STAGE_LABELS: Record<number, string> = {
  1: 'Collecting content',
  2: 'Polish & edit',
  3: 'Adding visuals',
  4: 'Export & publish',
}

interface Props {
  profile: Profile | null
  sermons: Sermon[]
}

export default function DashboardClient({ profile, sermons: initialSermons }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [sermons, setSermons] = useState(initialSermons)
  const [newTitle, setNewTitle] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)

  const initials = (profile?.full_name ?? 'P')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const publishedCount = sermons.filter((s) => s.status === 'published').length
  const inProgressCount = sermons.filter((s) => s.status !== 'published').length

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/sermons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Could not create sermon'); return }
      setShowNew(false)
      setNewTitle('')
      router.push(`/sermon/${data.id}`)
    } catch {
      toast.error('Could not create sermon — check your connection')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      const { error } = await supabase.from('sermons').delete().eq('id', id)
      if (error) { toast.error(error.message); return }
      setSermons((prev) => prev.filter((s) => s.id !== id))
      setDeleteTarget(null)
      toast.success('Sermon deleted')
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="app-shell text-white">
      {/* Header */}
      <header className="border-b border-white/[0.07] bg-black/20 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 p-2 shadow-lg shadow-amber-950/40">
              <BookOpen className="h-4.5 w-4.5 text-slate-900" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">SabAi Sermon</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600/60 to-blue-800/60 border border-white/15 flex items-center justify-center text-xs font-semibold">
                {initials}
              </div>
              <div className="leading-tight">
                <p className="text-sm font-medium text-white/90">{profile?.full_name ?? 'Pastor'}</p>
                {profile?.church && <p className="text-xs text-white/40">{profile.church}</p>}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white hover:bg-white/10"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Greeting + stats + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">
              {profile?.full_name ? `Welcome back, ${profile.full_name.split(' ')[0]}` : 'My sermons'}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-white/45">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> {sermons.length} sermon{sermons.length !== 1 ? 's' : ''}
              </span>
              {inProgressCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" /> {inProgressCount} in progress
                </span>
              )}
              {publishedCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Share2 className="h-3.5 w-3.5 text-emerald-300" /> {publishedCount} published
                </span>
              )}
            </div>
          </div>
          <Button
            onClick={() => setShowNew(true)}
            className="h-11 px-5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 gap-2 shadow-lg shadow-amber-950/40 shrink-0"
          >
            <Plus className="h-4 w-4" />
            New sermon
          </Button>
        </div>

        {/* Sermon grid */}
        {sermons.length === 0 ? (
          <div className="glass rounded-2xl text-center py-20 px-6 space-y-4 animate-in fade-in duration-700">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <BookMarked className="h-7 w-7 text-amber-300" />
            </div>
            <div>
              <p className="font-display text-xl font-semibold">Your first sermon starts here</p>
              <p className="text-white/45 text-sm mt-1 max-w-sm mx-auto">
                Bring your notes, voice memos, or a passage of scripture — we'll help with the rest.
              </p>
            </div>
            <Button
              onClick={() => setShowNew(true)}
              className="bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 gap-2"
            >
              <Plus className="h-4 w-4" /> Create your first sermon
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sermons.map((sermon, i) => {
              const status = STATUS_STYLE[sermon.status] ?? STATUS_STYLE.draft
              return (
                <button
                  key={sermon.id}
                  onClick={() => router.push(`/sermon/${sermon.id}`)}
                  className="glass card-lift rounded-2xl p-5 text-left group relative overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-both focus-visible:ring-2 focus-visible:ring-amber-400/60 outline-none"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {/* Top row: status + delete */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', status.class)}>
                      {status.label}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete ${sermon.title}`}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-300 hover:bg-red-950/40 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(sermon.id) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          setDeleteTarget(sermon.id)
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  {/* Title + meta */}
                  <h3 className="font-display text-lg font-semibold leading-snug line-clamp-2 group-hover:text-amber-200 transition-colors">
                    {sermon.title}
                  </h3>
                  <div className="mt-2 space-y-1 min-h-[2.5rem]">
                    {sermon.scripture_ref && (
                      <p className="text-white/50 text-xs flex items-center gap-1.5">
                        <BookMarked className="h-3 w-3 text-amber-300/70 shrink-0" />
                        <span className="truncate">{sermon.scripture_ref}</span>
                      </p>
                    )}
                    {sermon.theme && (
                      <p className="text-white/40 text-xs flex items-center gap-1.5">
                        <Target className="h-3 w-3 text-sky-300/70 shrink-0" />
                        <span className="truncate italic">{sermon.theme}</span>
                      </p>
                    )}
                  </div>

                  {/* Stage progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
                      <span>{STAGE_LABELS[sermon.current_stage]}</span>
                      <span className="font-mono">{sermon.current_stage}/4</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((s) => (
                        <div
                          key={s}
                          className={cn(
                            'h-1 flex-1 rounded-full transition-colors',
                            s <= sermon.current_stage
                              ? 'bg-gradient-to-r from-amber-400 to-yellow-300'
                              : 'bg-white/10'
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-white/30">{formatDistanceToNow(sermon.updated_at)}</span>
                    <span className="flex items-center gap-1 text-amber-300/0 group-hover:text-amber-300 transition-colors font-medium">
                      Open <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* New Sermon Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="border-white/10 bg-[oklch(0.21_0.05_292)] text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Create a new sermon</DialogTitle>
            <DialogDescription className="text-white/50">
              Give it a working title — you can change it anytime.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Walking in Faith"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-11 border-white/15 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:ring-amber-400/50"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950"
              onClick={handleCreate}
              disabled={!newTitle.trim() || creating}
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create sermon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="border-white/10 bg-[oklch(0.21_0.05_292)] text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Delete this sermon?</DialogTitle>
            <DialogDescription className="text-white/50">
              This can&apos;t be undone. All inputs, drafts, media, and exports will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete sermon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
