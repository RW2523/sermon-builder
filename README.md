# Sermon Builder

An AI-powered end-to-end sermon creation, editing, multimedia enhancement, and outreach platform for pastors. Built with Next.js 15, Supabase, and Google Gemini.

## Features

- **Stage 1 — Ingestion**: Type notes, dictate live (Web Speech API), upload audio files (Gemini transcription)
- **Stage 2 — Polish & Edit**: AI-powered sermon polishing (Gemini), rich Tiptap editor, 6 template formats (Message, Prayer, Story, Devotional, Teaching, Custom)
- **Stage 3 — Multimedia**: Generate action-based illustrations and biblical maps using Gemini Nano Banana image models
- **Stage 4 — Export & Outreach**:
  - Download PDF (jsPDF, with images)
  - Download PowerPoint (pptxgenjs, styled slides)
  - Record audio + render sermon video (images cross-fading behind voice, client-side Canvas + MediaRecorder)
  - AI social media captions (Instagram, Facebook, Twitter thread, hashtags)
  - One-click public share page at `/share/[slug]`

## Tech Stack

- **Frontend**: Next.js 15 App Router, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend**: Supabase (Auth, Postgres, Storage), Google Gemini (`@google/genai`)
- **AI Models**:
  - Text: `gemini-3-flash-preview`
  - Images: `gemini-2.5-flash-image` (Nano Banana), `gemini-3-pro-image-preview` (Pro)
- **Exports**: `jspdf`, `pptxgenjs`, browser Canvas + MediaRecorder
- **Editor**: Tiptap
- **Deployment**: Vercel

---

## Setup

### 1. Clone & install

```bash
git clone <repo-url>
cd sermon_builder
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration file:
   ```
   supabase/migration.sql
   ```
3. Go to **Storage** → create 3 buckets:
   - `sermon-audio` (private)
   - `sermon-media` (public)
   - `sermon-exports` (private)
4. For `sermon-media`, make it public (Settings → Public bucket ✓)

### 3. Get your Gemini API key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API Key** → **Create API key**
3. Copy the key

### 4. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
```

Find Supabase keys at: **Project Settings → API**

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel
vercel
```

Then set environment variables:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add GEMINI_API_KEY
```

### Option B — Vercel Dashboard

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Under **Environment Variables**, add all 4 variables from `.env.example`
4. Click **Deploy**

### After deploying

Add your Vercel domain to Supabase:
- **Authentication → URL Configuration → Site URL**: `https://your-app.vercel.app`
- **Authentication → URL Configuration → Redirect URLs**: `https://your-app.vercel.app/**`

---

## Project Structure

```
app/
  (auth)/login/        Login page
  (auth)/signup/       Signup page
  auth/callback/       Supabase auth callback
  dashboard/           Sermon list + create/delete
  sermon/[id]/         4-stage sermon workspace
  share/[slug]/        Public sermon share page
  api/
    transcribe/        Audio → Gemini transcription
    polish/            Raw inputs → polished HTML
    template/          Reformat to template type
    image/             Gemini image/map generation
    outreach/          Social captions + share slug
    sermons/           CRUD for sermons

components/
  sermon/
    stage1-ingestion.tsx   Ingest text, dictation, audio
    stage2-polish.tsx      AI polish + Tiptap editor
    stage3-multimedia.tsx  Image/map generation
    stage4-export.tsx      PDF/PPT/Video/Outreach
  ui/                  shadcn/ui components

lib/
  supabase/
    client.ts          Browser Supabase client
    server.ts          Server Supabase client + admin
  gemini.ts            Gemini AI client
  exports/
    pdf.ts             jsPDF export
    ppt.ts             pptxgenjs export
    video.ts           Canvas + MediaRecorder video

supabase/
  migration.sql        Full DB schema + RLS policies

types/
  index.ts             All TypeScript interfaces
```

---

## Security Notes

- `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are **server-only** — never `NEXT_PUBLIC_`
- All Supabase tables have Row Level Security (RLS) — pastors only access their own data
- Public share pages use a separate server-only Supabase admin query with `is_public = true` check

## License

MIT
