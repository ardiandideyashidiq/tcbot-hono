import { Composer } from 'grammy';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner } from '../db';
import { t } from '../i18n';

export const groupsComposer = new Composer<BotContext>();

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
  await ctx.reply(t(ctx.locale, 'group.connected', { title }));
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

  await ctx.reply(t(ctx.locale, 'group.disconnected'));
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

  if (!ctx.supabase) {
    await ctx.reply(t(ctx.locale, 'group.none'));
    return;
  }

  const { data: connected } = await ctx.supabase
    .from('connected_chats')
    .select('chat_id')
    .eq('is_active', true);

  const ids = (connected ?? []).map((g) => g.chat_id);
  if (ids.length === 0) {
    await ctx.reply(t(ctx.locale, 'group.none'));
    return;
  }

  const { data: chats } = await ctx.supabase
    .from('telegram_chats')
    .select('chat_id, title')
    .in('chat_id', ids);

  const titleMap = new Map((chats ?? []).map((c) => [c.chat_id, c.title]));
  const lines = ids.map((id) => `- ${titleMap.get(id) ?? id} (${id})`);
  await ctx.reply(lines.join('\n'));
});
