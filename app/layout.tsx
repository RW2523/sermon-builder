import type { Metadata } from 'next'
import { Geist, Geist_Mono, Fraunces } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['opsz'],
})

export const metadata: Metadata = {
  title: {
    default: 'Sermon Builder Studio',
    template: '%s · Sermon Builder Studio',
  },
  description:
    'AI-powered sermon creation for pastors — collect ideas, polish with AI, generate visuals, and publish everywhere.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}>
      <body className="antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
