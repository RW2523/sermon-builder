export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './dashboard-client'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: sermons } = await supabase
    .from('sermons')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  return <DashboardClient profile={profile} sermons={sermons ?? []} />
}
