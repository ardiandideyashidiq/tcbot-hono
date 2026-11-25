import { webhookCallback } from 'grammy';
import { type Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createBot,
  runWithExecutionContext,
  type WaitUntilContext,
} from '../bot';
import type { AppEnv } from '../lib/env';

const MAX_CACHED_WEBHOOK_HANDLERS = 8;
const webhookHandlerCache = new Map<
  string,
  (c: Context<AppEnv>) => Promise<Response>
>();

function getWebhookHandler(env: CloudflareBindings, secretToken: string) {
  const cacheKey = `${env.TELEGRAM_BOT_TOKEN}\0${secretToken}\0${env.SUPABASE_URL ?? ''}\0${env.OWNER_ID ?? ''}`;
  const cached = webhookHandlerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const bot = createBot(env);
  const handler = webhookCallback(bot, 'hono', {
    secretToken,
  }) as unknown as (c: Context<AppEnv>) => Promise<Response>;

  if (webhookHandlerCache.size >= MAX_CACHED_WEBHOOK_HANDLERS) {
    const oldestKey = webhookHandlerCache.keys().next().value;
    if (oldestKey !== undefined) {
      webhookHandlerCache.delete(oldestKey);
    }
  }
  webhookHandlerCache.set(cacheKey, handler);
  return handler;
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

const webhookApp = new Hono<AppEnv>()
  .get('/info', (c) => {
    const hasToken = Boolean(c.env.TELEGRAM_BOT_TOKEN?.trim());
    const hasSecret = Boolean(c.env.TELEGRAM_WEBHOOK_SECRET?.trim());
    return c.json({
      configured: hasToken && hasSecret,
      path: '/webhook/telegram',
    });
  })
  .post('/telegram', async (c) => {
    const token = c.env.TELEGRAM_BOT_TOKEN?.trim();
    const secretToken = c.env.TELEGRAM_WEBHOOK_SECRET?.trim();

    if (!token || !secretToken) {
      throw new HTTPException(500, {
        message: 'Telegram webhook is not configured',
      });
    }

    const provided = c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? '';
    if (!constantTimeEqual(provided, secretToken)) {
      return c.text('Unauthorized', 401);
    }

    const handleUpdate = getWebhookHandler(c.env, secretToken);
    let execCtx: WaitUntilContext | undefined;
    try {
      execCtx = c.executionCtx;
    } catch {
      execCtx = undefined;
    }

    return runWithExecutionContext(execCtx, () => handleUpdate(c));
  });

export default webhookApp;
