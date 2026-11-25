import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner, recordAuditEvent } from '../db';
import { t } from '../i18n';
import { getCommandArgs, onCommand } from '../prefixes';
import { buildGroupsCard } from '../ui';

export const groupsComposer = new Composer<BotContext>();

interface ConnectedGroupInfo {
  chatId: number;
  title: string;
  username: string | null;
  connectedAt: string | null;
}

async function loadConnectedGroups(
  ctx: BotContext,
): Promise<ConnectedGroupInfo[]> {
  if (!ctx.supabase) return [];

  const { data: connected } = await ctx.supabase
    .from('connected_chats')
    .select('chat_id, added_at')
    .eq('is_active', true);

  const rows = connected ?? [];
  const ids = rows.map((g) => g.chat_id);
  if (ids.length === 0) return [];

  const { data: chats } = await ctx.supabase
    .from('telegram_chats')
    .select('chat_id, title, username')
    .in('chat_id', ids);

  const chatMap = new Map((chats ?? []).map((c) => [c.chat_id, c]));
  return rows.map((r) => {
    const info = chatMap.get(r.chat_id);
    return {
      chatId: r.chat_id,
      title: info?.title ?? String(r.chat_id),
      username: info?.username ?? null,
      connectedAt: r.added_at ?? null,
    };
  });
}

function buildDetailedGroupsCard(locale: string, groups: ConnectedGroupInfo[]) {
  const isId = locale === 'id-ID';
  const body =
    groups.length === 0
      ? isId
        ? 'Belum ada grup aktif yang terhubung.'
        : 'No active connected groups yet.'
      : groups
          .map((g, idx) => {
            const uname = g.username ? ` (@${g.username})` : '';
            const date = g.connectedAt
              ? ` • ${g.connectedAt.slice(0, 10)}`
              : '';
            return `${idx + 1}. ${g.title}${uname}\n   ID: ${g.chatId}${date}`;
          })
          .join('\n');

  const formatted = fmt`${b}${isId ? '👥 Detail Grup Terhubung' : '👥 Connected Groups (Detailed)'}${b} (${code}${String(groups.length)}${code})\n\n${body}`;
  const keyboard = new InlineKeyboard()
    .text(isId ? '📋 Ringkas' : '📋 Simple', 'groups:simple')
    .text(isId ? '🏠 Menu' : '🏠 Menu', 'nav:start')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');
  return { formatted, keyboard };
}

onCommand(groupsComposer, ['tcconnect', 'tccon'], async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }

  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  // Verify bot's own admin & restrict_members capability when bot ID is known
  const isId = ctx.locale === 'id-ID';
  if (ctx.me?.id) {
    try {
      const botMember = await ctx.api.getChatMember(ctx.chat.id, ctx.me.id);
      if (
        botMember &&
        typeof botMember.status === 'string' &&
        botMember.status !== 'administrator' &&
        botMember.status !== 'creator'
      ) {
        await ctx.reply(
          isId
            ? 'Bot harus menjadi admin di grup ini sebelum dapat dihubungkan.'
            : 'The bot must be an administrator in this group before connecting.',
        );
        return;
      }
      if (
        botMember?.status === 'administrator' &&
        botMember.can_restrict_members === false
      ) {
        await ctx.reply(
          isId
            ? 'Bot memerlukan izin "Ban Users / Restrict Members" untuk menghubungkan grup.'
            : 'The bot requires the "Ban Users / Restrict Members" permission to connect.',
        );
        return;
      }
    } catch {
      // Allow connection when Telegram API probe is unavailable (e.g. unit tests)
    }
  }

  if (ctx.supabase) {
    await ctx.supabase.from('connected_chats').upsert(
      {
        chat_id: ctx.chat.id,
        added_by_user_id: ctx.from?.id ?? null,
        is_active: true,
        added_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id' },
    );

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'group.connected',
      entityType: 'connected_chat',
      entityId: String(ctx.chat.id),
      actorUserId: actorId,
      chatId: ctx.chat.id,
    });
  }

  const chatId = ctx.chat.id;
  const title =
    'title' in ctx.chat && ctx.chat.title ? ctx.chat.title : String(chatId);

  const formatted = fmt`${b}${t(ctx.locale, 'group.connected', { title })}${b}
Chat ID: ${code}${String(chatId)}${code}`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '👥 Lihat Grup' : '👥 View Groups', 'nav:groups')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(groupsComposer, ['tcdisconnect', 'tcdiscon'], async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }

  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  if (ctx.supabase) {
    await ctx.supabase
      .from('connected_chats')
      .update({
        is_active: false,
      })
      .eq('chat_id', ctx.chat.id);

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'group.disconnected',
      entityType: 'connected_chat',
      entityId: String(ctx.chat.id),
      actorUserId: actorId,
      chatId: ctx.chat.id,
    });
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

onCommand(groupsComposer, ['rmtc'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  const rawId = getCommandArgs(ctx).split(/\s+/)[0];
  const targetChatId = Number(rawId);
  if (!rawId || !Number.isFinite(targetChatId)) {
    await ctx.reply(
      isId ? 'Format: /rmtc <chat_id>' : 'Usage: /rmtc <chat_id>',
    );
    return;
  }

  if (ctx.supabase) {
    await ctx.supabase
      .from('connected_chats')
      .update({
        is_active: false,
      })
      .eq('chat_id', targetChatId);

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'group.disconnected',
      entityType: 'connected_chat',
      entityId: String(targetChatId),
      actorUserId: actorId,
      chatId: targetChatId,
      payload: { via: 'rmtc' },
    });
  }

  const formatted = fmt`${b}${t(ctx.locale, 'group.disconnected')}${b}
Chat ID: ${code}${String(targetChatId)}${code}`;
  await ctx.reply(formatted.text, { entities: formatted.entities });
});

onCommand(groupsComposer, ['tcgroups', 'tcg'], async (ctx) => {
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
  keyboard
    .row()
    .text(
      ctx.locale === 'id-ID' ? '🔍 Detail' : '🔍 Details',
      'groups:details',
    );

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(groupsComposer, ['broadcast', 'tcbroadcast', 'bc'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  const messageText = getCommandArgs(ctx).trim();
  if (messageText.length < 3) {
    const usage = fmt`${b}${isId ? 'Cara Menggunakan Broadcast' : 'How to Broadcast'}${b}
Format: /tcbroadcast ${code}<pesan pengumuman>${code}`;
    await ctx.reply(usage.text, { entities: usage.entities });
    return;
  }

  const groups = await loadConnectedGroups(ctx);
  if (groups.length === 0) {
    await ctx.reply(
      isId
        ? 'Belum ada grup aktif yang terhubung untuk menerima broadcast.'
        : 'No active connected groups available to broadcast to.',
    );
    return;
  }

  let campaignId: number | null = null;
  const nowIso = new Date().toISOString();
  if (ctx.supabase) {
    const { data: campaign } = await ctx.supabase
      .from('broadcast_campaigns')
      .insert({
        requested_by_user_id: actorId || null,
        message_text: messageText,
        status: 'running',
        target_count: groups.length,
        started_at: nowIso,
      })
      .select('id')
      .single();
    campaignId = campaign?.id ?? null;
  }

  const broadcastFormatted = fmt`${b}📢 ${
    isId ? 'Pengumuman Komunitas' : 'Community Announcement'
  }${b}

${messageText}`;

  const results = await Promise.allSettled(
    groups.map((g) =>
      ctx.api.sendMessage(g.chatId, broadcastFormatted.text, {
        entities: broadcastFormatted.entities,
      }),
    ),
  );

  let sentCount = 0;
  let failedCount = 0;
  const targetInserts: Array<{
    campaign_id: number;
    chat_id: number;
    status: string;
    attempt_count: number;
    last_attempt_at: string;
    completed_at: string | null;
    last_error_detail: string | null;
  }> = [];

  results.forEach((r, idx) => {
    const g = groups[idx];
    if (r.status === 'fulfilled') {
      sentCount += 1;
      if (campaignId !== null) {
        targetInserts.push({
          campaign_id: campaignId,
          chat_id: g.chatId,
          status: 'succeeded',
          attempt_count: 1,
          last_attempt_at: nowIso,
          completed_at: nowIso,
          last_error_detail: null,
        });
      }
    } else {
      failedCount += 1;
      const errMsg =
        r.reason instanceof Error ? r.reason.message : String(r.reason ?? '');
      if (campaignId !== null) {
        targetInserts.push({
          campaign_id: campaignId,
          chat_id: g.chatId,
          status: 'failed',
          attempt_count: 1,
          last_attempt_at: nowIso,
          completed_at: null,
          last_error_detail: errMsg.slice(0, 500),
        });
      }
    }
  });

  if (ctx.supabase && campaignId !== null) {
    if (targetInserts.length > 0) {
      await ctx.supabase.from('broadcast_targets').insert(targetInserts);
    }
    await ctx.supabase
      .from('broadcast_campaigns')
      .update({
        status: failedCount === groups.length ? 'failed' : 'completed',
        finished_at: new Date().toISOString(),
        succeeded_count: sentCount,
        failed_count: failedCount,
      })
      .eq('id', campaignId);

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'broadcast.sent',
      entityType: 'broadcast_campaign',
      entityId: String(campaignId),
      actorUserId: actorId,
      payload: { sentCount, failedCount },
    });
  }

  const summary = fmt`${b}${
    isId ? '📢 Broadcast Selesai' : '📢 Broadcast Complete'
  }${b}
${b}${isId ? 'Terkirim' : 'Delivered'}:${b} ${code}${String(sentCount)}${code}
${b}${isId ? 'Gagal' : 'Failed'}:${b} ${code}${String(failedCount)}${code}`;

  await ctx.reply(summary.text, { entities: summary.entities });
});

groupsComposer.callbackQuery(
  /^(nav:groups|groups:simple|groups:details)$/,
  async (ctx) => {
    const mode = ctx.match[1];
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

    if (mode === 'groups:details') {
      const { formatted, keyboard } = buildDetailedGroupsCard(
        ctx.locale,
        groups,
      );
      await ctx
        .editMessageText(formatted.text, {
          entities: formatted.entities,
          reply_markup: keyboard,
        })
        .catch(() => {});
      return;
    }

    const { formatted, keyboard } = buildGroupsCard(ctx.locale, groups);
    keyboard
      .row()
      .text(
        ctx.locale === 'id-ID' ? '🔍 Detail' : '🔍 Details',
        'groups:details',
      );

    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  },
);
