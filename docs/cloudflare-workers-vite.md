# Cloudflare Workers & Vite

Reference for running **Hono** on **Cloudflare Workers** with **`@cloudflare/vite-plugin`** and **`wrangler.jsonc`**.

## 1. Vite + Cloudflare Plugin (`vite.config.ts`)

`@cloudflare/vite-plugin` reads `wrangler.jsonc` automatically and runs your Worker in the same runtime locally during `vite` dev as in production:

```ts
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  plugins: [cloudflare(), ssrPlugin()],
})
```

## 2. `wrangler.jsonc` Configuration

For a Worker with SPA/frontend assets and observability enabled:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tcbot-hono",
  "compatibility_date": "2025-08-03",
  "main": "./src/index.tsx",
  "assets": {
    "not_found_handling": "single-page-application"
  },
  "observability": {
    "enabled": true
  }
}
```

- **Important with Vite:** Omit `assets.directory` when using `@cloudflare/vite-plugin`; `vite build` automatically generates the output `wrangler.json` pointing to the built client assets.
- If specific paths (e.g. `/api/*`, `/webhook/*`) must always hit the Worker before static assets, configure `"run_worker_first": ["/api/*", "/webhook/*"]`.
- Add `"compatibility_flags": ["nodejs_compat"]` only if a dependency requires Node.js built-in APIs.

## 3. Typed Bindings & Secrets (`CloudflareBindings`)

Run `cf-typegen` (`wrangler types --env-interface CloudflareBindings`) to generate `CloudflareBindings`, then pass it to Hono:

```ts
import { Hono } from 'hono'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.get('/api/health', (c) => {
  return c.json({ ok: true })
})
```

- **Secrets:** Store sensitive tokens (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY`) as Worker Secrets (`wrangler secret put ...`), never in `wrangler.jsonc` `vars`.
- Inside request handlers, access bindings via `c.env.<NAME>`. Outside request handlers (top-level), Cloudflare Workers also supports `import { env } from "cloudflare:workers"`.

## 4. Non-Blocking Background Work (`c.executionCtx.waitUntil`)

To keep bot responses fast and free-tier friendly, return a `Response` immediately and offload slow async work (logging, analytics, external API calls) with `waitUntil`:

```ts
app.post('/webhook/example', async (c) => {
  const payload = await c.req.json()

  c.executionCtx.waitUntil(
    fetch('https://log-service.example.com/', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  )

  return c.text('OK')
})
```

## 5. Free-Tier Edge Primitives for Speed

- **Cloudflare KV:** Ultra-fast edge reads for caching user settings, session state, or per-chat rate-limit counters without hitting an external Postgres database on every message.
- **Cloudflare D1:** Edge SQLite database when low-latency relational queries are needed at the edge.
- **Workers Observability:** Keep `"observability": { "enabled": true }` in `wrangler.jsonc` for built-in request logs and error visibility.
