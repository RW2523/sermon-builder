import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/api/guards'

const DEMO_EMAIL = process.env.DEMO_EMAIL
const DEMO_PASSWORD = process.env.DEMO_PASSWORD

export async function POST(req: Request) {
  if (!DEMO_EMAIL || !DEMO_PASSWORD) {
    return NextResponse.json({ error: 'Demo login is not configured' }, { status: 503 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(`demo-login:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts — please try again later' }, { status: 429 })
  }
  const supabase = await createClient()

  // Try signing in first
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  })

  if (!signInError && signInData.user) {
    return NextResponse.json({ success: true })
  }

  // If sign-in failed, create the demo account and seed it with a sample sermon
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    options: {
      data: { full_name: 'Pastor Demo' },
      emailRedirectTo: undefined,
    },
  })

  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 500 })
  }

  // Update profile with church name
  if (signUpData.user) {
    await supabase.from('profiles').upsert({
      id: signUpData.user.id,
      full_name: 'Pastor Demo',
      church: 'Grace Community Demo Church',
    })
  }

  // Sign in after creating account
  const { error: finalSignIn } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  })

  if (finalSignIn) {
    return NextResponse.json({ error: 'Demo login failed. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
