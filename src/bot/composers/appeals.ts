import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import { syncUnbanToTelegram } from '../../lib/telegram-sync';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner } from '../db';
import { t } from '../i18n';

const REJECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const appealsComposer = new Composer<BotContext>();

appealsComposer.command('appeal', async (ctx) => {
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

  const raw = (ctx.match ?? '').trim();
  const [banRef, ...reasonParts] = raw.split(/\s+/).filter(Boolean);
  const appealText = reasonParts.join(' ').trim();

  if (!banRef || appealText.length < 10) {
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

  if (!ctx.supabase) {
    await ctx.reply(
      isId ? 'Database belum terkonfigurasi.' : 'Database is not configured.',
    );
    return;
  }

  const { data: banAction } = await ctx.supabase
    .from('moderation_actions')
    .select('id, status, reason')
    .eq('external_ref', banRef)
    .eq('target_user_id', userId)
    .eq('action_type', 'ban')
    .eq('status', 'active')
    .maybeSingle();

  if (!banAction) {
    await ctx.reply(
      isId
        ? 'Ban aktif dengan kode tersebut tidak ditemukan untuk akun Anda.'
        : 'No active ban with that reference was found for your account.',
    );
    return;
  }

  const { data: existingPending } = await ctx.supabase
    .from('moderation_appeals')
    .select('id')
    .eq('action_id', banAction.id)
    .eq('appellant_user_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingPending) {
    await ctx.reply(
      isId
        ? 'Anda sudah memiliki banding yang sedang menunggu peninjauan.'
        : 'You already have a pending appeal under review.',
    );
    return;
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
      await ctx.reply(
        isId
          ? `Banding Anda sebelumnya ditolak. Tunggu ${remainingHours} jam sebelum mengajukan ulang.`
          : `Your previous appeal was rejected. Please wait ${remainingHours} hour(s) before re-applying.`,
      );
      return;
    }
  }

  const { data: inserted, error } = await ctx.supabase
    .from('moderation_appeals')
    .insert({
      action_id: banAction.id,
      appellant_user_id: userId,
      appeal_text: appealText.slice(0, 2000),
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

  const reviewTargetChat = Number(
    ctx.appEnv.APPEALS || ctx.appEnv.LOGS || ctx.appEnv.OWNER_ID || '0',
  );
  if (Number.isFinite(reviewTargetChat) && reviewTargetChat !== 0) {
    const reviewCard = fmt`${b}⚖️ Banding Baru #${String(inserted.id)}${b}
${b}Pemohon:${b} ${code}${String(userId)}${code}
${b}Ref Ban:${b} ${code}${banRef}${code}
${b}Alasan Ban:${b} ${banAction.reason ?? '-'}
${b}Penjelasan Pemohon:${b} ${appealText.slice(0, 800)}`;

    const reviewKeyboard = new InlineKeyboard()
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
${b}Ref:${b} ${code}${banRef}${code}
${isId ? 'Banding Anda masuk ke antrean peninjauan moderator.' : 'Your appeal has been queued for moderator review.'}`;

  const keyboard = new InlineKeyboard().text(
    isId ? '✖ Tutup' : '✖ Close',
    'nav:close',
  );

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
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
    if (!isAdminOrOwner(role)) {
      await ctx.answerCallbackQuery({
        text: t(ctx.locale, 'err.admin_only'),
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
      .select('id, action_id, appellant_user_id, status')
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

    await ctx.supabase.from('audit_events').insert({
      event_key: `appeal.${nextStatus}`,
      entity_type: 'moderation_appeal',
      entity_id: String(appealId),
      actor_user_id: reviewerId,
      subject_user_id: appeal.appellant_user_id,
      action_id: appeal.action_id,
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
