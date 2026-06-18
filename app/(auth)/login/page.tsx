'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { BookOpen, Loader2, Zap, Mail, Lock } from 'lucide-react'
import { toast } from 'sonner'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const autoDemoFired = useRef(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleDemoLogin() {
    setDemoLoading(true)
    toast.info('Setting up the demo…')
    try {
      const res = await fetch('/api/demo-login', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Demo login failed')
        return
      }
      await supabase.auth.refreshSession()
      toast.success('Welcome to the demo!')
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast.error('Demo login failed — check your connection')
    } finally {
      setDemoLoading(false)
    }
  }

  // Landing page "Try the live demo" CTA lands here with ?demo=1
  useEffect(() => {
    if (searchParams.get('demo') === '1' && !autoDemoFired.current) {
      autoDemoFired.current = true
      handleDemoLogin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <div className="app-shell flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Logo + title */}
        <Link href="/" className="flex flex-col items-center gap-3 group">
          <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 p-3.5 shadow-xl shadow-amber-950/50 group-hover:scale-105 transition-transform">
            <BookOpen className="h-7 w-7 text-slate-900" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight">SabAi Sermon</h1>
            <p className="text-white/50 text-sm mt-1">Welcome back — let&apos;s build something worth preaching.</p>
          </div>
        </Link>

        <div className="glass rounded-2xl p-6 sm:p-8 space-y-5 shadow-2xl shadow-black/30">
          <Button
            type="button"
            className="w-full h-11 gap-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-semibold shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/35"
            onClick={handleDemoLogin}
            disabled={demoLoading || loading}
          >
            {demoLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Zap className="h-4 w-4 fill-amber-950" />}
            {demoLoading ? 'Preparing your demo…' : 'Try the demo — no account needed'}
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1 bg-white/10" />
            <span className="text-white/30 text-xs whitespace-nowrap">or sign in with email</span>
            <Separator className="flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/70">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  id="email"
                  type="email"
                  placeholder="pastor@church.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 pl-10 border-white/15 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:ring-amber-400/50 focus-visible:border-amber-400/50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/70">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pl-10 border-white/15 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:ring-amber-400/50 focus-visible:border-amber-400/50"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-medium shadow-lg shadow-amber-950/40"
              disabled={loading || demoLoading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sign in
            </Button>
          </form>

          <p className="text-center text-white/50 text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-amber-300 hover:text-amber-200 font-medium">
              Create one free
            </Link>
          </p>
        </div>

        <p className="text-center text-white/25 text-xs px-4">
          The demo account is shared — don&apos;t enter real sermon content in demo mode.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
