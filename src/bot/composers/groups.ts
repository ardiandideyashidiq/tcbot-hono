import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner } from '../db';
import { t } from '../i18n';
import { buildGroupsCard } from '../ui';

export const groupsComposer = new Composer<BotContext>();

async function loadConnectedGroups(
  ctx: BotContext,
): Promise<Array<{ chatId: number; title: string }>> {
  if (!ctx.supabase) return [];

  const { data: connected } = await ctx.supabase
    .from('connected_chats')
    .select('chat_id')
    .eq('is_active', true);

  const ids = (connected ?? []).map((g) => g.chat_id);
  if (ids.length === 0) return [];

  const { data: chats } = await ctx.supabase
    .from('telegram_chats')
    .select('chat_id, title')
    .in('chat_id', ids);

  const titleMap = new Map((chats ?? []).map((c) => [c.chat_id, c.title]));
  return ids.map((id) => ({
    chatId: id,
    title: titleMap.get(id) ?? String(id),
  }));
}

groupsComposer.command(['tcconnect', 'tccon'], async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }

  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  if (ctx.supabase) {
    await ctx.supabase.from('connected_chats').upsert(
      {
        chat_id: ctx.chat.id,
        added_by_user_id: ctx.from?.id ?? null,
        is_active: true,
      },
      { onConflict: 'chat_id' },
    );
  }

  const chatId = ctx.chat.id;
  const title =
    'title' in ctx.chat && ctx.chat.title ? ctx.chat.title : String(chatId);

  const formatted = fmt`${b}${t(ctx.locale, 'group.connected', { title })}${b}
Chat ID: ${code}${String(chatId)}${code}`;

  const keyboard = new InlineKeyboard()
    .text(
      ctx.locale === 'id-ID' ? '👥 Lihat Grup' : '👥 View Groups',
      'nav:groups',
    )
    .text(ctx.locale === 'id-ID' ? '✖ Tutup' : '✖ Close', 'nav:close');

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

groupsComposer.command(['tcdisconnect', 'tcdiscon'], async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }

  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  if (ctx.supabase) {
    await ctx.supabase
      .from('connected_chats')
      .update({ is_active: false })
      .eq('chat_id', ctx.chat.id);
  }

  const keyboard = new InlineKeyboard()
    .text(
      ctx.locale === 'id-ID' ? '👥 Lihat Grup' : '👥 View Groups',
      'nav:groups',
    )
    .text(ctx.locale === 'id-ID' ? '✖ Tutup' : '✖ Close', 'nav:close');

  await ctx.reply(t(ctx.locale, 'group.disconnected'), {
    reply_markup: keyboard,
  });
});

groupsComposer.command(['tcgroups', 'tcg'], async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  const groups = await loadConnectedGroups(ctx);
  const { formatted, keyboard } = buildGroupsCard(ctx.locale, groups);

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

groupsComposer.callbackQuery('nav:groups', async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.admin_only'),
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  const groups = await loadConnectedGroups(ctx);
  const { formatted, keyboard } = buildGroupsCard(ctx.locale, groups);

  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});
