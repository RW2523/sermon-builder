'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from './format-date'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BookOpen, Plus, MoreVertical, Trash2, LogOut, Loader2, FileText } from 'lucide-react'
import type { Sermon, Profile } from '@/types'
import { toast } from 'sonner'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-600 text-slate-100',
  polished: 'bg-blue-600 text-blue-100',
  multimedia: 'bg-purple-600 text-purple-100',
  exported: 'bg-green-600 text-green-100',
  published: 'bg-emerald-500 text-emerald-50',
}

const STAGE_LABELS: Record<number, string> = {
  1: 'Ingestion',
  2: 'Polish & Edit',
  3: 'Multimedia',
  4: 'Export',
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

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true)
    const { data, error } = await supabase
      .from('sermons')
      .insert({ title: newTitle.trim() })
      .select()
      .single()
    setCreating(false)
    if (error) { toast.error(error.message); return }
    setShowNew(false)
    setNewTitle('')
    router.push(`/sermon/${data.id}`)
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <div className="rounded-full bg-purple-600 p-1.5">
              <BookOpen className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">Sermon Builder</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-sm hidden sm:block">
              {profile?.full_name ?? ''}{profile?.church ? ` · ${profile.church}` : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/70 hover:text-white hover:bg-white/10"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Page title + new sermon button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">My Sermons</h1>
            <p className="text-white/50 text-sm mt-0.5">{sermons.length} sermon{sermons.length !== 1 ? 's' : ''}</p>
          </div>
          <Button
            onClick={() => setShowNew(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New Sermon
          </Button>
        </div>

        {/* Sermon grid */}
        {sermons.length === 0 ? (
          <div className="text-center py-24 text-white/40 space-y-3">
            <FileText className="h-12 w-12 mx-auto opacity-30" />
            <p className="text-lg">No sermons yet</p>
            <p className="text-sm">Click &ldquo;New Sermon&rdquo; to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sermons.map((sermon) => (
              <Card
                key={sermon.id}
                className="border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors cursor-pointer group"
                onClick={() => router.push(`/sermon/${sermon.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug line-clamp-2">{sermon.title}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-slate-900 border-white/10 text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          className="text-red-400 focus:text-red-300 focus:bg-red-950/50 cursor-pointer"
                          onClick={() => setDeleteTarget(sermon.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 space-y-2">
                  {sermon.scripture_ref && (
                    <p className="text-white/50 text-xs truncate">{sermon.scripture_ref}</p>
                  )}
                  {sermon.theme && (
                    <p className="text-white/40 text-xs truncate italic">{sermon.theme}</p>
                  )}
                </CardContent>
                <CardFooter className="pt-0 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-xs px-2 py-0.5 ${STATUS_COLORS[sermon.status]}`}>
                      {sermon.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs px-2 py-0.5 border-white/20 text-white/60">
                      Stage {sermon.current_stage}: {STAGE_LABELS[sermon.current_stage]}
                    </Badge>
                  </div>
                  <span className="text-white/30 text-xs shrink-0">
                    {formatDistanceToNow(sermon.updated_at)}
                  </span>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* New Sermon Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Create New Sermon</DialogTitle>
            <DialogDescription className="text-white/50">
              Give your sermon a working title to get started.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Walking in Faith"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="border-white/20 bg-white/10 text-white placeholder:text-white/30"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" className="text-white/70" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-500"
              onClick={handleCreate}
              disabled={!newTitle.trim() || creating}
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Delete Sermon</DialogTitle>
            <DialogDescription className="text-white/50">
              This action cannot be undone. All inputs, drafts, media, and exports will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="text-white/70" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
