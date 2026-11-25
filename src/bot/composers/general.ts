import { Composer } from 'grammy';
import type { BotContext } from '../context';
import { t } from '../i18n';
import { buildHelpCard, buildLanguageCard, buildStartCard } from '../ui';

export const generalComposer = new Composer<BotContext>();

generalComposer.command('start', async (ctx) => {
  const { formatted, keyboard } = buildStartCard(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
    ctx.from?.first_name,
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
  const msg = await ctx.reply('pong');
  const elapsed = Date.now() - started;
  await ctx.api
    .editMessageText(ctx.chat.id, msg.message_id, `pong (${elapsed}ms)`)
    .catch(() => {});
});

generalComposer.command(['language', 'lang'], async (ctx) => {
  const { formatted, keyboard } = buildLanguageCard(ctx.locale);
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:start', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildStartCard(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
    ctx.from?.first_name,
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
    await ctx.supabase.from('user_settings').upsert(
      {
        user_id: ctx.from.id,
        locale: nextLocale,
      },
      { onConflict: 'user_id' },
    );
  }

  const { keyboard } = buildLanguageCard(nextLocale);
  await ctx.editMessageText(
    t(nextLocale, 'lang.updated', { locale: nextLocale }),
    { reply_markup: keyboard },
  );
});
