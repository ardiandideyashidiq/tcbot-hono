import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createBot } from '../bot';
import type { AppEnv } from '../lib/env';

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

    const bot = createBot(c.env);
    const handleUpdate = webhookCallback(bot, 'hono', {
      secretToken,
    });

    return handleUpdate(c);
  });

export default webhookApp;
