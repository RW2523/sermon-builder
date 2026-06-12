# Sermon Builder Studio

An AI-powered, end-to-end sermon platform for pastors: collect raw ideas in any form, let AI polish them into a structured sermon, generate matching visuals, and publish in five formats — PDF, PowerPoint, print notes, narrated video, and a public share page with ready-made social media content.

Built with **Next.js 16**, **Supabase**, and **Google Gemini**.

## How it works — the 4-stage workflow

| Stage | What happens |
|---|---|
| **1 · Collect** | Type notes, dictate live (Web Speech API), upload audio recordings (Gemini transcription), upload PDF/Word documents (Gemini text extraction), or add scripture references with study notes |
| **2 · AI polish** | Gemini transforms all inputs into a structured sermon draft (hook, scripture intro, main points, application, closing). Restyle into any of **10 template formats** (Sunday message, prayer, story-driven, devotional, teaching, testimony, youth, small group, storytelling, custom). Edit in a Tiptap rich-text editor and get AI coaching suggestions (illustrations, applications, scripture connections, hooks, closing calls) |
| **3 · Visuals** | Gemini image models generate biblical scene illustrations, historical maps, timelines, scripture slides, and title graphics — from your prompt or auto-suggested from the sermon content |
| **4 · Export & publish** | Download PDF manuscript (jsPDF) and PowerPoint deck (pptxgenjs, with AI speaker notes), open a print view for pulpit notes, record narration and render a slideshow video in the browser (Canvas + MediaRecorder), and publish a public share page with AI-written social captions and hashtags |

## Tech stack

- **App**: Next.js 16 App Router (frontend + API routes in one deployment), TypeScript, Tailwind CSS 4, shadcn/ui, Tiptap
- **Backend services**: Supabase (Auth, Postgres with row-level security, Storage)
- **AI**: Google Gemini via `@google/genai` — `gemini-3-flash-preview` (text, transcription, extraction), `gemini-2.5-flash-image` / `gemini-3-pro-image-preview` (images)
- **Exports**: jsPDF, pptxgenjs, browser Canvas + MediaRecorder (no server-side rendering)
- **Hosting**: Vercel · **CI/CD**: GitLab (`.gitlab-ci.yml`)

## API endpoints

All endpoints require an authenticated session except `/api/health`, `/api/demo-login`, and the public share page. AI endpoints are rate-limited (30 requests/hour/user) and verify sermon ownership before calling Gemini.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Health + config check (for monitoring and CI smoke tests) |
| `/api/demo-login` | POST | Sign in to the shared demo account (disabled unless `DEMO_EMAIL`/`DEMO_PASSWORD` are set; rate-limited per IP) |
| `/api/sermons` | GET / POST | List / create sermons |
| `/api/sermons/[id]` | GET / PATCH / DELETE | Fetch with relations / update (whitelisted fields) / delete |
| `/api/transcribe` | POST | Transcribe an audio file already uploaded to the `sermon-audio` bucket (send `{ sermonId, storagePath, mimeType }` — max 20MB) |
| `/api/extract-doc` | POST | Extract text from an uploaded PDF/Word/text file (multipart, max 4MB — Vercel body limit) |
| `/api/polish` | POST | Turn collected inputs into a polished sermon draft |
| `/api/template` | POST | Restructure a draft into one of the 10 template formats |
| `/api/suggestions` | POST | AI coaching suggestions for the current draft |
| `/api/speaker-notes` | POST | Generate delivery notes, saved to the draft |
| `/api/image` | POST | Generate a visual (`image`, `map`, `timeline`, `scripture_slide`, `graphic`) and store it in the `sermon-media` bucket |
| `/api/outreach` | POST | Generate social media content and a public share slug |
| `/auth/callback` | GET | Supabase auth code exchange (validated relative-path redirects only) |
| `/share/[slug]` | GET (page) | Public sermon page for published outreach posts (sanitized HTML) |

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/RW2523/sermon-builder.git
cd sermon_builder
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run the whole of `supabase/migration.sql` — it creates all tables, row-level-security policies, the three storage buckets, and the storage policies:
   - `sermon-audio` — private (user uploads, read server-side for transcription)
   - `sermon-media` — **public** (generated images are served via public URLs)
   - `sermon-exports` — private
3. In **Authentication → URL Configuration**, set your site URL and redirect URLs (see "After deploying" below)

### 3. Get a Gemini API key

[aistudio.google.com](https://aistudio.google.com) → **Get API Key** → **Create API key**

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only — never expose with `NEXT_PUBLIC_` |
| `GEMINI_API_KEY` | ✅ | Server-only |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | optional | Enables the one-click demo login; use a strong unique password and never commit real values |

`GET /api/health` reports which of these are configured (booleans only, no values).

### 5. Run locally

```bash
npm run dev        # start dev server on http://localhost:3000
npm run lint       # ESLint
npx tsc --noEmit   # type check
npm run build      # production build (type checking enforced)
```

---

## Deployment

### Vercel

The whole app (frontend + API routes) deploys as one Vercel project — no separate backend host is needed; Supabase and Gemini are the backend services.

1. Import the repo at [vercel.com](https://vercel.com) (or `npx vercel`)
2. Add the environment variables from the table above
3. Deploy, then verify `https://your-app.vercel.app/api/health` returns `{"status":"ok"}`

After deploying, add your domain in Supabase **Authentication → URL Configuration**:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**`

### GitLab CI/CD

`.gitlab-ci.yml` runs two stages:

- **check** — `npm ci`, ESLint, `tsc --noEmit`, production build (on every merge request and push to `main`)
- **deploy_production** — deploys to Vercel and smoke-tests `/api/health` (on `main` only)

Required CI/CD variables (Settings → CI/CD → Variables, masked):

| Variable | Where to get it |
|---|---|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` |

---

## Project structure

```
app/
  (auth)/login, signup/   Auth pages (+ one-click demo login)
  auth/callback/          Supabase auth code exchange
  dashboard/              Sermon list, create, delete
  sermon/[id]/            4-stage sermon workspace
  share/[slug]/           Public sermon share page (sanitized)
  api/                    All API routes (see endpoint table)

components/
  sermon/stage1-4*.tsx    The four workspace stages
  ui/                     shadcn/ui components

lib/
  api/guards.ts           Ownership checks + rate limiting for API routes
  sanitize.ts             DOMPurify HTML sanitization + escaping
  supabase/               Browser, server (RLS-scoped), and admin clients
  gemini.ts               Gemini client and model helpers
  exports/                pdf.ts, ppt.ts, print.ts, video.ts (all client-side)

supabase/migration.sql    Schema, RLS policies, storage buckets + policies
types/index.ts            Shared TypeScript interfaces
proxy.ts                  Middleware: session refresh + route protection
```

## Security model

- **Row-level security on every table** — users can only reach their own sermons and related rows; API routes additionally verify ownership before doing AI work
- **AI-generated HTML is sanitized** (DOMPurify) before rendering on the public share page and in the print view — it originates from user uploads and is treated as untrusted
- **Server-only secrets**: `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` never reach the client; the admin client is used only where RLS must be bypassed deliberately (public share page reads, server-side storage access with path-prefix checks)
- **Rate limits**: 30 AI calls/hour/user, 10 demo-login attempts/15 min/IP (in-memory, per serverless instance — best-effort)
- **Auth callback** only follows same-origin relative redirect paths
- **PATCH whitelisting** — sermon updates accept only known fields

## Known limitations

- Uploads through API routes are capped by Vercel's ~4.5MB body limit; audio avoids this by uploading directly to Supabase storage, but documents are capped at 4MB
- Transcription audio is capped at 20MB (Gemini inline data limit) — roughly a 20–40 minute MP3
- Gemini *preview* model names can be deprecated on short notice — update `lib/gemini.ts` if generation starts failing
- Deleting a sermon removes its database rows (cascade) but not yet its storage objects

## License

MIT
