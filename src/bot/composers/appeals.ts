import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import { syncUnbanToTelegram } from '../../lib/telegram-sync';
import type { BotContext } from '../context';
import { getUserRole, isStaffRole, recordAuditEvent } from '../db';
import { t } from '../i18n';
import { getCommandArgs, onCommand } from '../prefixes';
import { clearBotSession, getBotSession, setBotSession } from '../session';

const REJECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const REVIEWER_LOCK_MS = 12 * 60 * 60 * 1000;

export const appealsComposer = new Composer<BotContext>();

interface AppealSubmitSession {
  actionId: number;
  banRef: string;
  banReason: string | null;
}

async function submitAppealRecord(
  ctx: BotContext,
  params: {
    userId: number;
    actionId: number;
    banRef: string;
    banReason: string | null;
    appealText: string;
  },
): Promise<void> {
  const isId = ctx.locale === 'id-ID';
  if (!ctx.supabase) {
    await ctx.reply(t(ctx.locale, 'err.db_unconfigured'));
    return;
  }

  const { data: inserted, error } = await ctx.supabase
    .from('moderation_appeals')
    .insert({
      action_id: params.actionId,
      appellant_user_id: params.userId,
      appeal_text: params.appealText.slice(0, 2000),
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !inserted) {
    await ctx.reply(
      isId
        ? 'Gagal menyimpan banding. Coba lagi nanti.'
        : 'Failed to submit appeal. Please try again later.',
    );
    return;
  }

  await recordAuditEvent(ctx.supabase, {
    eventKey: 'appeal.submitted',
    entityType: 'moderation_appeal',
    entityId: String(inserted.id),
    actorUserId: params.userId,
    subjectUserId: params.userId,
    actionId: params.actionId,
    payload: { banRef: params.banRef },
  });

  const reviewTargetChat = Number(
    ctx.appEnv.APPEALS || ctx.appEnv.LOGS || ctx.appEnv.OWNER_ID || '0',
  );
  if (Number.isFinite(reviewTargetChat) && reviewTargetChat !== 0) {
    const reviewCard = fmt`${b}⚖️ Banding Baru #${String(inserted.id)}${b}
${b}Pemohon:${b} ${code}${String(params.userId)}${code}
${b}Ref Ban:${b} ${code}${params.banRef}${code}
${b}Alasan Ban:${b} ${params.banReason ?? '-'}
${b}Penjelasan Pemohon:${b} ${params.appealText.slice(0, 800)}`;

    const reviewKeyboard = new InlineKeyboard()
      .text('🔒 Klaim (12j)', `appeal:claim:${inserted.id}`)
      .row()
      .text('✅ Setujui', `appeal:approve:${inserted.id}`)
      .text('❌ Tolak', `appeal:reject:${inserted.id}`);

    await ctx.api
      .sendMessage(reviewTargetChat, reviewCard.text, {
        entities: reviewCard.entities,
        reply_markup: reviewKeyboard,
      })
      .catch(() => {});
  }

  const formatted = fmt`${b}${isId ? '📩 Banding Terkirim' : '📩 Appeal Submitted'}${b}
${b}Ref:${b} ${code}${params.banRef}${code}
${isId ? 'Banding Anda masuk ke antrean peninjauan moderator.' : 'Your appeal has been queued for moderator review.'}`;

  const keyboard = new InlineKeyboard().text(
    isId ? '✖ Tutup' : '✖ Close',
    'nav:close',
  );

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
}

async function validateAppealEligibility(
  ctx: BotContext,
  userId: number,
  banRef?: string,
): Promise<{
  ok: boolean;
  actionId?: number;
  banRef?: string;
  banReason?: string | null;
  errorMsg?: string;
}> {
  const isId = ctx.locale === 'id-ID';
  if (!ctx.supabase) {
    return { ok: false, errorMsg: t(ctx.locale, 'err.db_unconfigured') };
  }

  let query = ctx.supabase
    .from('moderation_actions')
    .select('id, external_ref, status, reason')
    .eq('target_user_id', userId)
    .eq('action_type', 'ban')
    .eq('status', 'active');

  if (banRef) {
    query = query.eq('external_ref', banRef);
  } else {
    query = query.order('created_at', { ascending: false }).limit(1);
  }

  const { data: banAction } = await query.maybeSingle();

  if (!banAction) {
    return {
      ok: false,
      errorMsg: isId
        ? 'Ban aktif dengan kode tersebut tidak ditemukan untuk akun Anda.'
        : 'No active ban with that reference was found for your account.',
    };
  }

  const { data: existingPending } = await ctx.supabase
    .from('moderation_appeals')
    .select('id')
    .eq('action_id', banAction.id)
    .eq('appellant_user_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingPending) {
    return {
      ok: false,
      errorMsg: isId
        ? 'Anda sudah memiliki banding yang sedang menunggu peninjauan.'
        : 'You already have a pending appeal under review.',
    };
  }

  const { data: lastRejected } = await ctx.supabase
    .from('moderation_appeals')
    .select('resolved_at')
    .eq('action_id', banAction.id)
    .eq('appellant_user_id', userId)
    .eq('status', 'rejected')
    .order('resolved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRejected?.resolved_at) {
    const elapsed = Date.now() - new Date(lastRejected.resolved_at).getTime();
    if (elapsed < REJECTION_COOLDOWN_MS) {
      const remainingHours = Math.ceil(
        (REJECTION_COOLDOWN_MS - elapsed) / (60 * 60 * 1000),
      );
      return {
        ok: false,
        errorMsg: isId
          ? `Banding Anda sebelumnya ditolak. Tunggu ${remainingHours} jam sebelum mengajukan ulang.`
          : `Your previous appeal was rejected. Please wait ${remainingHours} hour(s) before re-applying.`,
      };
    }
  }

  return {
    ok: true,
    actionId: banAction.id,
    banRef: banAction.external_ref,
    banReason: banAction.reason,
  };
}

// Deep link: /start appeal_<ban_ref> or /start appeal<ban_ref>
appealsComposer.on('message:text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const match = text.match(/^\/start(?:@\w+)?\s+appeal_?([A-Za-z0-9_-]+)$/i);
  if (!match || ctx.chat.type !== 'private') {
    await next();
    return;
  }

  const isId = ctx.locale === 'id-ID';
  const userId = ctx.from?.id ?? 0;
  const banRef = match[1];
  const check = await validateAppealEligibility(ctx, userId, banRef);
  if (!check.ok || !check.actionId || !check.banRef) {
    await ctx.reply(check.errorMsg ?? 'Cannot start appeal.');
    return;
  }

  await setBotSession<AppealSubmitSession>(
    ctx.appEnv,
    'appeal_submit',
    userId,
    {
      actionId: check.actionId,
      banRef: check.banRef,
      banReason: check.banReason ?? null,
    },
  );

  const prompt = fmt`${b}${isId ? '⚖️ Pengajuan Banding' : '⚖️ Submit Appeal'}${b}
${b}Ref Ban:${b} ${code}${check.banRef}${code}
${isId ? 'Silakan kirimkan penjelasan banding Anda (minimal 10 karakter, maksimal 2000 karakter).' : 'Please send your appeal explanation (10 to 2000 characters).'}`;

  const kb = new InlineKeyboard().text(
    isId ? '❌ Batal' : '❌ Cancel',
    'appeal:cancel',
  );
  await ctx.reply(prompt.text, {
    entities: prompt.entities,
    reply_markup: kb,
  });
});

// Group #appeal hashtag listener
appealsComposer.hears(/#appeal\b/i, async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  const isId = ctx.locale === 'id-ID';
  const botUsername = ctx.me?.username;
  const kb = new InlineKeyboard();
  if (botUsername) {
    kb.url(
      isId ? '📩 Ajukan Banding via DM' : '📩 Submit Appeal in DM',
      `https://t.me/${botUsername}?start=appeal`,
    );
  }
  await ctx.reply(
    isId
      ? 'Untuk mengajukan banding, kirim perintah /appeal melalui pesan pribadi (DM) ke bot.'
      : 'To submit an appeal, send /appeal via direct message (DM) to the bot.',
    kb.inline_keyboard.length > 0 ? { reply_markup: kb } : undefined,
  );
});

onCommand(appealsComposer, 'appeal', async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const userId = ctx.from?.id ?? 0;

  if (ctx.chat?.type !== 'private') {
    await ctx.reply(
      isId
        ? 'Silakan kirim perintah /appeal melalui pesan pribadi (DM) ke bot.'
        : 'Please submit /appeal via direct message (DM) to the bot.',
    );
    return;
  }

  const raw = getCommandArgs(ctx).trim();
  const [banRef, ...reasonParts] = raw.split(/\s+/).filter(Boolean);
  const appealText = reasonParts.join(' ').trim();

  // Interactive mode when invoked without full arguments
  if (!banRef || appealText.length === 0) {
    if (!ctx.supabase) {
      const formatted = fmt`${b}${isId ? 'Cara Mengajukan Banding' : 'How to Submit an Appeal'}${b}
Format: /appeal ${code}<kode_ban>${code} ${code}<alasan minimal 10 karakter>${code}`;
      await ctx.reply(formatted.text, { entities: formatted.entities });
      return;
    }

    const check = await validateAppealEligibility(
      ctx,
      userId,
      banRef || undefined,
    );
    if (!check.ok || !check.actionId || !check.banRef) {
      await ctx.reply(
        check.errorMsg ??
          (isId
            ? 'Tidak ada ban aktif untuk diajukan banding.'
            : 'No active ban found to appeal.'),
      );
      return;
    }

    await setBotSession<AppealSubmitSession>(
      ctx.appEnv,
      'appeal_submit',
      userId,
      {
        actionId: check.actionId,
        banRef: check.banRef,
        banReason: check.banReason ?? null,
      },
    );

    const prompt = fmt`${b}${isId ? '⚖️ Pengajuan Banding' : '⚖️ Submit Appeal'}${b}
${b}Ref Ban:${b} ${code}${check.banRef}${code}
${isId ? 'Silakan ketik dan kirim alasan banding Anda (10–2000 karakter).' : 'Please type and send your appeal explanation (10–2000 characters).'}`;

    await ctx.reply(prompt.text, {
      entities: prompt.entities,
      reply_markup: new InlineKeyboard().text(
        isId ? '❌ Batal' : '❌ Cancel',
        'appeal:cancel',
      ),
    });
    return;
  }

  if (appealText.length < 10) {
    const formatted = fmt`${b}${isId ? 'Cara Mengajukan Banding' : 'How to Submit an Appeal'}${b}
Format: /appeal ${code}<kode_ban>${code} ${code}<alasan minimal 10 karakter>${code}`;
    await ctx.reply(formatted.text, { entities: formatted.entities });
    return;
  }

  if (appealText.length > 2000) {
    await ctx.reply(
      isId
        ? 'Teks banding maksimal 2000 karakter.'
        : 'Appeal text must be 2000 characters or fewer.',
    );
    return;
  }

  const check = await validateAppealEligibility(ctx, userId, banRef);
  if (!check.ok || !check.actionId || !check.banRef) {
    await ctx.reply(check.errorMsg ?? 'Cannot submit appeal.');
    return;
  }

  await submitAppealRecord(ctx, {
    userId,
    actionId: check.actionId,
    banRef: check.banRef,
    banReason: check.banReason ?? null,
    appealText,
  });
});

// Handle interactive appeal text in DM
appealsComposer.on('message:text', async (ctx, next) => {
  if (ctx.chat.type !== 'private' || !ctx.from) {
    await next();
    return;
  }
  // Do not intercept slash/prefix commands
  if (/^[/!.]/.test(ctx.message.text.trim())) {
    await next();
    return;
  }

  const session = await getBotSession<AppealSubmitSession>(
    ctx.appEnv,
    'appeal_submit',
    ctx.from.id,
  );
  if (!session) {
    await next();
    return;
  }

  const isId = ctx.locale === 'id-ID';
  const text = ctx.message.text.trim();
  if (text.length < 10) {
    await ctx.reply(
      isId
        ? 'Penjelasan banding minimal 10 karakter. Silakan kirim ulang atau tekan Batal.'
        : 'Appeal text must be at least 10 characters. Please resend or tap Cancel.',
    );
    return;
  }
  if (text.length > 2000) {
    await ctx.reply(
      isId
        ? 'Teks banding maksimal 2000 karakter.'
        : 'Appeal text must be 2000 characters or fewer.',
    );
    return;
  }

  await clearBotSession(ctx.appEnv, 'appeal_submit', ctx.from.id);
  await submitAppealRecord(ctx, {
    userId: ctx.from.id,
    actionId: session.actionId,
    banRef: session.banRef,
    banReason: session.banReason,
    appealText: text,
  });
});

appealsComposer.callbackQuery('appeal:cancel', async (ctx) => {
  await clearBotSession(ctx.appEnv, 'appeal_submit', ctx.from.id);
  const isId = ctx.locale === 'id-ID';
  await ctx.answerCallbackQuery({
    text: isId ? 'Dibatalkan.' : 'Cancelled.',
  });
  await ctx
    .editMessageText(
      isId
        ? '❌ Pengajuan banding dibatalkan.'
        : '❌ Appeal submission cancelled.',
      { reply_markup: new InlineKeyboard() },
    )
    .catch(() => {});
});

appealsComposer.callbackQuery(/^appeal:claim:(\d+)$/, async (ctx) => {
  const appealId = Number(ctx.match[1]);
  const reviewerId = ctx.from.id;
  const isId = ctx.locale === 'id-ID';

  const role = await getUserRole(ctx.supabase, reviewerId, ctx.appEnv.OWNER_ID);
  if (!isStaffRole(role) || !ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.staff_only'),
      show_alert: true,
    });
    return;
  }

  const { data: appeal } = await ctx.supabase
    .from('moderation_appeals')
    .select('id, appellant_user_id, status, metadata')
    .eq('id', appealId)
    .maybeSingle();

  if (appeal?.status !== 'pending') {
    await ctx.answerCallbackQuery({
      text: isId ? 'Banding tidak tersedia.' : 'Appeal unavailable.',
      show_alert: true,
    });
    return;
  }

  if (appeal.appellant_user_id === reviewerId) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Anda tidak dapat meninjau banding Anda sendiri.'
        : 'You cannot review your own appeal.',
      show_alert: true,
    });
    return;
  }

  const meta =
    appeal.metadata &&
    typeof appeal.metadata === 'object' &&
    !Array.isArray(appeal.metadata)
      ? (appeal.metadata as Record<string, unknown>)
      : {};
  const lockedBy = typeof meta.locked_by === 'number' ? meta.locked_by : null;
  const lockedUntil =
    typeof meta.locked_until === 'string'
      ? new Date(meta.locked_until).getTime()
      : 0;

  if (lockedBy && lockedBy !== reviewerId && lockedUntil > Date.now()) {
    await ctx.answerCallbackQuery({
      text: isId
        ? `Sedang diklaim oleh staf ${lockedBy}.`
        : `Currently claimed by staff ${lockedBy}.`,
      show_alert: true,
    });
    return;
  }

  const lockUntilIso = new Date(Date.now() + REVIEWER_LOCK_MS).toISOString();
  await ctx.supabase
    .from('moderation_appeals')
    .update({
      metadata: {
        ...meta,
        locked_by: reviewerId,
        locked_until: lockUntilIso,
      } as never,
    })
    .eq('id', appealId);

  await ctx.answerCallbackQuery({
    text: isId ? 'Banding diklaim selama 12 jam.' : 'Appeal claimed for 12h.',
  });
});

appealsComposer.callbackQuery(
  /^appeal:(approve|reject):(\d+)$/,
  async (ctx) => {
    const action = ctx.match[1] as 'approve' | 'reject';
    const appealId = Number(ctx.match[2]);
    const reviewerId = ctx.from.id;

    const role = await getUserRole(
      ctx.supabase,
      reviewerId,
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
        text: 'Database not configured.',
        show_alert: true,
      });
      return;
    }

    const { data: appeal } = await ctx.supabase
      .from('moderation_appeals')
      .select('id, action_id, appellant_user_id, status, metadata')
      .eq('id', appealId)
      .maybeSingle();

    if (!appeal) {
      await ctx.answerCallbackQuery({
        text: 'Banding tidak ditemukan.',
        show_alert: true,
      });
      return;
    }

    if (appeal.appellant_user_id === reviewerId) {
      await ctx.answerCallbackQuery({
        text: 'Anda tidak dapat meninjau banding Anda sendiri.',
        show_alert: true,
      });
      return;
    }

    if (appeal.status !== 'pending') {
      await ctx.answerCallbackQuery({
        text: 'Banding ini sudah diputuskan sebelumnya.',
        show_alert: true,
      });
      return;
    }

    const meta =
      appeal.metadata &&
      typeof appeal.metadata === 'object' &&
      !Array.isArray(appeal.metadata)
        ? (appeal.metadata as Record<string, unknown>)
        : {};
    const lockedBy = typeof meta.locked_by === 'number' ? meta.locked_by : null;
    const lockedUntil =
      typeof meta.locked_until === 'string'
        ? new Date(meta.locked_until).getTime()
        : 0;
    if (lockedBy && lockedBy !== reviewerId && lockedUntil > Date.now()) {
      await ctx.answerCallbackQuery({
        text: `Banding sedang diklaim oleh staf ${lockedBy}.`,
        show_alert: true,
      });
      return;
    }

    const nextStatus = action === 'approve' ? 'accepted' : 'rejected';
    const nowIso = new Date().toISOString();

    const { error: updateErr } = await ctx.supabase
      .from('moderation_appeals')
      .update({
        status: nextStatus,
        resolved_at: nowIso,
        reviewed_by_user_id: reviewerId,
        decision_note:
          action === 'approve'
            ? 'Disetujui melalui kartu review bot'
            : 'Ditolak melalui kartu review bot',
      })
      .eq('id', appealId)
      .eq('status', 'pending');

    if (updateErr) {
      await ctx.answerCallbackQuery({
        text: 'Gagal memperbarui status banding.',
        show_alert: true,
      });
      return;
    }

    if (action === 'approve') {
      await ctx.supabase
        .from('moderation_actions')
        .update({
          status: 'revoked',
          revoked_at: nowIso,
          revoked_by_user_id: reviewerId,
        })
        .eq('id', appeal.action_id);

      await syncUnbanToTelegram(
        ctx.appEnv,
        ctx.supabase,
        appeal.appellant_user_id,
        'Banding Anda disetujui. Ban pada akun Anda telah dicabut.',
      );
    } else {
      await ctx.api
        .sendMessage(
          appeal.appellant_user_id,
          'Banding Anda ditolak oleh moderator. Anda dapat mengajukan ulang setelah 24 jam.',
        )
        .catch(() => {});
    }

    await recordAuditEvent(ctx.supabase, {
      eventKey: `appeal.${nextStatus}`,
      entityType: 'moderation_appeal',
      entityId: String(appealId),
      actorUserId: reviewerId,
      subjectUserId: appeal.appellant_user_id,
      actionId: appeal.action_id,
      payload: { source: 'telegram_card' },
    });

    await ctx.answerCallbackQuery({
      text: action === 'approve' ? 'Banding disetujui.' : 'Banding ditolak.',
    });

    const cardText = fmt`${b}⚖️ Banding #${String(appealId)} — ${
      action === 'approve' ? 'DISETUJUI' : 'DITOLAK'
    }${b}
${b}Pemohon:${b} ${code}${String(appeal.appellant_user_id)}${code}
${b}Diputuskan oleh:${b} ${code}${String(reviewerId)}${code}`;

    await ctx
      .editMessageText(cardText.text, {
        entities: cardText.entities,
        reply_markup: new InlineKeyboard(),
      })
      .catch(() => {});
  },
);
