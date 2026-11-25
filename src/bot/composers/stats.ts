import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';
import { getUserRole, isStaffRole } from '../db';
import { t } from '../i18n';
import { onCommand } from '../prefixes';
import { clearBotSession, getBotSession, setBotSession } from '../session';

export const statsComposer = new Composer<BotContext>();

async function buildStatsOverview(ctx: BotContext) {
  const isId = ctx.locale === 'id-ID';
  if (!ctx.supabase) {
    return {
      formatted: fmt`${b}📊 ${isId ? 'Statistik Federasi' : 'Federation Stats'}${b}\n${t(ctx.locale, 'err.db_unconfigured')}`,
      keyboard: new InlineKeyboard()
        .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
        .danger(),
    };
  }

  const [
    { count: usersCount },
    { count: chatsCount },
    { count: staffCount },
    { count: bansCount },
    { count: mutesCount },
    { count: appealsCount },
  ] = await Promise.all([
    ctx.supabase
      .from('telegram_users')
      .select('user_id', { count: 'exact', head: true }),
    ctx.supabase
      .from('connected_chats')
      .select('chat_id', { count: 'exact', head: true })
      .eq('is_active', true),
    ctx.supabase
      .from('role_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    ctx.supabase
      .from('moderation_actions')
      .select('id', { count: 'exact', head: true })
      .eq('action_type', 'ban')
      .eq('status', 'active'),
    ctx.supabase
      .from('moderation_actions')
      .select('id', { count: 'exact', head: true })
      .eq('action_type', 'mute')
      .eq('status', 'active'),
    ctx.supabase
      .from('moderation_appeals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const formatted = fmt`${b}📊 ${isId ? 'Statistik Federasi' : 'Federation Statistics'}${b}

• ${b}${isId ? 'Pengguna tercatat' : 'Known users'}:${b} ${code}${String(usersCount ?? 0)}${code}
• ${b}${isId ? 'Grup terhubung' : 'Connected groups'}:${b} ${code}${String(chatsCount ?? 0)}${code}
• ${b}${isId ? 'Staf aktif' : 'Active staff'}:${b} ${code}${String(staffCount ?? 0)}${code}
• ${b}${isId ? 'Ban aktif' : 'Active bans'}:${b} ${code}${String(bansCount ?? 0)}${code}
• ${b}${isId ? 'Bisu aktif' : 'Active mutes'}:${b} ${code}${String(mutesCount ?? 0)}${code}
• ${b}${isId ? 'Banding menunggu' : 'Pending appeals'}:${b} ${code}${String(appealsCount ?? 0)}${code}`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '🛡️ Staf' : '🛡️ Staff', 'stats:admins')
    .primary()
    .text(isId ? '👥 Grup' : '👥 Groups', 'stats:chats:1')
    .primary()
    .row()
    .text(isId ? '🔨 Daftar Ban' : '🔨 Bans', 'stats:bans:1')
    .primary()
    .text(isId ? '🔍 Cari Ban' : '🔍 Search Ban', 'stats:search')
    .primary()
    .row()
    .text(isId ? '↻ Segarkan' : '↻ Refresh', 'stats:main')
    .primary()
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  return { formatted, keyboard };
}

onCommand(statsComposer, ['tcstats', 'tcs'], async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const { formatted, keyboard } = await buildStatsOverview(ctx);
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

statsComposer.callbackQuery('stats:main', async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role)) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = await buildStatsOverview(ctx);
  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});

statsComposer.callbackQuery('stats:admins', async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role) || !ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }
  await ctx.answerCallbackQuery();

  const { data: rows } = await ctx.supabase
    .from('role_assignments')
    .select('user_id, role_key')
    .eq('status', 'active')
    .limit(20);

  const body =
    !rows || rows.length === 0
      ? isId
        ? 'Belum ada staf aktif.'
        : 'No active staff.'
      : rows.map((r, i) => `${i + 1}. ${r.user_id} — ${r.role_key}`).join('\n');

  const formatted = fmt`${b}🛡️ ${isId ? 'Staf Aktif' : 'Active Staff'}${b}\n\n${body}`;
  const kb = new InlineKeyboard()
    .text(isId ? '← Kembali' : '← Back', 'stats:main')
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: kb,
    })
    .catch(() => {});
});

statsComposer.callbackQuery(/^stats:(chats|bans):(\d+)$/, async (ctx) => {
  const kind = ctx.match[1] as 'chats' | 'bans';
  const page = Math.max(1, Number(ctx.match[2]));
  const isId = ctx.locale === 'id-ID';

  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role) || !ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }
  await ctx.answerCallbackQuery();

  const pageSize = 8;
  const from = (page - 1) * pageSize;
  let body = '';
  let total = 0;

  if (kind === 'chats') {
    const { data, count } = await ctx.supabase
      .from('connected_chats')
      .select('chat_id, added_at', { count: 'exact' })
      .eq('is_active', true)
      .order('added_at', { ascending: false })
      .range(from, from + pageSize - 1);
    total = count ?? 0;
    body =
      !data || data.length === 0
        ? isId
          ? 'Belum ada grup terhubung.'
          : 'No connected groups.'
        : data.map((c, i) => `${from + i + 1}. ${c.chat_id}`).join('\n');
  } else {
    const { data, count } = await ctx.supabase
      .from('moderation_actions')
      .select('external_ref, target_user_id, reason', { count: 'exact' })
      .eq('action_type', 'ban')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    total = count ?? 0;
    body =
      !data || data.length === 0
        ? isId
          ? 'Tidak ada ban aktif.'
          : 'No active bans.'
        : data
            .map(
              (bRow, i) =>
                `${from + i + 1}. ${bRow.external_ref} — ${bRow.target_user_id}\n   ${(bRow.reason ?? '-').slice(0, 50)}`,
            )
            .join('\n');
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const title =
    kind === 'chats'
      ? `👥 ${isId ? 'Grup Terhubung' : 'Connected Groups'} (${page}/${totalPages})`
      : `🔨 ${isId ? 'Ban Aktif' : 'Active Bans'} (${page}/${totalPages})`;

  const kb = new InlineKeyboard();
  if (page > 1) kb.text('◀️', `stats:${kind}:${page - 1}`).primary();
  if (page < totalPages) kb.text('▶️', `stats:${kind}:${page + 1}`).primary();
  if (page > 1 || page < totalPages) kb.row();
  kb.text(isId ? '← Kembali' : '← Back', 'stats:main')
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  const formatted = fmt`${b}${title}${b}\n\n${body}`;
  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: kb,
    })
    .catch(() => {});
});

statsComposer.callbackQuery('stats:search', async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role)) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }

  await setBotSession(ctx.appEnv, 'stats_search', ctx.from.id, {
    active: true,
  });
  await ctx.answerCallbackQuery();
  await ctx.reply(
    isId
      ? '🔍 Kirimkan User ID atau kode Ref Ban (misal BAN-1234) untuk mencari:'
      : '🔍 Send a User ID or Ban Ref (e.g. BAN-1234) to search:',
    {
      reply_markup: new InlineKeyboard().text(
        isId ? '❌ Batal' : '❌ Cancel',
        'stats:search:cancel',
      ),
    },
  );
});

statsComposer.callbackQuery('stats:search:cancel', async (ctx) => {
  await clearBotSession(ctx.appEnv, 'stats_search', ctx.from.id);
  const isId = ctx.locale === 'id-ID';
  await ctx.answerCallbackQuery({ text: isId ? 'Dibatalkan.' : 'Cancelled.' });
  await ctx
    .editMessageText(
      isId ? '❌ Pencarian dibatalkan.' : '❌ Search cancelled.',
      { reply_markup: new InlineKeyboard() },
    )
    .catch(() => {});
});

statsComposer.on('message:text', async (ctx, next) => {
  if (!ctx.from || /^[/!.]/.test(ctx.message.text.trim())) {
    await next();
    return;
  }
  const session = await getBotSession<{ active: boolean }>(
    ctx.appEnv,
    'stats_search',
    ctx.from.id,
  );
  if (!session) {
    await next();
    return;
  }

  await clearBotSession(ctx.appEnv, 'stats_search', ctx.from.id);
  const isId = ctx.locale === 'id-ID';
  const q = ctx.message.text.trim();
  if (!ctx.supabase) {
    await ctx.reply(t(ctx.locale, 'err.db_unconfigured'));
    return;
  }

  const numericId = /^\d+$/.test(q) ? Number(q) : null;
  let query = ctx.supabase
    .from('moderation_actions')
    .select('external_ref, target_user_id, action_type, status, reason')
    .limit(5);

  query = numericId
    ? query.eq('target_user_id', numericId)
    : query.ilike('external_ref', `%${q}%`);

  const { data } = await query;
  const body =
    !data || data.length === 0
      ? isId
        ? 'Tidak ada hasil yang cocok.'
        : 'No matching records found.'
      : data
          .map(
            (r) =>
              `• ${r.external_ref} [${r.action_type}/${r.status}] — ${r.target_user_id}\n  ${r.reason ?? '-'}`,
          )
          .join('\n');

  const formatted = fmt`${b}🔍 ${isId ? 'Hasil Pencarian' : 'Search Results'}${b}\n\n${body}`;
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: new InlineKeyboard().text(
      isId ? '📊 Statistik' : '📊 Stats',
      'stats:main',
    ),
  });
});
