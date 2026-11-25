# tcbot-hono

Edge-native Telegram federation moderation bot, public community portal (`/`), and auth-gated admin moderation ledger (`/admin`) running on **Cloudflare Workers**.

- **Production:** `https://tcbot-hono.tcbot.workers.dev`
- **Stack:** Bun · Hono v4 · grammY · Supabase Postgres · Cloudflare KV (`BOT_CACHE`) & Cache API · React 19 · Tailwind CSS v4 · shadcn/ui (Base UI)

## Routes

| Path | Description |
| --- | --- |
| `/` | Public dashboard (community stats, published rules, connected groups) |
| `/admin` | Admin login & Moderation Ledger (appeals, bans, warns, groups, rules, staff) |
| `POST /webhook/telegram` | Telegram Bot webhook (`X-Telegram-Bot-Api-Secret-Token` verified) |
| `GET /api/public/overview` | Edge-cached (`caches.default`, SWR) public stats, rules & groups |
| `/api/auth/*` | `GET /session`, `POST /login` (rate-limited + CSRF-checked), `POST /logout` |
| `/api/ledger/*` | Cookie-authenticated moderation APIs (single-RTT FK joins + keyset cursor) |
| `GET /api/health` | Health check (`?strict=true` verifies Supabase connectivity) |

## Setup & Commands

1. Install dependencies & configure `.dev.vars`:
   ```sh
   bun install
   ```
   Required `.dev.vars` keys: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OWNER_ID`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.

2. Common scripts:
   ```sh
   bun run dev           # Local Vite + Cloudflare Workers dev server
   bun run check         # Biome lint + format check
   bunx tsc --noEmit     # TypeScript typecheck
   bun test              # Run test suite
   bun run test:webhook  # Smoke-test local/remote webhook
   bun run bench         # In-process & live production benchmark
   bun run cf-typegen    # Regenerate worker-configuration.d.ts
   bun run deploy        # Build & deploy to Cloudflare Workers
   ```
