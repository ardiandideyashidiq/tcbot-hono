import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';
import { t } from '../i18n';

export const generalComposer = new Composer<BotContext>();

generalComposer.command('start', async (ctx) => {
  await ctx.reply(t(ctx.locale, 'start.welcome'));
});

generalComposer.command('help', async (ctx) => {
  await ctx.reply(t(ctx.locale, 'help.text'));
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
  const keyboard = new InlineKeyboard()
    .text('English (en-US)', 'lang:set:en-US')
    .text('Indonesia (id-ID)', 'lang:set:id-ID');

  await ctx.reply(t(ctx.locale, 'lang.prompt'), { reply_markup: keyboard });
});

generalComposer.callbackQuery(/^lang:set:(en-US|id-ID)$/, async (ctx) => {
  const nextLocale = ctx.match[1] as 'en-US' | 'id-ID';
  await ctx.answerCallbackQuery();

  if (ctx.supabase && ctx.from) {
    await ctx.supabase.from('user_settings').upsert(
      {
        user_id: ctx.from.id,
        locale: nextLocale,
      },
      { onConflict: 'user_id' },
    );
  }

  await ctx.editMessageText(
    t(nextLocale, 'lang.updated', { locale: nextLocale }),
  );
});
