import { autoRetry } from '@grammyjs/auto-retry';
import { Bot } from 'grammy';
import { hasSupabaseConfig } from '../lib/env';
import { createSupabaseAdmin } from '../lib/supabase';
import { appealsComposer } from './composers/appeals';
import { generalComposer } from './composers/general';
import { groupsComposer } from './composers/groups';
import { moderationComposer } from './composers/moderation';
import { rbacComposer } from './composers/rbac';
import { rulesComposer } from './composers/rules';
import type { BotContext } from './context';
import {
  ensureOwnerAssignment,
  resolveUserLocale,
  upsertTelegramChat,
  upsertTelegramUser,
} from './db';

export function createBot(env: CloudflareBindings): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN, {
    client: {
      fetch: ((url: string | URL | Request, init?: RequestInit) =>
        globalThis.fetch(url, init)) as never,
    },
  });

  bot.api.config.use(autoRetry());

  bot.use(async (ctx, next) => {
    const supabase = hasSupabaseConfig(env) ? createSupabaseAdmin(env) : null;
    ctx.appEnv = env;
    ctx.supabase = supabase;

    if (supabase) {
      await Promise.allSettled([
        ctx.from ? upsertTelegramUser(supabase, ctx.from) : Promise.resolve(),
        ctx.chat ? upsertTelegramChat(supabase, ctx.chat) : Promise.resolve(),
      ]);
      if (ctx.from) {
        await ensureOwnerAssignment(supabase, ctx.from.id, env.OWNER_ID).catch(
          () => {},
        );
      }
    }

    ctx.locale = await resolveUserLocale(
      supabase,
      ctx.from?.id,
      ctx.from?.language_code,
    );

    await next();
  });

  bot.use(generalComposer);
  bot.use(groupsComposer);
  bot.use(rbacComposer);
  bot.use(rulesComposer);
  bot.use(appealsComposer);
  bot.use(moderationComposer);

  bot.catch((err) => {
    console.error('Bot update error:', err.error);
  });

  return bot;
}
