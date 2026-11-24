import { webhookCallback } from 'grammy';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createBot } from '../bot';
import type { AppEnv } from '../lib/env';

const webhookApp = new Hono<AppEnv>().post('/telegram', async (c) => {
  const token = c.env.TELEGRAM_BOT_TOKEN?.trim();
  const secretToken = c.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!token || !secretToken) {
    throw new HTTPException(500, {
      message: 'Telegram webhook is not configured',
    });
  }

  const bot = createBot(token);
  const handleUpdate = webhookCallback(bot, 'hono', {
    secretToken,
  });

  return handleUpdate(c);
});

export default webhookApp;
