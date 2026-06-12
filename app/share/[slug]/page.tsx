import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { sanitizeHtml } from '@/lib/sanitize'
import Image from 'next/image'
import Link from 'next/link'
import { BookOpen, Calendar, Share2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export const revalidate = 60

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]+$/.test(slug)) notFound()
  // Admin client is required here: sermons/drafts/media are owner-only under
  // RLS, and this public page must read them once the post is_public.
  const supabase = await createAdminClient()

  const { data: post, error } = await supabase
    .from('outreach_posts')
    .select('*')
    .eq('share_slug', slug)
    .eq('is_public', true)
    .single()

  if (error || !post) notFound()

  const { data: sermon } = await supabase
    .from('sermons')
    .select('*')
    .eq('id', post.sermon_id)
    .single()

  const { data: profile } = sermon
    ? await supabase.from('profiles').select('*').eq('id', sermon.user_id).single()
    : { data: null }

  const { data: draft } = await supabase
    .from('sermon_drafts')
    .select('*')
    .eq('sermon_id', post.sermon_id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: media } = await supabase
    .from('sermon_media')
    .select('*')
    .eq('sermon_id', post.sermon_id)
    .order('order_index', { ascending: true })

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/30 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <div className="rounded-full bg-purple-600 p-1.5">
              <BookOpen className="h-4 w-4" />
            </div>
            <span className="font-semibold">Sermon Builder</span>
          </div>
          <Badge className="bg-green-600 text-white text-xs gap-1">
            <Share2 className="h-3 w-3" /> Public Sermon
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
            {sermon?.title}
          </h1>
          {sermon?.scripture_ref && (
            <p className="text-purple-300 text-lg italic">{sermon.scripture_ref}</p>
          )}
          {sermon?.theme && (
            <p className="text-white/50">{sermon.theme}</p>
          )}
          <div className="flex items-center justify-center gap-3 text-white/40 text-sm">
            {profile?.full_name && (
              <span className="font-medium text-white/60">{profile.full_name}</span>
            )}
            {profile?.church && <span>· {profile.church}</span>}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(post.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Summary */}
        {post.summary && (
          <div className="bg-purple-900/20 border border-purple-500/20 rounded-xl p-6">
            <p className="text-white/80 leading-relaxed text-base">{post.summary}</p>
          </div>
        )}

        {/* Hero image */}
        {media && media.length > 0 && media[0].public_url && (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden">
            <Image
              src={media[0].public_url}
              alt={media[0].caption ?? sermon?.title ?? 'Sermon image'}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
            {media[0].caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <p className="text-white/80 text-sm italic">{media[0].caption}</p>
              </div>
            )}
          </div>
        )}

        {/* Sermon content */}
        {draft?.polished_html && (
          <div
            className="prose prose-invert max-w-none text-white/85 prose-headings:text-white prose-blockquote:border-l-purple-500 prose-blockquote:text-purple-200"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft.polished_html) }}
          />
        )}

        {/* Additional images */}
        {media && media.length > 1 && (
          <div className="space-y-4">
            <h3 className="text-white/60 text-sm font-medium uppercase tracking-wider">Visuals</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {media.slice(1).map((item) => item.public_url ? (
                <div key={item.id} className="space-y-2">
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                    <Image
                      src={item.public_url}
                      alt={item.caption ?? ''}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  </div>
                  {item.caption && <p className="text-white/50 text-xs italic">{item.caption}</p>}
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {/* Social share */}
        {post.social_caption && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-3">
            <p className="text-white/60 text-sm font-medium uppercase tracking-wider">Share this message</p>
            <p className="text-white/80">{post.social_caption}</p>
            {post.hashtags?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {post.hashtags.map((tag: string) => (
                  <Badge key={tag} variant="outline" className="border-purple-500/40 text-purple-400 text-xs">#{tag}</Badge>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-white/30 text-sm pt-4 border-t border-white/10">
          <p>Created with <Link href="/" className="text-purple-400 hover:text-purple-300">Sermon Builder</Link> — AI-powered sermon platform for pastors</p>
        </div>
      </main>
    </div>
  )
}
