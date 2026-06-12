'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-white">
          <div className="rounded-full bg-white/10 p-3">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Sermon Builder</h1>
          <p className="text-white/70 text-sm">Create your pastor account</p>
        </div>
        <Card className="border-white/10 bg-white/5 text-white backdrop-blur">
          <CardHeader>
            <CardTitle className="text-xl">Create your account</CardTitle>
            <CardDescription className="text-white/60">Start building powerful sermons with AI</CardDescription>
          </CardHeader>
          <form onSubmit={handleSignup}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-white/80">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="Pastor John Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-purple-400"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="church" className="text-white/80">Church Name</Label>
                <Input
                  id="church"
                  placeholder="Grace Community Church"
                  value={church}
                  onChange={(e) => setChurch(e.target.value)}
                  className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-purple-400"
                />
              </div>
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
                  minLength={8}
                  className="border-white/20 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-purple-400"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-500 text-white"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
              <p className="text-white/60 text-sm">
                Already have an account?{' '}
                <Link href="/login" className="text-purple-300 hover:text-purple-200 underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
