import { AsyncLocalStorage } from 'node:async_hooks';
import { autoRetry } from '@grammyjs/auto-retry';
import { Bot } from 'grammy';
import { hasSupabaseConfig } from '../lib/env';
import { createSupabaseAdmin } from '../lib/supabase';
import { appealsComposer } from './composers/appeals';
import { generalComposer } from './composers/general';
import { groupsComposer } from './composers/groups';
import { maintenanceComposer } from './composers/maintenance';
import { moderationComposer } from './composers/moderation';
import { rbacComposer } from './composers/rbac';
import { rulesComposer } from './composers/rules';
import { statsComposer } from './composers/stats';
import type { BotContext } from './context';
import {
  ensureOwnerAssignment,
  resolveUserLocale,
  upsertTelegramChat,
  upsertTelegramUser,
} from './db';

export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

const executionCtxStorage = new AsyncLocalStorage<WaitUntilContext>();

export function runWithExecutionContext<T>(
  execCtx: WaitUntilContext | undefined,
  fn: () => T,
): T {
  if (!execCtx) {
    return fn();
  }
  return executionCtxStorage.run(execCtx, fn);
}

function scheduleBackgroundTask(promise: Promise<unknown>): void {
  const execCtx = executionCtxStorage.getStore();
  const safePromise = promise.catch((err) => {
    console.error('Bot background task error:', err);
  });
  if (execCtx) {
    execCtx.waitUntil(safePromise);
  }
}

export function createBot(env: CloudflareBindings): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN, {
    client: {
      fetch: ((url: string | URL | Request, init?: RequestInit) =>
        globalThis.fetch(url, init)) as never,
    },
  });

  bot.api.config.use(autoRetry());

  const envOwnerId = Number(env.OWNER_ID);
  const hasOwnerId = Number.isFinite(envOwnerId) && envOwnerId > 0;

  bot.use(async (ctx, next) => {
    const supabase = hasSupabaseConfig(env) ? createSupabaseAdmin(env) : null;
    ctx.appEnv = env;
    ctx.supabase = supabase;

    if (supabase) {
      const bookkeeping: Promise<unknown>[] = [];
      if (ctx.from) {
        bookkeeping.push(upsertTelegramUser(supabase, ctx.from));
      }
      if (ctx.chat) {
        bookkeeping.push(upsertTelegramChat(supabase, ctx.chat));
      }
      if (hasOwnerId && ctx.from?.id === envOwnerId) {
        bookkeeping.push(
          ensureOwnerAssignment(supabase, ctx.from.id, env.OWNER_ID),
        );
      }
      if (bookkeeping.length > 0) {
        scheduleBackgroundTask(Promise.allSettled(bookkeeping));
      }
    }

    ctx.locale = await resolveUserLocale(
      supabase,
      ctx.from?.id,
      ctx.from?.language_code,
      env.BOT_CACHE,
    );

    await next();
  });

  // Appeals must run before generalComposer so `/start appeal_<ref>` deep links
  // are intercepted before the generic `/start` handler.
  bot.use(appealsComposer);
  bot.use(generalComposer);
  bot.use(groupsComposer);
  bot.use(rbacComposer);
  bot.use(rulesComposer);
  bot.use(maintenanceComposer);
  bot.use(statsComposer);
  bot.use(moderationComposer);

  bot.catch((err) => {
    console.error('Bot update error:', err.error);
  });

  return bot;
}
