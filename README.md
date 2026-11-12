# WhatsGram OS

Full-stack encrypted messaging, social feed, stories, vertical reels, WebRTC calls, and AI copilot web application built with vanilla ES modules, Tailwind CSS, esbuild, Vercel Serverless Functions, and Supabase.

---

## Key Capabilities

- **End-to-End Encrypted Messaging:** Client-side ECDH P-256 + AES-256-GCM 1:1 DMs and group E2EE channels (`E2EEv2`), 60-digit safety verification fingerprints, vanishing timers, quiet send, message search, and IndexedDB encrypted search indexing.
- **Zero-Knowledge Multi-Device Key Backup & 2FA:** PBKDF2-SHA256 (250k rounds) + AES-256-GCM recovery envelopes, live passphrase entropy meter, TOTP authenticator setup, active device sessions list, and WebAuthn passkeys.
- **Social Feed, Stories & Reels:** Explore / Following / Trending feed with topic filters, Collections, inline quick replies, Creator Insights, 24h Stories with interactive polls/sliders/Close Friends rings, Highlights, and vertical Reels with swipe/keyboard controls.
- **WebRTC Audio/Video Calls:** Peer-to-peer calling with Supabase Realtime signaling, optional screen sharing, and configurable STUN/TURN relay (`TURN_URLS`).
- **Multi-Provider AI Copilot:** Server-side routing across Groq (`openai/gpt-oss-120b` / `openai/gpt-oss-20b`), OpenRouter (`openrouter/free`, including vision fallback), and Google Gemini, with SSE streaming, JSON smart replies/captions, compose rewrite/translate, and local on-device fallback when offline or unconfigured.
- **PWA & Security Hardening:** Offline-capable service worker ([sw.js](sw.js)), background Web Push (`web-push`), strict Content Security Policy headers in [vercel.json](vercel.json), and Supabase Row-Level Security (RLS) across user/social/messaging tables.

---

## Project Structure

```text
├── index.html                 # Application HTML shell & modals
├── src/                       # Modular browser client source
│   ├── main.js                # Entry point bundled to assets/app.js
│   ├── app.js                 # Core UI state, E2EE, chat, stories, reels, AI & settings
│   ├── feed.js                # Explore/Following/Trending feed builder & DOM renderer
│   ├── features.js            # Tour steps, insights, story stickers, notification grouping
│   ├── ui-fx.js               # WebAuthn passkeys, panic wipe, encrypted IDB search index
│   ├── crypto-backup.js       # PBKDF2 + AES-GCM multi-device key envelope helpers
│   ├── idb.js                 # IndexedDB persistence helpers
│   ├── image-utils.js         # Client image compression & sanitization
│   ├── markdown.js            # Safe markdown & code-block renderer
│   ├── push-client.js         # Browser PushManager subscription helper
│   └── styles.css             # Tailwind input styles built to assets/app.css
├── assets/                    # Built production browser bundles (app.js, app.css)
├── api/                       # Vercel Serverless Function entrypoints
│   ├── supabase.js            # Unified Supabase API router
│   ├── auth.js / chat.js / social.js / media.js / push.js
│   ├── gemini.js              # Multi-provider AI endpoint (Groq, OpenRouter, Gemini)
│   ├── cron.js                # Scheduled maintenance endpoint
│   └── og.js                  # Dynamic OpenGraph social cards (/share/*)
├── lib/                       # Shared backend modules (auth, chat, social, media, push, safety, security, sb, router)
├── supabase/
│   ├── schema.sql             # Consolidated Postgres schema, RLS policies & `wg-media` bucket
│   ├── migrations/            # Incremental SQL migrations (`001` .. `003`)
│   └── tests/rls_audit.sql    # Live Postgres RLS verification check
├── .github/workflows/ci.yml   # GitHub Actions build & syntax CI
├── package.json               # Build, dev, and project verification scripts
├── tailwind.config.js         # Tailwind CSS configuration
├── vercel.json                # Rewrites, headers, CSP & daily `/api/cron` schedule
└── .env.example               # Template of supported environment variables
```

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js** `22+` (with `npm`)
- **Supabase project** (optional for Local Sandbox Mode; required for live cloud sync)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template and fill in your credentials
cp .env.example .env.local

# 3. Build frontend CSS & JS bundles
npm run build

# 4. Run syntax, config JSON, and build output checks
npm run check

# 5. Start local full-stack dev server (serves static files + `/api/*`)
npm run dev
```

*(Even without Supabase or AI keys configured locally, opening the app offers **Local Sandbox Mode** for offline exploration.)*

---

## Database Setup (Supabase Postgres)

1. Open your Supabase project → **SQL Editor → New Query**.
2. For a fresh project, paste and run [supabase/schema.sql](supabase/schema.sql).
   If migrating an existing installation, run the files inside `supabase/migrations/` in numeric order (`001` → `002` → `003`).
3. Verify Row-Level Security across all tables by running [supabase/tests/rls_audit.sql](supabase/tests/rls_audit.sql) in the SQL Editor (look for `RLS AUDIT PASSED`).

---

## Environment Variables

See [.env.example](.env.example) for the full template.

| Group | Variables | Required? | Purpose |
| --- | --- | --- | --- |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`), `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Yes (Cloud) | Auth, Postgres REST API, Realtime, Storage (`wg-media`) |
| **AI Providers** | `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY` (+ optional `GROQ_MODEL`, `OPENROUTER_MODEL`, `GEMINI_MODEL`) | Optional | Multi-provider LLM with automatic failover; falls back locally if unset |
| **Origin & Cron** | `APP_URL`, `CRON_SECRET` | Recommended | Canonical links/OG tags + bearer protection for `/api/cron` |
| **Web Push** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional | Background push notifications via `web-push` |
| **WebRTC TURN** | `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Optional | Relay calls across strict corporate/mobile firewalls |
| **Reset Emails** | `RESEND_API_KEY`, `RESEND_FROM` | Optional | Password-reset email delivery when not using Supabase Custom SMTP |

---

## Deploying to Vercel

1. Import the repository into Vercel (build command `npm run build`, output directory `.`).
2. Attach **Supabase** via Vercel Integrations (or add the Supabase variables above under **Settings → Environment Variables**).
3. Add your chosen AI key (`GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `GEMINI_API_KEY`), `CRON_SECRET`, `APP_URL`, and optional `VAPID_*` / `TURN_*` / `RESEND_API_KEY` variables.
4. [vercel.json](vercel.json) schedules `/api/cron` daily (`0 0 * * *`) for Vercel Hobby plan compatibility. Redeploy Production after adding or rotating any environment variable.

---

## Available npm Scripts

- `npm run build` — Minifies Tailwind CSS (`assets/app.css`) and bundles ES modules (`assets/app.js`).
- `npm run watch:js` — Rebuilds `assets/app.js` on changes.
- `npm run dev` — Starts `vercel dev` with static assets and serverless `/api/*` endpoints.
- `npm run check` / `npm test` — Validates JSON configs, checks Node syntax across all `api/*.js`, `lib/*.js`, `sw.js`, and `assets/app.js`, and verifies required build & export files exist.
