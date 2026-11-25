import { autoRetry } from '@grammyjs/auto-retry';
import { type Api, Bot } from 'grammy';
import { hasSupabaseConfig } from './env';
import { createSupabaseAdmin, type TypedSupabaseClient } from './supabase';

export type EnforcementOperation = 'ban' | 'unban' | 'mute' | 'unmute' | 'kick';

const UNRESTRICT_PERMISSIONS = {
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
} as const;

async function applyTelegramActionInChat(
  api: Api,
  operation: EnforcementOperation,
  chatId: number,
  targetUserId: number,
  expiresAtIso?: string | null,
): Promise<void> {
  const untilDate = expiresAtIso
    ? Math.floor(new Date(expiresAtIso).getTime() / 1000)
    : undefined;

  if (operation === 'ban') {
    // Demote first if target happens to be a group admin (best-effort, ignore errors)
    await api
      .promoteChatMember(chatId, targetUserId, {
        can_manage_chat: false,
        can_delete_messages: false,
        can_manage_video_chats: false,
        can_restrict_members: false,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
      })
      .catch(() => {});
    await api.banChatMember(
      chatId,
      targetUserId,
      untilDate ? { until_date: untilDate } : undefined,
    );
    return;
  }

  if (operation === 'unban') {
    await api.unbanChatMember(chatId, targetUserId, { only_if_banned: true });
    return;
  }

  if (operation === 'mute') {
    await api.restrictChatMember(
      chatId,
      targetUserId,
      { can_send_messages: false },
      untilDate ? { until_date: untilDate } : undefined,
    );
    return;
  }

  if (operation === 'unmute') {
    await api.restrictChatMember(chatId, targetUserId, UNRESTRICT_PERMISSIONS);
    return;
  }

  if (operation === 'kick') {
    await api.banChatMember(chatId, targetUserId);
    await api.unbanChatMember(chatId, targetUserId, { only_if_banned: true });
  }
}

export interface SyncModerationInput {
  api: Api;
  supabase: TypedSupabaseClient | null;
  actionId?: number | null;
  operation: EnforcementOperation;
  targetUserId: number;
  actorUserId?: number | null;
  expiresAtIso?: string | null;
  chatIds: number[];
}

export interface SyncModerationResult {
  okCount: number;
  failCount: number;
  failedChatIds: number[];
  runId: number | null;
}

/**
 * Enforces a moderation action across connected chats and records
 * `moderation_enforcement_runs`, `moderation_enforcement_targets`, and
 * `moderation_enforcement_attempts` for repairability via `/tcrepair` and cron.
 */
export async function syncModerationAcrossGroups(
  input: SyncModerationInput,
): Promise<SyncModerationResult> {
  const {
    api,
    supabase,
    actionId,
    operation,
    targetUserId,
    actorUserId,
    expiresAtIso,
    chatIds,
  } = input;

  if (chatIds.length === 0) {
    return { okCount: 0, failCount: 0, failedChatIds: [], runId: null };
  }

  let runId: number | null = null;
  const nowIso = new Date().toISOString();

  if (supabase && actionId) {
    const { data: run } = await supabase
      .from('moderation_enforcement_runs')
      .insert({
        action_id: actionId,
        operation,
        requested_by_user_id: actorUserId ?? null,
        status: 'running',
        target_count: chatIds.length,
        started_at: nowIso,
      })
      .select('id')
      .single();
    runId = run?.id ?? null;
  }

  const settled = await Promise.allSettled(
    chatIds.map(async (cid) => {
      await applyTelegramActionInChat(
        api,
        operation,
        cid,
        targetUserId,
        expiresAtIso,
      );
      return cid;
    }),
  );

  let okCount = 0;
  let failCount = 0;
  const failedChatIds: number[] = [];
  const targetRows: Array<{
    chat_id: number;
    run_id: number;
    status: string;
    attempt_count: number;
    first_attempt_at: string;
    last_attempt_at: string;
    completed_at: string | null;
    last_error_detail: string | null;
    next_retry_at: string | null;
  }> = [];

  const retryAtIso = new Date(Date.now() + 5 * 60_000).toISOString();

  settled.forEach((res, idx) => {
    const cid = chatIds[idx];
    if (res.status === 'fulfilled') {
      okCount += 1;
      if (runId !== null) {
        targetRows.push({
          chat_id: cid,
          run_id: runId,
          status: 'succeeded',
          attempt_count: 1,
          first_attempt_at: nowIso,
          last_attempt_at: nowIso,
          completed_at: nowIso,
          last_error_detail: null,
          next_retry_at: null,
        });
      }
    } else {
      failCount += 1;
      failedChatIds.push(cid);
      const errMsg =
        res.reason instanceof Error
          ? res.reason.message
          : String(res.reason ?? 'Unknown error');
      if (runId !== null) {
        targetRows.push({
          chat_id: cid,
          run_id: runId,
          status: 'failed',
          attempt_count: 1,
          first_attempt_at: nowIso,
          last_attempt_at: nowIso,
          completed_at: null,
          last_error_detail: errMsg.slice(0, 500),
          next_retry_at: retryAtIso,
        });
      }
    }
  });

  if (supabase && runId !== null) {
    if (targetRows.length > 0) {
      await supabase.from('moderation_enforcement_targets').insert(targetRows);
    }
    await supabase
      .from('moderation_enforcement_runs')
      .update({
        status:
          failCount === 0
            ? 'completed'
            : okCount === 0
              ? 'failed'
              : 'partial_failure',
        succeeded_count: okCount,
        failed_count: failCount,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
  }

  return { okCount, failCount, failedChatIds, runId };
}

export async function syncUnbanToTelegram(
  env: Pick<CloudflareBindings, 'TELEGRAM_BOT_TOKEN'>,
  supabase: TypedSupabaseClient,
  targetUserId: number,
  notifyText?: string,
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;

  const bot = new Bot(token);
  bot.api.config.use(autoRetry());

  const { data: connected } = await supabase
    .from('connected_chats')
    .select('chat_id')
    .eq('is_active', true);

  const chatIds = (connected ?? []).map((row) => row.chat_id);
  if (chatIds.length > 0) {
    await Promise.allSettled(
      chatIds.map((cid) =>
        bot.api.unbanChatMember(cid, targetUserId, { only_if_banned: true }),
      ),
    );
  }

  if (notifyText) {
    await bot.api.sendMessage(targetUserId, notifyText).catch(() => {});
  }
}

export async function expireDueModerationActions(
  env: CloudflareBindings,
): Promise<{ expiredCount: number }> {
  if (!hasSupabaseConfig(env)) {
    return { expiredCount: 0 };
  }

  const supabase = createSupabaseAdmin(env);
  const nowIso = new Date().toISOString();

  const { data: dueActions, error } = await supabase
    .from('moderation_actions')
    .select('id, action_type, target_user_id')
    .in('action_type', ['ban', 'mute'])
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lte('expires_at', nowIso)
    .limit(50);

  if (error || !dueActions || dueActions.length === 0) {
    return { expiredCount: 0 };
  }

  const dueIds = dueActions.map((a) => a.id);
  await supabase
    .from('moderation_actions')
    .update({ status: 'expired' })
    .in('id', dueIds);

  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { expiredCount: dueActions.length };
  }

  const bot = new Bot(token);
  bot.api.config.use(autoRetry());

  const { data: connected } = await supabase
    .from('connected_chats')
    .select('chat_id')
    .eq('is_active', true);
  const chatIds = (connected ?? []).map((row) => row.chat_id);

  if (chatIds.length > 0) {
    await Promise.allSettled(
      dueActions.flatMap((act) =>
        chatIds.map((cid) =>
          act.action_type === 'ban'
            ? bot.api.unbanChatMember(cid, act.target_user_id, {
                only_if_banned: true,
              })
            : bot.api.restrictChatMember(
                cid,
                act.target_user_id,
                UNRESTRICT_PERMISSIONS,
              ),
        ),
      ),
    );
  }

  return { expiredCount: dueActions.length };
}

/**
 * Retries failed enforcement targets whose `attempt_count < 5` and `next_retry_at <= now`.
 */
export async function retryPendingEnforcementTargets(
  env: CloudflareBindings,
  limit = 25,
): Promise<{ retried: number; succeeded: number; failed: number }> {
  if (!hasSupabaseConfig(env) || !env.TELEGRAM_BOT_TOKEN?.trim()) {
    return { retried: 0, succeeded: 0, failed: 0 };
  }

  const supabase = createSupabaseAdmin(env);
  const nowIso = new Date().toISOString();

  const { data: targets } = await supabase
    .from('moderation_enforcement_targets')
    .select('id, run_id, chat_id, attempt_count')
    .in('status', ['failed', 'pending'])
    .lt('attempt_count', 5)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .limit(limit);

  if (!targets || targets.length === 0) {
    return { retried: 0, succeeded: 0, failed: 0 };
  }

  const runIds = Array.from(new Set(targets.map((t) => t.run_id)));
  const { data: runs } = await supabase
    .from('moderation_enforcement_runs')
    .select('id, action_id, operation')
    .in('id', runIds);

  const actionIds = Array.from(new Set((runs ?? []).map((r) => r.action_id)));
  const { data: actions } =
    actionIds.length > 0
      ? await supabase
          .from('moderation_actions')
          .select('id, target_user_id, expires_at')
          .in('id', actionIds)
      : { data: [] };

  const runMap = new Map((runs ?? []).map((r) => [r.id, r]));
  const actionMap = new Map((actions ?? []).map((a) => [a.id, a]));

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN.trim());
  bot.api.config.use(autoRetry());

  let succeeded = 0;
  let failed = 0;

  for (const target of targets) {
    const run = runMap.get(target.run_id);
    const act = run ? actionMap.get(run.action_id) : undefined;
    if (!run || !act) continue;

    const nextAttempt = target.attempt_count + 1;
    try {
      await applyTelegramActionInChat(
        bot.api,
        run.operation as EnforcementOperation,
        target.chat_id,
        act.target_user_id,
        act.expires_at,
      );
      succeeded += 1;
      await supabase
        .from('moderation_enforcement_targets')
        .update({
          status: 'succeeded',
          attempt_count: nextAttempt,
          last_attempt_at: nowIso,
          completed_at: nowIso,
          last_error_detail: null,
          next_retry_at: null,
        })
        .eq('id', target.id);
      await supabase.from('moderation_enforcement_attempts').insert({
        target_id: target.id,
        attempt_number: nextAttempt,
        outcome: 'succeeded',
      });
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      const exhausted = nextAttempt >= 5;
      await supabase
        .from('moderation_enforcement_targets')
        .update({
          status: exhausted ? 'exhausted' : 'failed',
          attempt_count: nextAttempt,
          last_attempt_at: nowIso,
          last_error_detail: msg.slice(0, 500),
          next_retry_at: exhausted
            ? null
            : new Date(Date.now() + nextAttempt * 10 * 60_000).toISOString(),
        })
        .eq('id', target.id);
      await supabase.from('moderation_enforcement_attempts').insert({
        target_id: target.id,
        attempt_number: nextAttempt,
        outcome: 'failed',
        error_detail: msg.slice(0, 500),
      });
    }
  }

  return { retried: targets.length, succeeded, failed };
}

/**
 * Releases expired 12h reviewer locks and flags >72h stale pending appeals.
 */
export async function releaseStaleAppeals(
  env: CloudflareBindings,
): Promise<{ unlocked: number }> {
  if (!hasSupabaseConfig(env)) return { unlocked: 0 };
  const supabase = createSupabaseAdmin(env);

  const { data: pending } = await supabase
    .from('moderation_appeals')
    .select('id, metadata, submitted_at')
    .eq('status', 'pending')
    .limit(100);

  if (!pending || pending.length === 0) return { unlocked: 0 };

  const now = Date.now();
  let unlocked = 0;

  for (const row of pending) {
    const meta =
      row.metadata &&
      typeof row.metadata === 'object' &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const lockedUntil =
      typeof meta.locked_until === 'string'
        ? new Date(meta.locked_until).getTime()
        : 0;
    const submittedAt = new Date(row.submitted_at).getTime();
    const isStale72h = now - submittedAt > 72 * 3600 * 1000;

    if (
      (lockedUntil > 0 && lockedUntil <= now) ||
      (isStale72h && meta.locked_by)
    ) {
      const nextMeta = { ...meta };
      delete nextMeta.locked_by;
      delete nextMeta.locked_until;
      await supabase
        .from('moderation_appeals')
        .update({ metadata: nextMeta as never })
        .eq('id', row.id);
      unlocked += 1;
    }
  }

  return { unlocked };
}
