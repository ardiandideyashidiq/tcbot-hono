import { autoRetry } from '@grammyjs/auto-retry';
import { Bot } from 'grammy';

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.api.config.use(autoRetry());

  bot.command('start', async (ctx) => {
    await ctx.reply('tcbot-hono is online.');
  });

  bot.command('ping', async (ctx) => {
    await ctx.reply('pong');
  });

  return bot;
}
