import { b, code, type FormattedString, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { Message, User } from 'grammy/types';
import type { RoleKey } from '../../db/types';
import { syncModerationAcrossGroups } from '../../lib/telegram-sync';
import type { BotContext } from '../context';
import {
  getActiveConnectedChatIds,
  getUserRole,
  hasMinRole,
  isStaffRole,
  notifyAuditChannel,
  parseDurationSeconds,
  ROLE_RANK,
  recordAuditEvent,
  resolveTargetUser,
} from '../db';
import { type Locale, t } from '../i18n';
import { getCommandArgs, onCommand, parsePrefixedCommand } from '../prefixes';
import { clearBotSession, getBotSession, setBotSession } from '../session';
import {
  buildCheckCard,
  buildModerationActionCard,
  buildModerationRevokedCard,
} from '../ui';

export const moderationComposer = new Composer<BotContext>();

interface RebanSession {
  targetId: number;
  targetLabel: string;
  durationSeconds: number | null;
  reason: string;
  chatId: number;
}

interface ProofUploadSession {
  actionId: number;
  caseId: number;
  count: number;
}

const MAX_REASON_LENGTH = 500;

function formatDurationLabel(
  seconds: number | null | undefined,
  locale: Locale,
): string {
  const isId = locale === 'id-ID';
  if (!seconds || seconds <= 0) {
    return isId ? 'Permanen' : 'Permanent';
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${isId ? 'h' : 'd'}`);
  if (hours > 0) parts.push(`${hours}${isId ? 'j' : 'h'}`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 && parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ') || `${seconds}s`;
}

function formatModerationReason(raw: string, fallback: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= MAX_REASON_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

function formatActorLabel(ctx: BotContext): string {
  const user = ctx.from;
  if (!user) return 'System';
  if (user.username) return `@${user.username}`;
  return user.first_name || String(user.id);
}

async function resolveTargetLabel(
  ctx: BotContext,
  targetId: number,
): Promise<string> {
  if (!ctx.supabase || !targetId) return String(targetId);
  const { data } = await ctx.supabase
    .from('telegram_users')
    .select('username, first_name')
    .eq('user_id', targetId)
    .maybeSingle();
  if (data?.username) return `@${data.username}`;
  if (data?.first_name) return data.first_name;
  return String(targetId);
}

async function sendModerationAuditLog(
  ctx: BotContext,
  params: {
    action:
      | 'ban'
      | 'unban'
      | 'mute'
      | 'unmute'
      | 'warn'
      | 'kick'
      | 'unwarn'
      | 'resetwarns';
    targetLabel: string;
    targetId: number;
    actorId: number | null;
    chatId?: number | null;
    ref?: string | null;
    reason?: string | null;
    durationSeconds?: number | null;
    affectedGroups?: number;
    warnProgress?: string;
    clearedCount?: number;
  },
): Promise<void> {
  const titles: Record<typeof params.action, string> = {
    ban: '🔨 [AUDIT] FEDERATION BAN',
    unban: '🔓 [AUDIT] FEDERATION UNBAN',
    mute: '🔇 [AUDIT] FEDERATION MUTE',
    unmute: '🔊 [AUDIT] FEDERATION UNMUTE',
    warn: '⚠️ [AUDIT] WARNING ISSUED',
    kick: '👢 [AUDIT] USER KICKED',
    unwarn: '✅ [AUDIT] WARNING REMOVED',
    resetwarns: '🧹 [AUDIT] WARNINGS RESET',
  };

  const lines: string[] = [
    titles[params.action],
    `Target: ${params.targetLabel} (${params.targetId})`,
    `Actor: ${formatActorLabel(ctx)} (${params.actorId ?? 0})`,
  ];

  if (params.chatId) {
    const chatTitle =
      ctx.chat && 'title' in ctx.chat && ctx.chat.title
        ? `${ctx.chat.title} (${params.chatId})`
        : String(params.chatId);
    lines.push(`Origin: ${chatTitle}`);
  }
  if (params.ref && params.ref !== 'local') {
    lines.push(`Ref: ${params.ref}`);
  }
  if (params.action === 'ban' || params.action === 'mute') {
    lines.push(
      `Duration: ${formatDurationLabel(params.durationSeconds, 'en-US')}`,
    );
  }
  if (params.reason) {
    lines.push(`Reason: ${params.reason}`);
  }
  if (params.affectedGroups !== undefined) {
    lines.push(`Affected groups: ${params.affectedGroups}`);
  }
  if (params.warnProgress) {
    lines.push(`Warns: ${params.warnProgress}`);
  }
  if (params.clearedCount !== undefined) {
    lines.push(`Cleared warns: ${params.clearedCount}`);
  }
  lines.push(`Time: ${new Date().toISOString()}`);

  await notifyAuditChannel(ctx.api, ctx.appEnv, lines.join('\n'));
}

async function checkTargetModerationGuard(
  ctx: BotContext,
  actorRole: RoleKey,
  targetId: number,
  replyUser?: User,
): Promise<{ ok: true; targetRole: RoleKey | null } | { ok: false }> {
  const isId = ctx.locale === 'id-ID';
  if (replyUser?.is_bot) {
    await ctx.reply(
      isId
        ? 'Bot tidak dapat dijadikan target moderasi.'
        : 'Bots cannot be targeted by moderation.',
    );
    return { ok: false };
  }

  const envOwner = Number(ctx.appEnv.OWNER_ID);
  if (Number.isFinite(envOwner) && envOwner > 0 && targetId === envOwner) {
    await ctx.reply(
      isId
        ? 'Pemilik federasi tidak dapat dimoderasi.'
        : 'The federation owner cannot be moderated.',
    );
    return { ok: false };
  }

  const targetRole = await getUserRole(
    ctx.supabase,
    targetId,
    ctx.appEnv.OWNER_ID,
  );
  if (
    targetRole &&
    actorRole !== 'owner' &&
    ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]
  ) {
    await ctx.reply(
      isId
        ? 'Anda tidak dapat memoderasi staf dengan peringkat setara atau lebih tinggi.'
        : 'You cannot moderate staff with equal or higher rank.',
    );
    return { ok: false };
  }

  return { ok: true, targetRole };
}

async function demoteTargetStaffRoleIfNeeded(
  ctx: BotContext,
  targetId: number,
  targetRole: RoleKey | null,
  actorId: number | null,
): Promise<void> {
  if (!ctx.supabase || !targetRole || targetRole === 'owner') return;
  await ctx.supabase
    .from('role_assignments')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: actorId,
    })
    .eq('user_id', targetId)
    .eq('status', 'active');
}

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

async function ensureCaseForAction(
  ctx: BotContext,
  actionId: number,
  subjectUserId: number,
  actorUserId: number | null,
  summary: string,
): Promise<number | null> {
  if (!ctx.supabase) return null;
  const { data: action } = await ctx.supabase
    .from('moderation_actions')
    .select('case_id')
    .eq('id', actionId)
    .maybeSingle();

  if (action?.case_id) return action.case_id;

  const { data: createdCase } = await ctx.supabase
    .from('moderation_cases')
    .insert({
      subject_user_id: subjectUserId,
      opened_by_user_id: actorUserId,
      summary: summary.slice(0, 500),
      status: 'open',
      source: 'telegram_bot',
    })
    .select('id')
    .single();

  if (!createdCase) return null;

  await ctx.supabase
    .from('moderation_actions')
    .update({ case_id: createdCase.id })
    .eq('id', actionId);

  return createdCase.id;
}

function extractMediaMeta(msg: Message | undefined): {
  mediaType: string;
  fileUniqueId: string;
  fileId: string;
  mimeType: string | null;
  fileName: string | null;
  caption: string | null;
} | null {
  if (!msg) return null;
  const caption = msg.caption ?? null;
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    return {
      mediaType: 'photo',
      fileUniqueId: largest.file_unique_id,
      fileId: largest.file_id,
      mimeType: 'image/jpeg',
      fileName: null,
      caption,
    };
  }
  if (msg.document) {
    return {
      mediaType: 'document',
      fileUniqueId: msg.document.file_unique_id,
      fileId: msg.document.file_id,
      mimeType: msg.document.mime_type ?? null,
      fileName: msg.document.file_name ?? null,
      caption,
    };
  }
  if (msg.video) {
    return {
      mediaType: 'video',
      fileUniqueId: msg.video.file_unique_id,
      fileId: msg.video.file_id,
      mimeType: msg.video.mime_type ?? null,
      fileName: msg.video.file_name ?? null,
      caption,
    };
  }
  if (msg.animation) {
    return {
      mediaType: 'animation',
      fileUniqueId: msg.animation.file_unique_id,
      fileId: msg.animation.file_id,
      mimeType: msg.animation.mime_type ?? null,
      fileName: msg.animation.file_name ?? null,
      caption,
    };
  }
  if (msg.voice) {
    return {
      mediaType: 'voice',
      fileUniqueId: msg.voice.file_unique_id,
      fileId: msg.voice.file_id,
      mimeType: msg.voice.mime_type ?? null,
      fileName: null,
      caption,
    };
  }
  return null;
}

async function recordProofMediaItem(
  ctx: BotContext,
  caseId: number,
  sourceMsg: Message,
  uploaderId: number | null,
): Promise<boolean> {
  if (!ctx.supabase) return false;
  const media = extractMediaMeta(sourceMsg);
  if (!media) return false;

  const archiveChatId = Number(
    ctx.appEnv.LOGS || ctx.appEnv.APPEALS || sourceMsg.chat.id,
  );
  let archiveMsgId = sourceMsg.message_id;
  if (
    Number.isFinite(archiveChatId) &&
    archiveChatId !== 0 &&
    archiveChatId !== sourceMsg.chat.id
  ) {
    const copied = await ctx.api
      .copyMessage(archiveChatId, sourceMsg.chat.id, sourceMsg.message_id)
      .catch(() => null);
    if (copied?.message_id) {
      archiveMsgId = copied.message_id;
    }
  }

  const { data: existingUpload } = await ctx.supabase
    .from('moderation_evidence_uploads')
    .select('id')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let uploadId = existingUpload?.id ?? null;
  if (!uploadId) {
    const { data: createdUpload } = await ctx.supabase
      .from('moderation_evidence_uploads')
      .insert({
        case_id: caseId,
        destination_chat_id: archiveChatId,
        uploaded_by_user_id: uploaderId,
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    uploadId = createdUpload?.id ?? null;
  }

  if (!uploadId) return false;

  await ctx.supabase.from('moderation_evidence_items').insert({
    upload_id: uploadId,
    archive_message_id: archiveMsgId,
    destination_chat_id: archiveChatId,
    source_chat_id: sourceMsg.chat.id,
    source_message_id: sourceMsg.message_id,
    media_type: media.mediaType,
    file_unique_id: media.fileUniqueId,
    mime_type: media.mimeType,
    file_name: media.fileName,
    caption_text: media.caption,
    metadata: { file_id: media.fileId },
  });

  return true;
}

async function fetchUserModerationSnapshot(
  ctx: BotContext,
  targetId: number,
): Promise<{
  banRef: string | null;
  muteRef: string | null;
  warns: number;
  warnLimit: number;
  roleLabel: string | null;
  pendingAppealId: number | null;
  evidenceCount: number;
  taggedRuleCount: number;
}> {
  const warnLimit = Math.max(1, Number(ctx.appEnv.WARN_LIMIT) || 3);
  if (!ctx.supabase || !targetId) {
    return {
      banRef: null,
      muteRef: null,
      warns: 0,
      warnLimit,
      roleLabel: null,
      pendingAppealId: null,
      evidenceCount: 0,
      taggedRuleCount: 0,
    };
  }

  const warnExpiryDays = Math.max(0, Number(ctx.appEnv.WARN_EXPIRY_DAYS) || 0);
  let warnQuery = ctx.supabase
    .from('moderation_actions')
    .select('id', { count: 'exact', head: true })
    .eq('target_user_id', targetId)
    .eq('action_type', 'warn')
    .eq('status', 'completed');

  if (warnExpiryDays > 0) {
    const cutoff = new Date(
      Date.now() - warnExpiryDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    warnQuery = warnQuery.gte('created_at', cutoff);
  }

  const [
    { data: ban },
    { data: mute },
    { count: warnCount },
    role,
    { data: pendingAppeal },
    { data: cases },
  ] = await Promise.all([
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
    warnQuery,
    getUserRole(ctx.supabase, targetId, ctx.appEnv.OWNER_ID),
    ctx.supabase
      .from('moderation_appeals')
      .select('id')
      .eq('appellant_user_id', targetId)
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from('moderation_cases')
      .select('id')
      .eq('subject_user_id', targetId),
  ]);

  let evidenceCount = 0;
  let taggedRuleCount = 0;
  const caseIds = (cases ?? []).map((c) => c.id);
  if (caseIds.length > 0) {
    const [{ data: uploads }, { count: ruleCount }] = await Promise.all([
      ctx.supabase
        .from('moderation_evidence_uploads')
        .select('id')
        .in('case_id', caseIds),
      ctx.supabase
        .from('moderation_case_rules')
        .select('id', { count: 'exact', head: true })
        .in('case_id', caseIds),
    ]);
    taggedRuleCount = ruleCount ?? 0;
    const uploadIds = (uploads ?? []).map((u) => u.id);
    if (uploadIds.length > 0) {
      const { count: evCount } = await ctx.supabase
        .from('moderation_evidence_items')
        .select('id', { count: 'exact', head: true })
        .in('upload_id', uploadIds);
      evidenceCount = evCount ?? 0;
    }
  }

  return {
    banRef: ban?.external_ref ?? null,
    muteRef: mute?.external_ref ?? null,
    warns: warnCount ?? 0,
    warnLimit,
    roleLabel: role,
    pendingAppealId: pendingAppeal?.id ?? null,
    evidenceCount,
    taggedRuleCount,
  };
}

function buildEnhancedCheckCard(opts: {
  locale: Locale;
  targetLabel: string;
  targetId: number;
  banRef: string | null;
  muteRef: string | null;
  warns: number;
  warnLimit: number;
  roleLabel: string | null;
  pendingAppealId: number | null;
  evidenceCount: number;
  taggedRuleCount: number;
  showStaffActions: boolean;
}): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const { evidenceCount, taggedRuleCount, ...cardOpts } = opts;
  const { formatted, keyboard } = buildCheckCard(cardOpts);
  const isId = opts.locale === 'id-ID';
  const evidenceLabel = isId ? 'Bukti terlampir' : 'Attached evidence';
  const rulesLabel = isId ? 'Pasal ditandai' : 'Tagged rules';
  const enhanced = fmt`${formatted}
• ${b}${evidenceLabel}:${b} ${String(evidenceCount)} | ${b}${rulesLabel}:${b} ${String(taggedRuleCount)}`;
  return { formatted: enhanced, keyboard };
}

async function executeBan(
  ctx: BotContext,
  params: {
    targetId: number;
    targetLabel: string;
    targetRole?: RoleKey | null;
    durationSeconds: number | null;
    reason: string;
    chatId: number;
    actorId: number | null;
    replyMsg?: Message;
  },
): Promise<{ ref: string; actionId: number | null; affectedGroups: number }> {
  const expiresAt = params.durationSeconds
    ? new Date(Date.now() + params.durationSeconds * 1000).toISOString()
    : null;

  let ref = 'local';
  let actionId: number | null = null;
  let affectedGroups = 0;

  if (ctx.supabase) {
    await ensureTargetPlaceholderUser(ctx, params.targetId);
    await demoteTargetStaffRoleIfNeeded(
      ctx,
      params.targetId,
      params.targetRole ?? null,
      params.actorId,
    );
    // Revoke any superseded active ban first so only one active ban stays open
    await ctx.supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: params.actorId,
      })
      .eq('target_user_id', params.targetId)
      .eq('action_type', 'ban')
      .eq('status', 'active');

    const chatIds = await getActiveConnectedChatIds(ctx.supabase);
    const { data: created } = await ctx.supabase
      .from('moderation_actions')
      .insert({
        chat_id: params.chatId,
        origin_chat_id: params.chatId,
        action_type: 'ban',
        target_user_id: params.targetId,
        actor_user_id: params.actorId,
        reason: params.reason,
        duration_seconds: params.durationSeconds,
        expires_at: expiresAt,
        status: 'active',
        scope_type: 'community',
      })
      .select('id, external_ref')
      .single();

    if (created) {
      ref = created.external_ref;
      actionId = created.id;
    }

    const targets = chatIds.length > 0 ? chatIds : [params.chatId];
    const syncRes = await syncModerationAcrossGroups({
      api: ctx.api,
      supabase: ctx.supabase,
      actionId,
      operation: 'ban',
      targetUserId: params.targetId,
      actorUserId: params.actorId,
      expiresAtIso: expiresAt,
      chatIds: targets,
    });
    affectedGroups = syncRes.okCount;

    if (actionId && params.replyMsg && extractMediaMeta(params.replyMsg)) {
      const caseId = await ensureCaseForAction(
        ctx,
        actionId,
        params.targetId,
        params.actorId,
        params.reason,
      );
      if (caseId) {
        await recordProofMediaItem(
          ctx,
          caseId,
          params.replyMsg,
          params.actorId,
        );
      }
    }

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'moderation.ban',
      entityType: 'moderation_action',
      entityId: ref,
      actorUserId: params.actorId,
      subjectUserId: params.targetId,
      chatId: params.chatId,
      actionId,
      payload: {
        reason: params.reason,
        durationSeconds: params.durationSeconds,
      },
    });
  }

  await sendModerationAuditLog(ctx, {
    action: 'ban',
    targetLabel: params.targetLabel,
    targetId: params.targetId,
    actorId: params.actorId,
    chatId: params.chatId,
    ref,
    reason: params.reason,
    durationSeconds: params.durationSeconds,
    affectedGroups,
  });

  return { ref, actionId, affectedGroups };
}

onCommand(moderationComposer, ['tcban', 'tcb'], async (ctx) => {
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!hasMinRole(role, 'developer') || !role) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === actorId) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const guard = await checkTargetModerationGuard(
    ctx,
    role,
    target.userId,
    ctx.message?.reply_to_message?.from,
  );
  if (!guard.ok) return;

  const forceFlag = target.remainingArgs.some(
    (a) => a === '--force' || a === '-f',
  );
  const filteredArgs = target.remainingArgs.filter(
    (a) => a !== '--force' && a !== '-f',
  );
  const durationSeconds = parseDurationSeconds(filteredArgs[0]);
  const reasonParts = durationSeconds ? filteredArgs.slice(1) : filteredArgs;
  const reason = formatModerationReason(
    reasonParts.join(' '),
    'Federation ban',
  );

  // Re-ban confirmation if target already has an active ban
  if (ctx.supabase && !forceFlag) {
    const { data: existingBan } = await ctx.supabase
      .from('moderation_actions')
      .select('external_ref, reason')
      .eq('target_user_id', target.userId)
      .eq('action_type', 'ban')
      .eq('status', 'active')
      .maybeSingle();

    if (existingBan) {
      await setBotSession<RebanSession>(ctx.appEnv, 'reban', actorId, {
        targetId: target.userId,
        targetLabel: target.label,
        durationSeconds,
        reason,
        chatId: ctx.chat?.id ?? 0,
      });
      const isId = ctx.locale === 'id-ID';
      const prompt = fmt`${b}${isId ? '⚠️ Pengguna Sudah Di-Ban' : '⚠️ User Already Banned'}${b}
${b}Target:${b} ${target.label} (${code}${String(target.userId)}${code})
${b}Ref Aktif:${b} ${code}${existingBan.external_ref}${code}
${b}${isId ? 'Alasan sebelumnya' : 'Previous reason'}:${b} ${existingBan.reason ?? '-'}

${isId ? 'Timpa ban aktif dengan alasan baru?' : 'Overwrite active ban with the new reason?'}`;
      const kb = new InlineKeyboard()
        .text(
          isId ? '✅ Ya, Timpa Ban' : '✅ Overwrite Ban',
          `mod:reban:confirm:${target.userId}:${actorId}`,
        )
        .text(
          isId ? '❌ Batal' : '❌ Cancel',
          `mod:reban:cancel:${target.userId}:${actorId}`,
        );
      await ctx.reply(prompt.text, {
        entities: prompt.entities,
        reply_markup: kb,
      });
      return;
    }
  }

  const { ref, actionId, affectedGroups } = await executeBan(ctx, {
    targetId: target.userId,
    targetLabel: target.label,
    targetRole: guard.targetRole,
    durationSeconds,
    reason,
    chatId: ctx.chat?.id ?? 0,
    actorId: actorId || null,
    replyMsg: ctx.message?.reply_to_message,
  });

  const isId = ctx.locale === 'id-ID';
  const durationLabel = formatDurationLabel(durationSeconds, ctx.locale);
  const { formatted, keyboard } = buildModerationActionCard({
    locale: ctx.locale,
    title: isId ? '🔨 Ban Federasi' : '🔨 Federation Ban',
    targetLabel: target.label,
    targetId: target.userId,
    count: affectedGroups,
    reason,
    ref,
    extraLine: `${isId ? '⏱ Durasi' : '⏱ Duration'}: ${durationLabel}`,
    actionType: 'ban',
    actionId,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.callbackQuery(
  /^mod:reban:(confirm|cancel):(\d+):(\d+)$/,
  async (ctx) => {
    const decision = ctx.match[1];
    const targetId = Number(ctx.match[2]);
    const expectedActorId = Number(ctx.match[3]);
    const actorId = ctx.from.id;
    const isId = ctx.locale === 'id-ID';

    if (actorId !== expectedActorId) {
      await ctx.answerCallbackQuery({
        text: isId
          ? 'Hanya staf pemrakarsa yang dapat mengonfirmasi.'
          : 'Only the initiating staff can confirm.',
        show_alert: true,
      });
      return;
    }

    const session = await getBotSession<RebanSession>(
      ctx.appEnv,
      'reban',
      actorId,
    );
    await clearBotSession(ctx.appEnv, 'reban', actorId);

    if (decision === 'cancel' || !session || session.targetId !== targetId) {
      await ctx.answerCallbackQuery({
        text: isId ? 'Dibatalkan.' : 'Cancelled.',
      });
      await ctx
        .editMessageText(
          isId ? '❌ Penimpaan ban dibatalkan.' : '❌ Re-ban cancelled.',
          { reply_markup: new InlineKeyboard() },
        )
        .catch(() => {});
      return;
    }

    const { ref, actionId, affectedGroups } = await executeBan(ctx, {
      targetId: session.targetId,
      targetLabel: session.targetLabel,
      durationSeconds: session.durationSeconds,
      reason: session.reason,
      chatId: session.chatId,
      actorId,
    });

    await ctx.answerCallbackQuery({
      text: isId ? 'Ban diperbarui.' : 'Ban updated.',
    });

    const { formatted, keyboard } = buildModerationActionCard({
      locale: ctx.locale,
      title: isId
        ? '🔨 Ban Federasi (Diperbarui)'
        : '🔨 Federation Ban (Updated)',
      targetLabel: session.targetLabel,
      targetId: session.targetId,
      count: affectedGroups,
      reason: session.reason,
      ref,
      extraLine: `${isId ? '⏱ Durasi' : '⏱ Duration'}: ${formatDurationLabel(session.durationSeconds, ctx.locale)}`,
      actionType: 'ban',
      actionId,
    });

    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  },
);

onCommand(moderationComposer, ['tcunban', 'tcunb'], async (ctx) => {
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!hasMinRole(role, 'developer') || !role) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === actorId) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const guard = await checkTargetModerationGuard(
    ctx,
    role,
    target.userId,
    ctx.message?.reply_to_message?.from,
  );
  if (!guard.ok) return;

  let affectedGroups = 0;
  const chatId = ctx.chat?.id ?? 0;
  if (ctx.supabase) {
    await demoteTargetStaffRoleIfNeeded(
      ctx,
      target.userId,
      guard.targetRole,
      actorId || null,
    );
    await ctx.supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: actorId || null,
      })
      .eq('target_user_id', target.userId)
      .eq('action_type', 'ban')
      .eq('status', 'active');

    const chatIds = await getActiveConnectedChatIds(ctx.supabase);
    const targets = chatIds.length > 0 ? chatIds : [chatId].filter(Boolean);
    const syncRes = await syncModerationAcrossGroups({
      api: ctx.api,
      supabase: ctx.supabase,
      operation: 'unban',
      targetUserId: target.userId,
      actorUserId: actorId || null,
      chatIds: targets,
    });
    affectedGroups = syncRes.okCount;

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'moderation.unban',
      entityType: 'telegram_user',
      entityId: String(target.userId),
      actorUserId: actorId || null,
      subjectUserId: target.userId,
      chatId: chatId || null,
    });
  }

  await sendModerationAuditLog(ctx, {
    action: 'unban',
    targetLabel: target.label,
    targetId: target.userId,
    actorId: actorId || null,
    chatId: chatId || null,
    affectedGroups,
  });

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

onCommand(moderationComposer, ['tcmute', 'tcm'], async (ctx) => {
  if (ctx.chat?.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role) || !role) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === actorId) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const guard = await checkTargetModerationGuard(
    ctx,
    role,
    target.userId,
    ctx.message?.reply_to_message?.from,
  );
  if (!guard.ok) return;

  const durationSeconds = parseDurationSeconds(target.remainingArgs[0]);
  const reasonParts = durationSeconds
    ? target.remainingArgs.slice(1)
    : target.remainingArgs;
  const reason = formatModerationReason(
    reasonParts.join(' '),
    'Federation mute',
  );
  const expiresAt = durationSeconds
    ? new Date(Date.now() + durationSeconds * 1000).toISOString()
    : null;

  let ref = 'local';
  let actionId: number | null = null;
  let affectedGroups = 0;
  const chatId = ctx.chat?.id ?? 0;

  if (ctx.supabase) {
    await ensureTargetPlaceholderUser(ctx, target.userId);
    await demoteTargetStaffRoleIfNeeded(
      ctx,
      target.userId,
      guard.targetRole,
      actorId || null,
    );
    const chatIds = await getActiveConnectedChatIds(ctx.supabase);

    const { data: created } = await ctx.supabase
      .from('moderation_actions')
      .insert({
        chat_id: chatId,
        origin_chat_id: chatId,
        action_type: 'mute',
        target_user_id: target.userId,
        actor_user_id: actorId || null,
        reason,
        duration_seconds: durationSeconds,
        expires_at: expiresAt,
        status: 'active',
        scope_type: 'community',
      })
      .select('id, external_ref')
      .single();

    if (created) {
      ref = created.external_ref;
      actionId = created.id;
    }

    const targets = chatIds.length > 0 ? chatIds : [chatId].filter(Boolean);
    const syncRes = await syncModerationAcrossGroups({
      api: ctx.api,
      supabase: ctx.supabase,
      actionId,
      operation: 'mute',
      targetUserId: target.userId,
      actorUserId: actorId || null,
      expiresAtIso: expiresAt,
      chatIds: targets,
    });
    affectedGroups = syncRes.okCount;

    if (
      actionId &&
      ctx.message?.reply_to_message &&
      extractMediaMeta(ctx.message.reply_to_message)
    ) {
      const caseId = await ensureCaseForAction(
        ctx,
        actionId,
        target.userId,
        actorId || null,
        reason,
      );
      if (caseId) {
        await recordProofMediaItem(
          ctx,
          caseId,
          ctx.message.reply_to_message,
          actorId || null,
        );
      }
    }

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'moderation.mute',
      entityType: 'moderation_action',
      entityId: ref,
      actorUserId: actorId || null,
      subjectUserId: target.userId,
      chatId,
      actionId,
      payload: { reason, durationSeconds },
    });
  }

  await sendModerationAuditLog(ctx, {
    action: 'mute',
    targetLabel: target.label,
    targetId: target.userId,
    actorId: actorId || null,
    chatId: chatId || null,
    ref,
    reason,
    durationSeconds,
    affectedGroups,
  });

  const isId = ctx.locale === 'id-ID';
  const durationLabel = formatDurationLabel(durationSeconds, ctx.locale);
  const { formatted, keyboard } = buildModerationActionCard({
    locale: ctx.locale,
    title: isId ? '🔇 Bisu Federasi' : '🔇 Federation Mute',
    targetLabel: target.label,
    targetId: target.userId,
    count: affectedGroups,
    reason,
    ref,
    extraLine: `${isId ? '⏱ Durasi' : '⏱ Duration'}: ${durationLabel}`,
    actionType: 'mute',
    actionId,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(moderationComposer, ['tcunmute', 'tcunm', 'tcum'], async (ctx) => {
  if (ctx.chat?.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }

  let affectedGroups = 0;
  const chatId = ctx.chat?.id ?? 0;
  if (ctx.supabase) {
    await ctx.supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: actorId || null,
      })
      .eq('target_user_id', target.userId)
      .eq('action_type', 'mute')
      .eq('status', 'active');

    const chatIds = await getActiveConnectedChatIds(ctx.supabase);
    const targets = chatIds.length > 0 ? chatIds : [chatId].filter(Boolean);
    const syncRes = await syncModerationAcrossGroups({
      api: ctx.api,
      supabase: ctx.supabase,
      operation: 'unmute',
      targetUserId: target.userId,
      actorUserId: actorId || null,
      chatIds: targets,
    });
    affectedGroups = syncRes.okCount;

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'moderation.unmute',
      entityType: 'telegram_user',
      entityId: String(target.userId),
      actorUserId: actorId || null,
      subjectUserId: target.userId,
      chatId,
    });
  }

  await sendModerationAuditLog(ctx, {
    action: 'unmute',
    targetLabel: target.label,
    targetId: target.userId,
    actorId: actorId || null,
    chatId: chatId || null,
    affectedGroups,
  });

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

onCommand(moderationComposer, ['tcwarn', 'tcw'], async (ctx) => {
  if (ctx.chat?.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role) || !role) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === actorId) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const guard = await checkTargetModerationGuard(
    ctx,
    role,
    target.userId,
    ctx.message?.reply_to_message?.from,
  );
  if (!guard.ok) return;

  const warnLimit = Math.max(1, Number(ctx.appEnv.WARN_LIMIT) || 3);
  const warnExpiryDays = Math.max(0, Number(ctx.appEnv.WARN_EXPIRY_DAYS) || 0);
  const reason = formatModerationReason(
    target.remainingArgs.join(' '),
    'Rule violation',
  );
  let ref = 'local';
  let actionId: number | null = null;
  let warnCount = 1;
  const chatId = ctx.chat?.id ?? 0;

  if (ctx.supabase) {
    await ensureTargetPlaceholderUser(ctx, target.userId);
    const { data: created } = await ctx.supabase
      .from('moderation_actions')
      .insert({
        chat_id: chatId,
        origin_chat_id: chatId,
        action_type: 'warn',
        target_user_id: target.userId,
        actor_user_id: actorId || null,
        reason,
        status: 'completed',
        scope_type: 'chat',
      })
      .select('id, external_ref')
      .single();

    if (created) {
      ref = created.external_ref;
      actionId = created.id;
    }

    if (
      actionId &&
      ctx.message?.reply_to_message &&
      extractMediaMeta(ctx.message.reply_to_message)
    ) {
      const caseId = await ensureCaseForAction(
        ctx,
        actionId,
        target.userId,
        actorId || null,
        reason,
      );
      if (caseId) {
        await recordProofMediaItem(
          ctx,
          caseId,
          ctx.message.reply_to_message,
          actorId || null,
        );
      }
    }

    let warnQuery = ctx.supabase
      .from('moderation_actions')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', chatId)
      .eq('target_user_id', target.userId)
      .eq('action_type', 'warn')
      .eq('status', 'completed');

    if (warnExpiryDays > 0) {
      const cutoff = new Date(
        Date.now() - warnExpiryDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      warnQuery = warnQuery.gte('created_at', cutoff);
    }

    const { count } = await warnQuery;
    warnCount = count ?? 1;

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'moderation.warn',
      entityType: 'moderation_action',
      entityId: ref,
      actorUserId: actorId || null,
      subjectUserId: target.userId,
      chatId,
      actionId,
      payload: { reason, warnCount, warnLimit },
    });

    await sendModerationAuditLog(ctx, {
      action: 'warn',
      targetLabel: target.label,
      targetId: target.userId,
      actorId: actorId || null,
      chatId: chatId || null,
      ref,
      reason,
      warnProgress: `${warnCount}/${warnLimit}`,
    });

    const fedWarnLimit = Math.max(0, Number(ctx.appEnv.FED_WARN_LIMIT) || 0);
    let fedWarnCount = 0;
    if (fedWarnLimit > 0) {
      let fedQuery = ctx.supabase
        .from('moderation_actions')
        .select('id', { count: 'exact', head: true })
        .eq('target_user_id', target.userId)
        .eq('action_type', 'warn')
        .eq('status', 'completed');
      if (warnExpiryDays > 0) {
        const cutoff = new Date(
          Date.now() - warnExpiryDays * 24 * 60 * 60 * 1000,
        ).toISOString();
        fedQuery = fedQuery.gte('created_at', cutoff);
      }
      const { count: fCount } = await fedQuery;
      fedWarnCount = fCount ?? 0;
    }

    if (
      warnCount >= warnLimit ||
      (fedWarnLimit > 0 && fedWarnCount >= fedWarnLimit)
    ) {
      const triggeredLimit =
        fedWarnLimit > 0 && fedWarnCount >= fedWarnLimit
          ? `${fedWarnCount}/${fedWarnLimit} (fed)`
          : `${warnCount}/${warnLimit}`;
      const autoBan = await executeBan(ctx, {
        targetId: target.userId,
        targetLabel: target.label,
        targetRole: guard.targetRole,
        durationSeconds: null,
        reason: `Auto-ban: warn threshold (${triggeredLimit})`,
        chatId,
        actorId: actorId || null,
      });

      const isId = ctx.locale === 'id-ID';
      const { formatted, keyboard } = buildModerationActionCard({
        locale: ctx.locale,
        title: isId ? '🔨 Auto-Ban Federasi' : '🔨 Federation Auto-Ban',
        targetLabel: target.label,
        targetId: target.userId,
        count: autoBan.affectedGroups,
        reason: `Warn limit (${triggeredLimit})`,
        ref: autoBan.ref,
        extraLine: `${isId ? '⏱ Durasi' : '⏱ Duration'}: ${formatDurationLabel(null, ctx.locale)}`,
        actionType: 'ban',
        actionId: autoBan.actionId,
      });

      await ctx.reply(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      });
      return;
    }
  } else {
    await sendModerationAuditLog(ctx, {
      action: 'warn',
      targetLabel: target.label,
      targetId: target.userId,
      actorId: actorId || null,
      chatId: chatId || null,
      ref,
      reason,
      warnProgress: `${warnCount}/${warnLimit}`,
    });
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
    actionId,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(moderationComposer, ['checkme', 'cme', 'check', 'c'], async (ctx) => {
  const parsed = parsePrefixedCommand(
    ctx.message?.text,
    ctx.appEnv?.PREFIXES,
    ctx.me?.username,
  );
  const cmdName = parsed?.command ?? '';
  const isSelf = cmdName === 'checkme' || cmdName === 'cme';

  if (isSelf && ctx.from?.is_bot) {
    await ctx.reply(
      ctx.locale === 'id-ID'
        ? 'Bot tidak memiliki catatan moderasi federasi.'
        : 'Bots do not hold federation moderation records.',
    );
    return;
  }

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
    const rawArgs = getCommandArgs(ctx);
    const target = await resolveTargetUser(
      ctx.supabase,
      rawArgs,
      ctx.message?.reply_to_message?.from,
    );
    if (!target) {
      if (rawArgs.trim().length > 0 || !ctx.message?.reply_to_message) {
        await ctx.reply(t(ctx.locale, 'err.target_missing'));
        return;
      }
    } else {
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
  const { formatted, keyboard } = buildEnhancedCheckCard({
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
  const { formatted, keyboard } = buildEnhancedCheckCard({
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
  const [snap, targetLabel] = await Promise.all([
    fetchUserModerationSnapshot(ctx, targetId),
    resolveTargetLabel(ctx, targetId),
  ]);
  const { formatted, keyboard } = buildEnhancedCheckCard({
    locale: ctx.locale,
    targetLabel,
    targetId,
    ...snap,
    showStaffActions: isStaffRole(role),
  });
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

moderationComposer.callbackQuery(
  /^check:(warns|appeals):(\d+):(\d+)$/,
  async (ctx) => {
    const kind = ctx.match[1] as 'warns' | 'appeals';
    const targetId = Number(ctx.match[2]);
    const page = Math.max(1, Number(ctx.match[3]));
    const isSelf = targetId === ctx.from.id;
    const isId = ctx.locale === 'id-ID';

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
    const pageSize = 5;
    const from = (page - 1) * pageSize;

    if (!ctx.supabase) {
      await ctx
        .editMessageText(t(ctx.locale, 'err.db_unconfigured'), {
          reply_markup: new InlineKeyboard().text(
            isId ? '← Kembali' : '← Back',
            `mod:check:${targetId}`,
          ),
        })
        .catch(() => {});
      return;
    }

    let body = '';
    let total = 0;

    if (kind === 'warns') {
      const { data, count } = await ctx.supabase
        .from('moderation_actions')
        .select('external_ref, reason, status, created_at', { count: 'exact' })
        .eq('target_user_id', targetId)
        .eq('action_type', 'warn')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      total = count ?? 0;
      body =
        !data || data.length === 0
          ? isId
            ? 'Belum ada riwayat peringatan.'
            : 'No warning history.'
          : data
              .map(
                (w, i) =>
                  `${from + i + 1}. [${w.status}] ${w.external_ref}\n   ${w.reason ?? '-'} (${w.created_at.slice(0, 10)})`,
              )
              .join('\n');
    } else {
      const { data, count } = await ctx.supabase
        .from('moderation_appeals')
        .select('id, status, submitted_at, appeal_text', { count: 'exact' })
        .eq('appellant_user_id', targetId)
        .order('submitted_at', { ascending: false })
        .range(from, from + pageSize - 1);
      total = count ?? 0;
      body =
        !data || data.length === 0
          ? isId
            ? 'Belum ada riwayat banding.'
            : 'No appeal history.'
          : data
              .map(
                (a, i) =>
                  `${from + i + 1}. #${a.id} [${a.status}] (${a.submitted_at.slice(0, 10)})\n   ${a.appeal_text.slice(0, 60)}`,
              )
              .join('\n');
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const title =
      kind === 'warns'
        ? isId
          ? `⚠️ Riwayat Peringatan (${page}/${totalPages})`
          : `⚠️ Warning History (${page}/${totalPages})`
        : isId
          ? `⚖️ Riwayat Banding (${page}/${totalPages})`
          : `⚖️ Appeal History (${page}/${totalPages})`;

    const kb = new InlineKeyboard();
    if (page > 1) kb.text('◀️', `check:${kind}:${targetId}:${page - 1}`);
    if (page < totalPages)
      kb.text('▶️', `check:${kind}:${targetId}:${page + 1}`);
    if (page > 1 || page < totalPages) kb.row();
    kb.text(isId ? '← Kembali' : '← Back', `mod:check:${targetId}`).text(
      isId ? '✖ Tutup' : '✖ Close',
      'nav:close',
    );

    const formatted = fmt`${b}${title}${b}\nTarget: ${code}${String(targetId)}${code}\n\n${body}`;
    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: kb,
      })
      .catch(() => {});
  },
);

moderationComposer.callbackQuery(/^mod:(unban|unmute):(\d+)$/, async (ctx) => {
  const action = ctx.match[1] as 'unban' | 'unmute';
  const targetId = Number(ctx.match[2]);
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (
    (action === 'unban' && !hasMinRole(role, 'developer')) ||
    !isStaffRole(role)
  ) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }

  let affectedGroups = 0;
  const targetLabel = await resolveTargetLabel(ctx, targetId);
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

    const chatIds = await getActiveConnectedChatIds(ctx.supabase);
    if (chatIds.length > 0) {
      const syncRes = await syncModerationAcrossGroups({
        api: ctx.api,
        supabase: ctx.supabase,
        operation: action,
        targetUserId: targetId,
        actorUserId: ctx.from.id,
        chatIds,
      });
      affectedGroups = syncRes.okCount;
    }

    await recordAuditEvent(ctx.supabase, {
      eventKey: action === 'unban' ? 'moderation.unban' : 'moderation.unmute',
      entityType: 'telegram_user',
      entityId: String(targetId),
      actorUserId: ctx.from.id,
      subjectUserId: targetId,
      chatId: ctx.chat?.id ?? null,
    });
  }

  await sendModerationAuditLog(ctx, {
    action,
    targetLabel,
    targetId,
    actorId: ctx.from.id,
    chatId: ctx.chat?.id ?? null,
    affectedGroups,
  });

  await ctx.answerCallbackQuery({
    text: action === 'unban' ? 'Ban dicabut' : 'Bisu dibuka',
  });
  const snap = await fetchUserModerationSnapshot(ctx, targetId);
  const { formatted, keyboard } = buildEnhancedCheckCard({
    locale: ctx.locale,
    targetLabel,
    targetId,
    ...snap,
    showStaffActions: true,
  });
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

// Interactive proof attachment & rule tagging
moderationComposer.callbackQuery(/^mod:proof:(\d+)$/, async (ctx) => {
  const actionId = Number(ctx.match[1]);
  const actorId = ctx.from.id;
  const isId = ctx.locale === 'id-ID';

  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role)) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }
  if (!ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.db_unconfigured'),
      show_alert: true,
    });
    return;
  }

  const { data: action } = await ctx.supabase
    .from('moderation_actions')
    .select('id, target_user_id, reason')
    .eq('id', actionId)
    .maybeSingle();

  if (!action) {
    await ctx.answerCallbackQuery({
      text: isId ? 'Aksi tidak ditemukan.' : 'Action not found.',
      show_alert: true,
    });
    return;
  }

  const caseId = await ensureCaseForAction(
    ctx,
    action.id,
    action.target_user_id,
    actorId,
    action.reason ?? 'Moderation evidence',
  );
  if (!caseId) {
    await ctx.answerCallbackQuery({
      text: 'Gagal membuat kasus bukti.',
      show_alert: true,
    });
    return;
  }

  await setBotSession<ProofUploadSession>(ctx.appEnv, 'proof_upload', actorId, {
    actionId: action.id,
    caseId,
    count: 0,
  });

  await ctx.answerCallbackQuery();
  const prompt = fmt`${b}${isId ? '📎 Lampirkan Bukti' : '📎 Attach Evidence'}${b}
${isId ? 'Kirimkan foto, video, atau dokumen sekarang untuk dilampirkan ke kasus ini.' : 'Send photos, videos, or documents now to attach them to this case.'}`;
  const kb = new InlineKeyboard().text(
    isId ? '✅ Selesai' : '✅ Done',
    `mod:proof:done:${action.id}`,
  );
  await ctx.reply(prompt.text, {
    entities: prompt.entities,
    reply_markup: kb,
  });
});

moderationComposer.callbackQuery(/^mod:proof:done:(\d+)$/, async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const session = await getBotSession<ProofUploadSession>(
    ctx.appEnv,
    'proof_upload',
    ctx.from.id,
  );
  await clearBotSession(ctx.appEnv, 'proof_upload', ctx.from.id);
  await ctx.answerCallbackQuery({
    text: isId ? 'Sesi bukti selesai.' : 'Evidence session finished.',
  });
  await ctx
    .editMessageText(
      isId
        ? `✅ ${session?.count ?? 0} bukti tersimpan.`
        : `✅ ${session?.count ?? 0} evidence item(s) saved.`,
      { reply_markup: new InlineKeyboard() },
    )
    .catch(() => {});
});

moderationComposer.callbackQuery(/^mod:rule:(\d+)$/, async (ctx) => {
  const actionId = Number(ctx.match[1]);
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
  if (!ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.db_unconfigured'),
      show_alert: true,
    });
    return;
  }

  const { data: version } = await ctx.supabase
    .from('rule_set_versions')
    .select('id')
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!version) {
    await ctx.answerCallbackQuery({
      text: isId ? 'Belum ada aturan diterbitkan.' : 'No published rules yet.',
      show_alert: true,
    });
    return;
  }

  const { data: items } = await ctx.supabase
    .from('rule_items')
    .select('id, title')
    .eq('rule_set_version_id', version.id)
    .order('sort_order', { ascending: true })
    .limit(8);

  if (!items || items.length === 0) {
    await ctx.answerCallbackQuery({
      text: isId ? 'Daftar aturan kosong.' : 'No rule items found.',
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard();
  for (const item of items) {
    kb.text(
      `📜 ${item.title.slice(0, 28)}`,
      `mod:rule:pick:${actionId}:${item.id}`,
    ).row();
  }
  kb.text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  await ctx.reply(
    isId ? 'Pilih pasal aturan yang dilanggar:' : 'Select the violated rule:',
    { reply_markup: kb },
  );
});

moderationComposer.callbackQuery(/^mod:rule:pick:(\d+):(\d+)$/, async (ctx) => {
  const actionId = Number(ctx.match[1]);
  const ruleItemId = Number(ctx.match[2]);
  const actorId = ctx.from.id;
  const isId = ctx.locale === 'id-ID';

  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role) || !ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }

  const { data: action } = await ctx.supabase
    .from('moderation_actions')
    .select('id, target_user_id, reason')
    .eq('id', actionId)
    .maybeSingle();

  if (!action) {
    await ctx.answerCallbackQuery({
      text: isId ? 'Aksi tidak ditemukan.' : 'Action not found.',
      show_alert: true,
    });
    return;
  }

  const caseId = await ensureCaseForAction(
    ctx,
    action.id,
    action.target_user_id,
    actorId,
    action.reason ?? 'Rule violation',
  );
  if (caseId) {
    await ctx.supabase.from('moderation_case_rules').upsert(
      {
        case_id: caseId,
        rule_item_id: ruleItemId,
        linked_by_user_id: actorId,
      },
      { onConflict: 'case_id,rule_item_id' },
    );
  }

  await ctx.answerCallbackQuery({
    text: isId ? 'Pasal aturan ditandai.' : 'Rule tagged.',
  });
  await ctx
    .editMessageText(
      isId
        ? '✅ Pasal aturan berhasil ditautkan ke kasus.'
        : '✅ Rule tagged to moderation case.',
      { reply_markup: new InlineKeyboard() },
    )
    .catch(() => {});
});

// Capture media when a staff member has an active proof_upload session
moderationComposer.on(
  [
    'message:photo',
    'message:document',
    'message:video',
    'message:animation',
    'message:voice',
  ],
  async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) {
      await next();
      return;
    }
    const session = await getBotSession<ProofUploadSession>(
      ctx.appEnv,
      'proof_upload',
      userId,
    );
    if (!session) {
      await next();
      return;
    }

    const saved = await recordProofMediaItem(
      ctx,
      session.caseId,
      ctx.message,
      userId,
    );
    if (saved) {
      await setBotSession<ProofUploadSession>(
        ctx.appEnv,
        'proof_upload',
        userId,
        { ...session, count: session.count + 1 },
      );
      const isId = ctx.locale === 'id-ID';
      await ctx.reply(
        isId
          ? `📎 Bukti #${session.count + 1} tercatat. Kirim lagi atau tekan Selesai.`
          : `📎 Evidence #${session.count + 1} saved. Send more or tap Done.`,
        {
          reply_markup: new InlineKeyboard().text(
            isId ? '✅ Selesai' : '✅ Done',
            `mod:proof:done:${session.actionId}`,
          ),
        },
      );
    }
  },
);

onCommand(moderationComposer, ['tckick', 'tck'], async (ctx) => {
  if (ctx.chat?.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role) || !role) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === actorId) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const guard = await checkTargetModerationGuard(
    ctx,
    role,
    target.userId,
    ctx.message?.reply_to_message?.from,
  );
  if (!guard.ok) return;

  const reason = formatModerationReason(
    target.remainingArgs.join(' '),
    'Kicked by staff',
  );
  let ref = 'local';
  let actionId: number | null = null;

  const chatId = ctx.chat?.id ?? 0;
  if (ctx.supabase) {
    await demoteTargetStaffRoleIfNeeded(
      ctx,
      target.userId,
      guard.targetRole,
      actorId || null,
    );
  }
  if (ctx.chat) {
    await syncModerationAcrossGroups({
      api: ctx.api,
      supabase: null,
      operation: 'kick',
      targetUserId: target.userId,
      chatIds: [chatId],
    });
  }

  if (ctx.supabase) {
    await ensureTargetPlaceholderUser(ctx, target.userId);
    const { data: created } = await ctx.supabase
      .from('moderation_actions')
      .insert({
        chat_id: chatId,
        origin_chat_id: chatId,
        action_type: 'kick',
        target_user_id: target.userId,
        actor_user_id: actorId || null,
        reason,
        status: 'completed',
        scope_type: 'chat',
      })
      .select('id, external_ref')
      .single();
    if (created) {
      ref = created.external_ref;
      actionId = created.id;
    }

    if (
      actionId &&
      ctx.message?.reply_to_message &&
      extractMediaMeta(ctx.message.reply_to_message)
    ) {
      const caseId = await ensureCaseForAction(
        ctx,
        actionId,
        target.userId,
        actorId || null,
        reason,
      );
      if (caseId) {
        await recordProofMediaItem(
          ctx,
          caseId,
          ctx.message.reply_to_message,
          actorId || null,
        );
      }
    }

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'moderation.kick',
      entityType: 'moderation_action',
      entityId: ref,
      actorUserId: actorId || null,
      subjectUserId: target.userId,
      chatId,
      actionId,
      payload: { reason },
    });
  }

  await sendModerationAuditLog(ctx, {
    action: 'kick',
    targetLabel: target.label,
    targetId: target.userId,
    actorId: actorId || null,
    chatId: chatId || null,
    ref,
    reason,
    affectedGroups: 1,
  });

  const { formatted, keyboard } = buildModerationActionCard({
    locale: ctx.locale,
    title: isId ? '👢 Pengguna Dikeluarkan' : '👢 User Kicked',
    targetLabel: target.label,
    targetId: target.userId,
    reason,
    ref,
    actionType: 'warn',
    actionId,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(moderationComposer, ['tcunwarn', 'tcunw'], async (ctx) => {
  if (ctx.chat?.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }

  const chatId = ctx.chat?.id ?? 0;
  let removedRef: string | null = null;
  if (ctx.supabase) {
    const { data: latestWarn } = await ctx.supabase
      .from('moderation_actions')
      .select('id, external_ref')
      .eq('chat_id', chatId)
      .eq('target_user_id', target.userId)
      .eq('action_type', 'warn')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestWarn) {
      await ctx.reply(
        isId
          ? `${target.label} tidak memiliki peringatan aktif di grup ini.`
          : `${target.label} has no active warnings in this group.`,
      );
      return;
    }

    removedRef = latestWarn.external_ref;
    await ctx.supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: actorId || null,
      })
      .eq('id', latestWarn.id);

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'moderation.unwarn',
      entityType: 'moderation_action',
      entityId: latestWarn.external_ref,
      actorUserId: actorId || null,
      subjectUserId: target.userId,
      chatId,
      actionId: latestWarn.id,
    });
  }

  await sendModerationAuditLog(ctx, {
    action: 'unwarn',
    targetLabel: target.label,
    targetId: target.userId,
    actorId: actorId || null,
    chatId: chatId || null,
    ref: removedRef,
  });

  const { formatted, keyboard } = buildModerationRevokedCard({
    locale: ctx.locale,
    title: isId ? '✅ Peringatan Dicabut' : '✅ Warning Removed',
    targetLabel: target.label,
    targetId: target.userId,
    count: 1,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(moderationComposer, ['warns', 'warnlist'], async (ctx) => {
  if (ctx.chat?.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }
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
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }

  const snap = await fetchUserModerationSnapshot(ctx, target.userId);
  const { formatted, keyboard } = buildEnhancedCheckCard({
    locale: ctx.locale,
    targetLabel: target.label,
    targetId: target.userId,
    ...snap,
    showStaffActions: true,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(moderationComposer, ['resetwarns', 'clearwarns'], async (ctx) => {
  if (ctx.chat?.type === 'private') {
    await ctx.reply(t(ctx.locale, 'err.group_only'));
    return;
  }
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role)) {
    await ctx.reply(t(ctx.locale, 'err.staff_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }

  const chatId = ctx.chat?.id ?? 0;
  let clearedCount = 0;
  if (ctx.supabase) {
    const { data: revoked } = await ctx.supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: actorId || null,
      })
      .eq('chat_id', chatId)
      .eq('target_user_id', target.userId)
      .eq('action_type', 'warn')
      .eq('status', 'completed')
      .select('id');

    clearedCount = revoked?.length ?? 0;
    if (clearedCount === 0) {
      await ctx.reply(
        isId
          ? `${target.label} tidak memiliki peringatan aktif untuk direset.`
          : `${target.label} has no active warnings to clear.`,
      );
      return;
    }

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'moderation.reset_warns',
      entityType: 'telegram_user',
      entityId: String(target.userId),
      actorUserId: actorId || null,
      subjectUserId: target.userId,
      chatId,
      payload: { clearedCount },
    });
  }

  await sendModerationAuditLog(ctx, {
    action: 'resetwarns',
    targetLabel: target.label,
    targetId: target.userId,
    actorId: actorId || null,
    chatId: chatId || null,
    clearedCount,
  });

  const { formatted, keyboard } = buildModerationRevokedCard({
    locale: ctx.locale,
    title: isId ? '🧹 Semua Peringatan Direset' : '🧹 All Warnings Cleared',
    targetLabel: target.label,
    targetId: target.userId,
    count: clearedCount || 1,
  });

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});
