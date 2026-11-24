# Telegram Bot & grammY on Cloudflare Workers + Hono

Patterns for building a fast, reliable, free-tier **Telegram Bot** using **Hono** and **grammY** on Cloudflare Workers.

## 1. Webhook Handler with `webhookCallback(bot, 'hono')`

grammY provides a built-in `'hono'` adapter for `webhookCallback`. Never call `bot.start()` (long polling) inside a Cloudflare Worker—always use webhooks.

```ts
import { Hono } from 'hono'
import { Bot, webhookCallback } from 'grammy'
import { autoRetry } from '@grammyjs/auto-retry'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.post('/webhook/telegram', async (c) => {
  const bot = new Bot(c.env.TELEGRAM_BOT_TOKEN)

  // Automatically retry Telegram API 429/5xx errors
  bot.api.config.use(autoRetry())

  bot.command('start', (ctx) => ctx.reply('Bot is live on Cloudflare Workers!'))

  const handleUpdate = webhookCallback(bot, 'hono', {
    secretToken: c.env.TELEGRAM_WEBHOOK_SECRET,
  })

  return handleUpdate(c)
})
```

### Registering the Webhook
Set the webhook URL and `secret_token` once (e.g. via a setup script or `bot.api.setWebhook`):

```ts
await bot.api.setWebhook('https://<your-worker-domain>/webhook/telegram', {
  secret_token: env.TELEGRAM_WEBHOOK_SECRET,
})
```

Telegram will include `X-Telegram-Bot-Api-Secret-Token` on every webhook request, and `webhookCallback` validates it when `secretToken` is provided.

## 2. Responsiveness & Avoiding Telegram Retries

Telegram expects a fast `200 OK` response to webhooks; slow responses cause Telegram to retry and deliver duplicate updates.

- **Callback Queries:** Always call `await ctx.answerCallbackQuery()` early on inline button presses to dismiss the client loading spinner immediately.
- **Heavy Tasks:** For slow work (AI inference, media processing, external scraping), acknowledge the webhook quickly or defer non-critical follow-ups using `c.executionCtx.waitUntil(...)`.
- **Rate Limits:** Use `@grammyjs/auto-retry` on `bot.api.config` so transient `429 Too Many Requests` responses are retried cleanly.

## 3. Securing Telegram Mini App APIs (`initData`)

If your Vite + shadcn/ui frontend runs as a **Telegram Mini App**, validate `initData` on every `/api/*` request in Hono middleware using Web Crypto (`crypto.subtle`):

1. Read `initData` from the `Authorization` header (e.g. `tma <rawInitData>`).
2. Parse query parameters, extract `hash`, sort the remaining `key=value` pairs alphabetically joined by `\n` (`data_check_string`).
3. Derive `secret_key = HMAC-SHA256("WebAppData", TELEGRAM_BOT_TOKEN)`.
4. Compute `HMAC-SHA256(secret_key, data_check_string)` and verify it matches `hash` (and check `auth_date` freshness).
