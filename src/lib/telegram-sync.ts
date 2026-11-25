import { autoRetry } from '@grammyjs/auto-retry';
import { Bot } from 'grammy';
import { hasSupabaseConfig } from './env';
import { createSupabaseAdmin, type TypedSupabaseClient } from './supabase';

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
            : bot.api.restrictChatMember(cid, act.target_user_id, {
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
      ),
    );
  }

  return { expiredCount: dueActions.length };
}
