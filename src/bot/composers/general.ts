import { b, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner, setCachedUserLocale } from '../db';
import { t } from '../i18n';
import {
  buildHelpCard,
  buildLanguageCard,
  buildPingCard,
  buildStartCard,
} from '../ui';

export const generalComposer = new Composer<BotContext>();

generalComposer.command('start', async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  const { formatted, keyboard } = buildStartCard(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
    ctx.from?.first_name,
    isAdminOrOwner(role),
  );
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.command('help', async (ctx) => {
  const { formatted, keyboard } = buildHelpCard(ctx.locale);
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.command('ping', async (ctx) => {
  const started = Date.now();
  const initial = buildPingCard(ctx.locale);
  const msg = await ctx.reply(initial.formatted.text, {
    entities: initial.formatted.entities,
  });
  const elapsed = Date.now() - started;
  const updated = buildPingCard(ctx.locale, elapsed);
  await ctx.api
    .editMessageText(ctx.chat.id, msg.message_id, updated.formatted.text, {
      entities: updated.formatted.entities,
      reply_markup: updated.keyboard,
    })
    .catch(() => {});
});

generalComposer.command(['language', 'lang'], async (ctx) => {
  const { formatted, keyboard } = buildLanguageCard(ctx.locale);
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

function buildPrivacyContent(locale: string) {
  const isId = locale === 'id-ID';
  const formatted = fmt`${b}${isId ? '🔒 Kebijakan Privasi Bot' : '🔒 Bot Privacy Policy'}${b}
${
  isId
    ? 'Bot ini menyimpan data minimal untuk menjalankan moderasi lintas grup: ID Telegram, nama tampilan, username, preferensi bahasa, catatan sanksi/peringatan, serta banding yang Anda kirimkan.'
    : 'This bot stores minimal data required for cross-group moderation: Telegram user ID, display name, username, language preference, moderation/warning history, and appeals you submit.'
}`;
  const keyboard = new InlineKeyboard()
    .text(isId ? '🏠 Menu Utama' : '🏠 Main Menu', 'nav:start')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');
  return { formatted, keyboard };
}

function buildAboutContent(locale: string, communityName: string) {
  const isId = locale === 'id-ID';
  const formatted = fmt`${b}${isId ? `ℹ️ Tentang ${communityName}` : `ℹ️ About ${communityName}`}${b}
${
  isId
    ? 'Bot moderasi federasi berbasis Cloudflare Workers, Hono, grammY, dan Supabase untuk menjaga tata tertib komunitas secara konsisten.'
    : 'A federation moderation bot built on Cloudflare Workers, Hono, grammY, and Supabase to enforce community rules consistently.'
}`;
  const keyboard = new InlineKeyboard()
    .text(isId ? '📜 Aturan' : '📜 Rules', 'nav:help')
    .text(isId ? '🔒 Privasi' : '🔒 Privacy', 'nav:privacy')
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');
  return { formatted, keyboard };
}

generalComposer.command('privacy', async (ctx) => {
  const { formatted, keyboard } = buildPrivacyContent(ctx.locale);
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.command('about', async (ctx) => {
  const { formatted, keyboard } = buildAboutContent(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
  );
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:privacy', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildPrivacyContent(ctx.locale);
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:about', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildAboutContent(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
  );
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:start', async (ctx) => {
  await ctx.answerCallbackQuery();
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  const { formatted, keyboard } = buildStartCard(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
    ctx.from.first_name,
    isAdminOrOwner(role),
  );
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:help', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildHelpCard(ctx.locale);
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:ping', async (ctx) => {
  const started = Date.now();
  await ctx.answerCallbackQuery();
  const elapsed = Math.max(1, Date.now() - started);
  const { formatted, keyboard } = buildPingCard(ctx.locale, elapsed);
  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});

generalComposer.callbackQuery('nav:lang', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildLanguageCard(ctx.locale);
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:close', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
});

generalComposer.callbackQuery(/^lang:set:(en-US|id-ID)$/, async (ctx) => {
  const nextLocale = ctx.match[1] as 'en-US' | 'id-ID';
  await ctx.answerCallbackQuery({
    text: t(nextLocale, 'lang.updated', { locale: nextLocale }),
  });

  if (ctx.supabase && ctx.from) {
    setCachedUserLocale(ctx.from.id, nextLocale);
    if (ctx.appEnv.BOT_CACHE) {
      void ctx.appEnv.BOT_CACHE.put(`locale:${ctx.from.id}`, nextLocale, {
        expirationTtl: 3600,
      }).catch(() => {});
    }
    await ctx.supabase.from('user_settings').upsert(
      {
        user_id: ctx.from.id,
        locale: nextLocale,
      },
      { onConflict: 'user_id' },
    );
  }

  const { formatted, keyboard } = buildLanguageCard(nextLocale);
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});
