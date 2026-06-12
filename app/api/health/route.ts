import { NextResponse } from 'next/server'

// Unauthenticated health check for monitoring and CI/CD smoke tests.
// Reports configuration presence only — never values.
export async function GET() {
  const config = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
    demoLogin: Boolean(process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD),
  }
  const ready = config.supabaseUrl && config.supabaseAnonKey && config.supabaseServiceRoleKey && config.geminiApiKey

  return NextResponse.json(
    { status: ready ? 'ok' : 'misconfigured', config },
    { status: ready ? 200 : 503 }
  )
}
