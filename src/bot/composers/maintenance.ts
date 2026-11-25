import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import { retryPendingEnforcementTargets } from '../../lib/telegram-sync';
import type { BotContext } from '../context';
import {
  getUserRole,
  isAdminOrOwner,
  recordAuditEvent,
  resolveTargetUser,
} from '../db';
import { t } from '../i18n';
import { getCommandArgs, onCommand } from '../prefixes';

export const maintenanceComposer = new Composer<BotContext>();

onCommand(maintenanceComposer, ['cleanup', 'tcclean', 'tcc'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }
  if (!ctx.supabase) {
    await ctx.reply(t(ctx.locale, 'err.db_unconfigured'));
    return;
  }

  const { data: activeChats } = await ctx.supabase
    .from('connected_chats')
    .select('chat_id')
    .eq('is_active', true);

  const chatIds = (activeChats ?? []).map((c) => c.chat_id);
  if (chatIds.length === 0) {
    await ctx.reply(
      isId
        ? 'Tidak ada grup aktif untuk diperiksa.'
        : 'No active groups to inspect.',
    );
    return;
  }

  const ghostIds: number[] = [];
  if (ctx.me?.id) {
    for (const cid of chatIds) {
      try {
        const member = await ctx.api.getChatMember(cid, ctx.me.id);
        if (member.status === 'left' || member.status === 'kicked') {
          ghostIds.push(cid);
        }
      } catch {
        ghostIds.push(cid);
      }
    }
  }

  if (ghostIds.length === 0) {
    await ctx.reply(
      isId
        ? `✅ Semua ${chatIds.length} grup aktif masih valid.`
        : `✅ All ${chatIds.length} active groups are reachable.`,
    );
    return;
  }

  const prompt = fmt`${b}${isId ? '🧹 Pembersihan Grup Ghost' : '🧹 Ghost Group Cleanup'}${b}
${isId ? `Ditemukan ${ghostIds.length} grup yang tidak lagi terjangkau dari ${chatIds.length} grup aktif.` : `Found ${ghostIds.length} unreachable group(s) out of ${chatIds.length} active.`}`;

  const kb = new InlineKeyboard()
    .text(
      isId ? '✅ Nonaktifkan Grup Ghost' : '✅ Deactivate Ghost Groups',
      `maint:cleanup:confirm:${actorId}`,
    )
    .text(isId ? '❌ Batal' : '❌ Cancel', `maint:cleanup:cancel:${actorId}`);

  await ctx.reply(prompt.text, {
    entities: prompt.entities,
    reply_markup: kb,
  });
});

maintenanceComposer.callbackQuery(
  /^maint:cleanup:(confirm|cancel):(\d+)$/,
  async (ctx) => {
    const decision = ctx.match[1];
    const expectedActor = Number(ctx.match[2]);
    const actorId = ctx.from.id;
    const isId = ctx.locale === 'id-ID';

    if (actorId !== expectedActor) {
      await ctx.answerCallbackQuery({
        text: isId ? 'Bukan pemrakarsa perintah.' : 'Not the initiator.',
        show_alert: true,
      });
      return;
    }

    if (decision === 'cancel') {
      await ctx.answerCallbackQuery({
        text: isId ? 'Dibatalkan.' : 'Cancelled.',
      });
      await ctx
        .editMessageText(
          isId ? '❌ Pembersihan dibatalkan.' : '❌ Cleanup cancelled.',
          { reply_markup: new InlineKeyboard() },
        )
        .catch(() => {});
      return;
    }

    if (!ctx.supabase) return;
    const { data: activeChats } = await ctx.supabase
      .from('connected_chats')
      .select('chat_id')
      .eq('is_active', true);

    const ghostIds: number[] = [];
    for (const row of activeChats ?? []) {
      try {
        if (ctx.me?.id) {
          const member = await ctx.api.getChatMember(row.chat_id, ctx.me.id);
          if (member.status === 'left' || member.status === 'kicked') {
            ghostIds.push(row.chat_id);
          }
        }
      } catch {
        ghostIds.push(row.chat_id);
      }
    }

    if (ghostIds.length > 0) {
      await ctx.supabase
        .from('connected_chats')
        .update({
          is_active: false,
        })
        .in('chat_id', ghostIds);

      await recordAuditEvent(ctx.supabase, {
        eventKey: 'maintenance.cleanup',
        entityType: 'connected_chat',
        entityId: String(ghostIds.length),
        actorUserId: actorId,
        payload: { ghostIds },
      });
    }

    await ctx.answerCallbackQuery({
      text: isId ? 'Pembersihan selesai.' : 'Cleanup complete.',
    });
    await ctx
      .editMessageText(
        isId
          ? `✅ ${ghostIds.length} grup ghost dinonaktifkan.`
          : `✅ Deactivated ${ghostIds.length} ghost group(s).`,
        { reply_markup: new InlineKeyboard() },
      )
      .catch(() => {});
  },
);

onCommand(
  maintenanceComposer,
  ['leaveall', 'exitall', 'tcleave'],
  async (ctx) => {
    const isId = ctx.locale === 'id-ID';
    const actorId = ctx.from?.id ?? 0;
    const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
    if (role !== 'owner') {
      await ctx.reply(t(ctx.locale, 'err.owner_only'));
      return;
    }

    const prompt = fmt`${b}${isId ? '⚠️ Konfirmasi Leave All' : '⚠️ Confirm Leave All'}${b}
${isId ? 'Bot akan keluar dari semua grup non-primer yang terhubung dan menonaktifkannya.' : 'The bot will leave all non-primary connected groups and mark them inactive.'}`;

    const kb = new InlineKeyboard()
      .text(
        isId ? '✅ Ya, Keluar Semua' : '✅ Yes, Leave All',
        `maint:leaveall:confirm:${actorId}`,
      )
      .text(
        isId ? '❌ Batal' : '❌ Cancel',
        `maint:leaveall:cancel:${actorId}`,
      );

    await ctx.reply(prompt.text, {
      entities: prompt.entities,
      reply_markup: kb,
    });
  },
);

maintenanceComposer.callbackQuery(
  /^maint:leaveall:(confirm|cancel):(\d+)$/,
  async (ctx) => {
    const decision = ctx.match[1];
    const expectedActor = Number(ctx.match[2]);
    const actorId = ctx.from.id;
    const isId = ctx.locale === 'id-ID';

    if (actorId !== expectedActor) {
      await ctx.answerCallbackQuery({
        text: isId ? 'Bukan pemrakarsa perintah.' : 'Not the initiator.',
        show_alert: true,
      });
      return;
    }

    if (decision === 'cancel') {
      await ctx.answerCallbackQuery({
        text: isId ? 'Dibatalkan.' : 'Cancelled.',
      });
      await ctx
        .editMessageText(
          isId ? '❌ Leaveall dibatalkan.' : '❌ Leaveall cancelled.',
          { reply_markup: new InlineKeyboard() },
        )
        .catch(() => {});
      return;
    }

    if (!ctx.supabase) return;
    const { data: activeChats } = await ctx.supabase
      .from('connected_chats')
      .select('chat_id')
      .eq('is_active', true);

    const primaryGroupId = Number(ctx.appEnv.MAIN_GROUP || '0');
    const targets = (activeChats ?? []).filter(
      (c) => !primaryGroupId || c.chat_id !== primaryGroupId,
    );
    let leftCount = 0;
    for (const c of targets) {
      const ok = await ctx.api
        .leaveChat(c.chat_id)
        .then(() => true)
        .catch(() => false);
      if (ok) leftCount += 1;
      await ctx.supabase
        .from('connected_chats')
        .update({
          is_active: false,
        })
        .eq('chat_id', c.chat_id);
    }

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'maintenance.leaveall',
      entityType: 'connected_chat',
      entityId: String(leftCount),
      actorUserId: actorId,
      payload: { totalNonPrimary: targets.length, leftCount },
    });

    await ctx.answerCallbackQuery({
      text: isId ? 'Selesai.' : 'Done.',
    });
    await ctx
      .editMessageText(
        isId
          ? `✅ Bot keluar dari ${leftCount}/${targets.length} grup non-primer.`
          : `✅ Left ${leftCount}/${targets.length} non-primary group(s).`,
        { reply_markup: new InlineKeyboard() },
      )
      .catch(() => {});
  },
);

onCommand(maintenanceComposer, ['tcrepair', 'tcr'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  const res = await retryPendingEnforcementTargets(ctx.appEnv, 25);
  if (ctx.supabase) {
    await recordAuditEvent(ctx.supabase, {
      eventKey: 'maintenance.repair',
      entityType: 'moderation_enforcement_target',
      entityId: String(res.retried),
      actorUserId: actorId,
      payload: res,
    });
  }

  const formatted = fmt`${b}${isId ? '🔧 Perbaikan Enforcement' : '🔧 Enforcement Repair'}${b}
• ${isId ? 'Diproses' : 'Retried'}: ${code}${String(res.retried)}${code}
• ${isId ? 'Berhasil' : 'Succeeded'}: ${code}${String(res.succeeded)}${code}
• ${isId ? 'Gagal' : 'Failed'}: ${code}${String(res.failed)}${code}`;

  await ctx.reply(formatted.text, { entities: formatted.entities });
});

onCommand(maintenanceComposer, ['tcforget', 'tcf'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const args = getCommandArgs(ctx).trim();

  let targetId = actorId;
  if (args) {
    const role = await getUserRole(ctx.supabase, actorId, ctx.appEnv.OWNER_ID);
    if (role !== 'owner') {
      await ctx.reply(t(ctx.locale, 'err.owner_only'));
      return;
    }
    const target = await resolveTargetUser(
      ctx.supabase,
      args,
      ctx.message?.reply_to_message?.from,
    );
    if (!target) {
      await ctx.reply(t(ctx.locale, 'err.target_missing'));
      return;
    }
    targetId = target.userId;
  }

  const prompt = fmt`${b}${isId ? '🗑️ Konfirmasi Penghapusan Data (GDPR)' : '🗑️ Confirm Data Erasure'}${b}
${b}Target User ID:${b} ${code}${String(targetId)}${code}
${isId ? 'Nama, username, dan preferensi bahasa akan dianonimkan. Catatan moderasi/audit tetap dipertahankan untuk integritas federasi.' : 'Display name, username, and language preferences will be anonymized. Moderation/audit records are retained for federation integrity.'}`;

  const kb = new InlineKeyboard()
    .text(
      isId ? '✅ Ya, Anonimkan Data' : '✅ Confirm Erasure',
      `maint:forget:confirm:${targetId}:${actorId}`,
    )
    .text(
      isId ? '❌ Batal' : '❌ Cancel',
      `maint:forget:cancel:${targetId}:${actorId}`,
    );

  await ctx.reply(prompt.text, {
    entities: prompt.entities,
    reply_markup: kb,
  });
});

maintenanceComposer.callbackQuery(
  /^maint:forget:(confirm|cancel):(\d+):(\d+)$/,
  async (ctx) => {
    const decision = ctx.match[1];
    const targetId = Number(ctx.match[2]);
    const expectedActor = Number(ctx.match[3]);
    const actorId = ctx.from.id;
    const isId = ctx.locale === 'id-ID';

    if (actorId !== expectedActor) {
      await ctx.answerCallbackQuery({
        text: isId ? 'Bukan pemrakarsa perintah.' : 'Not the initiator.',
        show_alert: true,
      });
      return;
    }

    if (decision === 'cancel') {
      await ctx.answerCallbackQuery({
        text: isId ? 'Dibatalkan.' : 'Cancelled.',
      });
      await ctx
        .editMessageText(
          isId
            ? '❌ Penghapusan data dibatalkan.'
            : '❌ Data erasure cancelled.',
          { reply_markup: new InlineKeyboard() },
        )
        .catch(() => {});
      return;
    }

    if (!ctx.supabase) return;
    const nowIso = new Date().toISOString();

    await ctx.supabase
      .from('telegram_users')
      .update({
        username: null,
        first_name: 'Deleted User',
        last_name: null,
        language_code: null,
      })
      .eq('user_id', targetId);

    await ctx.supabase.from('user_settings').delete().eq('user_id', targetId);

    await ctx.supabase.from('telegram_user_erasures').insert({
      user_id: targetId,
      processed_by_user_id: actorId,
      processed_at: nowIso,
      status: 'completed',
      source: targetId === actorId ? 'self_service' : 'owner_command',
      affected: { tables: ['telegram_users', 'user_settings'] } as never,
    });

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'privacy.erasure',
      entityType: 'telegram_user',
      entityId: String(targetId),
      actorUserId: actorId,
      subjectUserId: targetId,
    });

    await ctx.answerCallbackQuery({
      text: isId ? 'Data dianonimkan.' : 'Data anonymized.',
    });
    await ctx
      .editMessageText(
        isId
          ? `✅ Data pribadi untuk user ${targetId} telah dianonimkan.`
          : `✅ Personal data for user ${targetId} has been anonymized.`,
        { reply_markup: new InlineKeyboard() },
      )
      .catch(() => {});
  },
);
