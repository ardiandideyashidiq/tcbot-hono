import { Composer } from 'grammy';
import type { BotContext } from '../context';
import {
  getActiveConnectedChatIds,
  getUserRole,
  isStaffRole,
  parseDurationSeconds,
  resolveTargetUser,
} from '../db';
import { t } from '../i18n';
import {
  buildCheckCard,
  buildModerationActionCard,
  buildModerationRevokedCard,
} from '../ui';

export const moderationComposer = new Composer<BotContext>();

async function ensureTargetPlaceholderUser(
  ctx: BotContext,
  userId: number,
): Promise<void> {
  if (!ctx.supabase) return;
  await ctx.supabase
    .from('telegram_users')
    .upsert(
      { user_id: userId },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
}

async function fetchUserModerationSnapshot(
  ctx: BotContext,
  targetId: number,
): Promise<{ banRef: string | null; muteRef: string | null; warns: number }> {
  if (!ctx.supabase || !targetId) {
    return { banRef: null, muteRef: null, warns: 0 };
  }

  const [{ data: ban }, { data: mute }, { count: warnCount }] =
    await Promise.all([
      ctx.supabase
        .from('moderation_actions')
        .select('external_ref')
        .eq('target_user_id', targetId)
        .eq('action_type', 'ban')
        .eq('status', 'active')
        .maybeSingle(),
      ctx.supabase
        .from('moderation_actions')
        .select('external_ref')
        .eq('target_user_id', targetId)
        .eq('action_type', 'mute')
        .eq('status', 'active')
        .maybeSingle(),
      ctx.supabase
        .from('moderation_actions')
        .select('id', { count: 'exact', head: true })
        .eq('target_user_id', targetId)
        .eq('action_type', 'warn')
        .eq('status', 'completed'),
    ]);

  return {
    banRef: ban?.external_ref ?? null,
    muteRef: mute?.external_ref ?? null,
    warns: warnCount ?? 0,
  };
}

moderationComposer.command(['tcban', 'tcb'], async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    ctx.match ?? '',
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === ctx.from?.id) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const durationSeconds = parseDurationSeconds(target.remainingArgs[0]);
  const reasonParts = durationSeconds
    ? target.remainingArgs.slice(1)
    : target.remainingArgs;
  const reason = reasonParts.join(' ').trim() || 'Federation ban';
  const expiresAt = durationSeconds
    ? new Date(Date.now() + durationSeconds * 1000).toISOString()
    : null;

  let ref = 'local';
  let affectedGroups = 0;

  if (ctx.supabase) {
    await ensureTargetPlaceholderUser(ctx, target.userId);
    const chatIds = await getActiveConnectedChatIds(ctx.supabase);

    const { data: created } = await ctx.supabase
      .from('moderation_actions')
      .insert({
        chat_id: ctx.chat.id,
        origin_chat_id: ctx.chat.id,
        action_type: 'ban',
        target_user_id: target.userId,
        actor_user_id: ctx.from?.id ?? null,
        reason,
        duration_seconds: durationSeconds,
        expires_at: expiresAt,
        status: 'active',
        scope_type: 'community',
      })
      .select('external_ref')
      .single();

    if (created?.external_ref) {
      ref = created.external_ref;
    }

    const targets = chatIds.length > 0 ? chatIds : [ctx.chat.id];
    const results = await Promise.allSettled(
      targets.map((cid) =>
        ctx.api.banChatMember(cid, target.userId, {
          until_date: expiresAt
            ? Math.floor(new Date(expiresAt).getTime() / 1000)
            : undefined,
        }),
      ),
    );
    affectedGroups = results.filter((r) => r.status === 'fulfilled').length;
  }

  const { formatted, keyboard } = buildModerationActionCard({
    locale: ctx.locale,
    title: ctx.locale === 'id-ID' ? '🔨 Ban Federasi' : '🔨 Federation Ban',
    targetLabel: target.label,
    targetId: target.userId,
    count: affectedGroups,
    reason,
    ref,
    actionType: 'ban',
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.command(['tcunban', 'tcunb'], async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    ctx.match ?? '',
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }

  let affectedGroups = 0;
  if (ctx.supabase) {
    await ctx.supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: ctx.from?.id ?? null,
      })
      .eq('target_user_id', target.userId)
      .eq('action_type', 'ban')
      .eq('status', 'active');

    const chatIds = await getActiveConnectedChatIds(ctx.supabase);
    const targets = chatIds.length > 0 ? chatIds : [ctx.chat.id];
    const results = await Promise.allSettled(
      targets.map((cid) =>
        ctx.api.unbanChatMember(cid, target.userId, { only_if_banned: true }),
      ),
    );
    affectedGroups = results.filter((r) => r.status === 'fulfilled').length;
  }

  const { formatted, keyboard } = buildModerationRevokedCard({
    locale: ctx.locale,
    title: ctx.locale === 'id-ID' ? '🔓 Ban Dicabut' : '🔓 Ban Lifted',
    targetLabel: target.label,
    targetId: target.userId,
    count: affectedGroups,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.command(['tcmute', 'tcm'], async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    ctx.match ?? '',
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === ctx.from?.id) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const durationSeconds = parseDurationSeconds(target.remainingArgs[0]);
  const reasonParts = durationSeconds
    ? target.remainingArgs.slice(1)
    : target.remainingArgs;
  const reason = reasonParts.join(' ').trim() || 'Federation mute';
  const expiresAt = durationSeconds
    ? new Date(Date.now() + durationSeconds * 1000).toISOString()
    : null;

  let ref = 'local';
  let affectedGroups = 0;

  if (ctx.supabase) {
    await ensureTargetPlaceholderUser(ctx, target.userId);
    const chatIds = await getActiveConnectedChatIds(ctx.supabase);

    const { data: created } = await ctx.supabase
      .from('moderation_actions')
      .insert({
        chat_id: ctx.chat.id,
        origin_chat_id: ctx.chat.id,
        action_type: 'mute',
        target_user_id: target.userId,
        actor_user_id: ctx.from?.id ?? null,
        reason,
        duration_seconds: durationSeconds,
        expires_at: expiresAt,
        status: 'active',
        scope_type: 'community',
      })
      .select('external_ref')
      .single();

    if (created?.external_ref) {
      ref = created.external_ref;
    }

    const targets = chatIds.length > 0 ? chatIds : [ctx.chat.id];
    const results = await Promise.allSettled(
      targets.map((cid) =>
        ctx.api.restrictChatMember(
          cid,
          target.userId,
          { can_send_messages: false },
          {
            until_date: expiresAt
              ? Math.floor(new Date(expiresAt).getTime() / 1000)
              : undefined,
          },
        ),
      ),
    );
    affectedGroups = results.filter((r) => r.status === 'fulfilled').length;
  }

  const { formatted, keyboard } = buildModerationActionCard({
    locale: ctx.locale,
    title: ctx.locale === 'id-ID' ? '🔇 Bisu Federasi' : '🔇 Federation Mute',
    targetLabel: target.label,
    targetId: target.userId,
    count: affectedGroups,
    reason,
    ref,
    actionType: 'mute',
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.command(['tcunmute', 'tcunm'], async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    ctx.match ?? '',
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }

  let affectedGroups = 0;
  if (ctx.supabase) {
    await ctx.supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: ctx.from?.id ?? null,
      })
      .eq('target_user_id', target.userId)
      .eq('action_type', 'mute')
      .eq('status', 'active');

    const chatIds = await getActiveConnectedChatIds(ctx.supabase);
    const targets = chatIds.length > 0 ? chatIds : [ctx.chat.id];
    const results = await Promise.allSettled(
      targets.map((cid) =>
        ctx.api.restrictChatMember(cid, target.userId, {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        }),
      ),
    );
    affectedGroups = results.filter((r) => r.status === 'fulfilled').length;
  }

  const { formatted, keyboard } = buildModerationRevokedCard({
    locale: ctx.locale,
    title: ctx.locale === 'id-ID' ? '🔊 Bisu Dibuka' : '🔊 Unmuted',
    targetLabel: target.label,
    targetId: target.userId,
    count: affectedGroups,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.command(['tcwarn', 'tcw'], async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    ctx.match ?? '',
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === ctx.from?.id) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const warnLimit = Math.max(1, Number(ctx.appEnv.WARN_LIMIT) || 3);
  const reason = target.remainingArgs.join(' ').trim() || 'Rule violation';
  let ref = 'local';
  let warnCount = 1;

  if (ctx.supabase) {
    await ensureTargetPlaceholderUser(ctx, target.userId);
    const { data: created } = await ctx.supabase
      .from('moderation_actions')
      .insert({
        chat_id: ctx.chat.id,
        origin_chat_id: ctx.chat.id,
        action_type: 'warn',
        target_user_id: target.userId,
        actor_user_id: ctx.from?.id ?? null,
        reason,
        status: 'completed',
        scope_type: 'chat',
      })
      .select('external_ref')
      .single();

    if (created?.external_ref) {
      ref = created.external_ref;
    }

    const { count } = await ctx.supabase
      .from('moderation_actions')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', ctx.chat.id)
      .eq('target_user_id', target.userId)
      .eq('action_type', 'warn')
      .eq('status', 'completed');

    warnCount = count ?? 1;

    if (warnCount >= warnLimit) {
      await ctx.supabase.from('moderation_actions').insert({
        chat_id: ctx.chat.id,
        origin_chat_id: ctx.chat.id,
        action_type: 'ban',
        target_user_id: target.userId,
        actor_user_id: ctx.from?.id ?? null,
        reason: `Auto-ban: warn threshold (${warnCount}/${warnLimit})`,
        status: 'active',
        action_origin: 'automated',
        scope_type: 'community',
      });

      const chatIds = await getActiveConnectedChatIds(ctx.supabase);
      const targets = chatIds.length > 0 ? chatIds : [ctx.chat.id];
      await Promise.allSettled(
        targets.map((cid) => ctx.api.banChatMember(cid, target.userId)),
      );

      const { formatted, keyboard } = buildModerationActionCard({
        locale: ctx.locale,
        title:
          ctx.locale === 'id-ID'
            ? '🔨 Auto-Ban Federasi'
            : '🔨 Federation Auto-Ban',
        targetLabel: target.label,
        targetId: target.userId,
        reason: `Warn limit (${warnCount}/${warnLimit})`,
        ref,
        actionType: 'ban',
      });

      await ctx.reply(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      });
      return;
    }
  }

  const { formatted, keyboard } = buildModerationActionCard({
    locale: ctx.locale,
    title: ctx.locale === 'id-ID' ? '⚠️ Peringatan' : '⚠️ Warning',
    targetLabel: target.label,
    targetId: target.userId,
    reason,
    ref,
    extraLine: `Warn: ${target.label} (${warnCount}/${warnLimit})`,
    actionType: 'warn',
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.command(['checkme', 'cme', 'check', 'c'], async (ctx) => {
  const isSelf =
    ctx.message?.text?.startsWith('/checkme') ||
    ctx.message?.text?.startsWith('/cme');

  let targetId = ctx.from?.id ?? 0;
  let targetLabel = ctx.from?.username
    ? `@${ctx.from.username}`
    : String(targetId);

  if (!isSelf) {
    const role = await getUserRole(
      ctx.supabase,
      ctx.from?.id ?? 0,
      ctx.appEnv.OWNER_ID,
    );
    if (!isStaffRole(role)) {
      await ctx.reply(t(ctx.locale, 'err.staff_only'));
      return;
    }
    const target = await resolveTargetUser(
      ctx.supabase,
      ctx.match ?? '',
      ctx.message?.reply_to_message?.from,
    );
    if (target) {
      targetId = target.userId;
      targetLabel = target.label;
    }
  }

  const viewerRole = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  const snap = await fetchUserModerationSnapshot(ctx, targetId);
  const { formatted, keyboard } = buildCheckCard({
    locale: ctx.locale,
    targetLabel,
    targetId,
    ...snap,
    showStaffActions: isStaffRole(viewerRole),
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.callbackQuery('nav:checkme', async (ctx) => {
  await ctx.answerCallbackQuery();
  const targetId = ctx.from.id;
  const targetLabel = ctx.from.username
    ? `@${ctx.from.username}`
    : String(targetId);
  const viewerRole = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  const snap = await fetchUserModerationSnapshot(ctx, targetId);
  const { formatted, keyboard } = buildCheckCard({
    locale: ctx.locale,
    targetLabel,
    targetId,
    ...snap,
    showStaffActions: isStaffRole(viewerRole),
  });
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.callbackQuery(/^mod:check:(\d+)$/, async (ctx) => {
  const targetId = Number(ctx.match[1]);
  const isSelf = targetId === ctx.from.id;
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isSelf && !isStaffRole(role)) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  const snap = await fetchUserModerationSnapshot(ctx, targetId);
  const { formatted, keyboard } = buildCheckCard({
    locale: ctx.locale,
    targetLabel: String(targetId),
    targetId,
    ...snap,
    showStaffActions: isStaffRole(role),
  });
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.callbackQuery(/^mod:(unban|unmute):(\d+)$/, async (ctx) => {
  const action = ctx.match[1] as 'unban' | 'unmute';
  const targetId = Number(ctx.match[2]);
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

  if (ctx.supabase) {
    await ctx.supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: ctx.from.id,
      })
      .eq('target_user_id', targetId)
      .eq('action_type', action === 'unban' ? 'ban' : 'mute')
      .eq('status', 'active');
  }

  await ctx.answerCallbackQuery({
    text: action === 'unban' ? 'Ban dicabut' : 'Bisu dibuka',
  });
  const snap = await fetchUserModerationSnapshot(ctx, targetId);
  const { formatted, keyboard } = buildCheckCard({
    locale: ctx.locale,
    targetLabel: String(targetId),
    targetId,
    ...snap,
  });
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});
