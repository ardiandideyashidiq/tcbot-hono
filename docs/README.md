# tcbot-hono Documentation

Reference documentation for building a fast, responsive, free-tier **Telegram Bot + Web/Mini App** on **Cloudflare Workers**, **Hono**, **Vite**, **Supabase**, and **shadcn/ui**.

## Project Stack (`tcbot-hono`)

- **Runtime & Hosting:** Cloudflare Workers + `@cloudflare/vite-plugin` (`wrangler.jsonc` -> `main: ./src/index.tsx`)
- **Web Framework:** Hono (`^4.13.16`)
- **Build Tool:** Vite (`^8.1.4`)
- **Database & Auth:** Supabase (`@supabase/supabase-js`)
- **Telegram Bot Framework:** grammY (`webhookCallback(bot, 'hono')`)
- **UI & Styling:** shadcn/ui + Tailwind CSS + Modern Web Guidance

## Guides

1. [Hono Best Practices](./hono-best-practices.md) — Modular routing, RPC type inference, `hono/factory`, validation, error handling, and testing.
2. [Cloudflare Workers & Vite](./cloudflare-workers-vite.md) — `@cloudflare/vite-plugin`, `wrangler.jsonc`, `CloudflareBindings`, secrets, `executionCtx.waitUntil`, and edge performance.
3. [Telegram Bot & grammY on Workers](./telegram-bot-grammy.md) — `webhookCallback(bot, 'hono')`, secret token verification, `auto-retry`, `waitUntil` responsiveness, and Mini App `initData` verification.
4. [Supabase Best Practices](./supabase.md) — `Database` generics, v2 `.select()` mutations, server-side secret client, `@supabase/server` `toHono`, and RLS performance.
5. [Frontend: shadcn/ui & Modern Web Guidance](./frontend-shadcn-modern-web.md) — Tailwind v4 `oklch` theming, accessible `Field` forms with `react-hook-form` + `zod`, `components.json`, and Baseline web platform workflow.
6. [Legacy Python `tcbot` Specification](./legacy/README.md) — Complete behavioral, database, moderation, RBAC, helper, callback, and i18n specification of `./tcbot/` for migration parity.
