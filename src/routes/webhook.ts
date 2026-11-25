import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  createBot,
  runWithExecutionContext,
  type WaitUntilContext,
} from '../bot';
import type { BotContext } from '../bot/context';
import type { AppEnv } from '../lib/env';

const MAX_CACHED_BOTS = 8;
const botCache = new Map<string, Bot<BotContext>>();

function getBot(env: CloudflareBindings): Bot<BotContext> {
  const cacheKey = `${env.TELEGRAM_BOT_TOKEN}\0${env.SUPABASE_URL ?? ''}\0${env.OWNER_ID ?? ''}`;
  const cached = botCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const bot = createBot(env);
  if (botCache.size >= MAX_CACHED_BOTS) {
    const oldestKey = botCache.keys().next().value;
    if (oldestKey !== undefined) {
      botCache.delete(oldestKey);
    }
  }
  botCache.set(cacheKey, bot);
  return bot;
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

    let update: Update;
    try {
      update = (await c.req.json()) as Update;
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON payload' }, 400);
    }
    if (
      !update ||
      typeof update !== 'object' ||
      typeof update.update_id !== 'number'
    ) {
      return c.json({ ok: false, error: 'Invalid Telegram update' }, 400);
    }

    const bot = getBot(c.env);
    let execCtx: WaitUntilContext | undefined;
    try {
      execCtx = c.executionCtx;
    } catch {
      execCtx = undefined;
    }

    const runUpdate = async () => {
      if (!bot.isInited()) {
        await bot.init();
      }
      await bot.handleUpdate(update);
    };

    if (execCtx) {
      execCtx.waitUntil(
        runWithExecutionContext(execCtx, runUpdate).catch((err) => {
          console.error('Webhook background update error:', err);
        }),
      );
      return c.text('OK', 200);
    }

    await runWithExecutionContext(undefined, runUpdate);
    return c.text('OK', 200);
  });

export default webhookApp;
