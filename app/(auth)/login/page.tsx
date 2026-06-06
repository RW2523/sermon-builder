'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { BookOpen, Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

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
    toast.info('Setting up demo account…')

    const res = await fetch('/api/demo-login', { method: 'POST' })
    const json = await res.json()

    if (!res.ok) {
      setDemoLoading(false)
      toast.error(json.error ?? 'Demo login failed')
      return
    }

    // Refresh auth state then navigate
    await supabase.auth.refreshSession()
    toast.success('Welcome to the demo! 🎉')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-2 text-white">
          <div className="rounded-full bg-white/10 p-3">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Sermon Builder</h1>
          <p className="text-white/70 text-sm">AI-powered sermon creation platform</p>
        </div>

        <Card className="border-white/10 bg-white/5 text-white backdrop-blur">
          <CardHeader>
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription className="text-white/60">Sign in to your account</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pb-2">
            {/* Demo login — prominent at the top */}
            <Button
              type="button"
              className="w-full gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold shadow-lg shadow-amber-500/20"
              onClick={handleDemoLogin}
              disabled={demoLoading || loading}
            >
              {demoLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Zap className="h-4 w-4 fill-black" />}
              {demoLoading ? 'Loading demo…' : 'Try Demo — no account needed'}
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1 bg-white/10" />
              <span className="text-white/30 text-xs">or sign in with email</span>
              <Separator className="flex-1 bg-white/10" />
            </div>
          </CardContent>

          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/80">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="pastor@church.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-purple-400"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/80">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-purple-400"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-500 text-white"
                disabled={loading || demoLoading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
              <p className="text-white/60 text-sm">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="text-purple-300 hover:text-purple-200 underline">
                  Sign up
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-white/30 text-xs px-4">
          The demo account is shared — do not enter real sermon content in demo mode.
        </p>
      </div>
    </div>
  )
}
