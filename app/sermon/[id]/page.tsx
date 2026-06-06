export const dynamic = 'force-dynamic'

import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SermonWorkspace from './sermon-workspace'

export default async function SermonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: sermon, error } = await supabase
    .from('sermons')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !sermon) notFound()

  const { data: inputs } = await supabase
    .from('sermon_inputs')
    .select('*')
    .eq('sermon_id', id)
    .order('created_at', { ascending: true })

  const { data: drafts } = await supabase
    .from('sermon_drafts')
    .select('*')
    .eq('sermon_id', id)
    .order('version', { ascending: false })
    .limit(1)

  const { data: media } = await supabase
    .from('sermon_media')
    .select('*')
    .eq('sermon_id', id)
    .order('order_index', { ascending: true })

  const { data: outreach } = await supabase
    .from('outreach_posts')
    .select('*')
    .eq('sermon_id', id)
    .maybeSingle()

  return (
    <SermonWorkspace
      sermon={sermon}
      inputs={inputs ?? []}
      draft={drafts?.[0] ?? null}
      media={media ?? []}
      outreach={outreach ?? null}
    />
  )
}
