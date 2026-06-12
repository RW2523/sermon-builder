'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookOpen, Loader2, Mail, Lock, User, Church } from 'lucide-react'
import { toast } from 'sonner'

const inputClass =
  'h-11 pl-10 border-white/15 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:ring-purple-400/50 focus-visible:border-purple-400/50'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [church, setChurch] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    // Update profile with church name
    const { data: { user } } = await supabase.auth.getUser()
    if (user && church.trim()) {
      const { error: profileError } = await supabase.from('profiles').update({ church }).eq('id', user.id)
      if (profileError) {
        toast.warning('Account created, but saving your church name failed — you can update it later.')
      }
    }
    toast.success('Account created! Welcome to Sermon Builder.')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="app-shell flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Link href="/" className="flex flex-col items-center gap-3 group">
          <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 p-3.5 shadow-xl shadow-purple-900/50 group-hover:scale-105 transition-transform">
            <BookOpen className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Create your account</h1>
            <p className="text-white/50 text-sm mt-1">Start building powerful sermons with AI.</p>
          </div>
        </Link>

        <form onSubmit={handleSignup} className="glass rounded-2xl p-6 sm:p-8 space-y-4 shadow-2xl shadow-black/30">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-white/70">Full name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                id="fullName"
                placeholder="Pastor John Smith"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="church" className="text-white/70">Church name <span className="text-white/30">(optional)</span></Label>
            <div className="relative">
              <Church className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                id="church"
                placeholder="Grace Community Church"
                value={church}
                onChange={(e) => setChurch(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
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
                className={inputClass}
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
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={inputClass}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-11 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium shadow-lg shadow-purple-900/40 mt-2"
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create account
          </Button>

          <p className="text-center text-white/50 text-sm pt-1">
            Already have an account?{' '}
            <Link href="/login" className="text-purple-300 hover:text-purple-200 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
