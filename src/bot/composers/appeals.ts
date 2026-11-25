import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { Message } from 'grammy/types';
import { syncUnbanToTelegram } from '../../lib/telegram-sync';
import type { BotContext } from '../context';
import {
  getUserRole,
  isAdminOrOwner,
  isStaffRole,
  recordAuditEvent,
} from '../db';
import { t } from '../i18n';
import { getCommandArgs, onCommand } from '../prefixes';
import { clearBotSession, getBotSession, setBotSession } from '../session';

const REJECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const REVIEWER_LOCK_MS = 12 * 60 * 60 * 1000;
const STALE_REVIEW_MS = 72 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = 1800;
const MAX_PROOF_ITEMS = 5;

export const appealsComposer = new Composer<BotContext>();

interface ProofMediaDraft {
  mediaType: 'photo' | 'video' | 'animation' | 'document' | 'voice';
  fileUniqueId: string;
  fileId: string;
  mimeType: string | null;
  fileName: string | null;
  caption: string | null;
  sourceChatId: number;
  sourceMessageId: number;
  archiveChatId: number | null;
  archiveMessageId: number | null;
}

interface AppealSubmitSession {
  step: 'awaiting_text' | 'awaiting_proof';
  actionId: number;
  caseId: number | null;
  banRef: string;
  banReason: string | null;
  instructionMsgId?: number;
  appealText?: string;
  proofItems: ProofMediaDraft[];
}

interface ReviewCardRef {
  chatId: number;
  messageId: number;
}

function asMetaRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function parseReviewCards(meta: Record<string, unknown>): ReviewCardRef[] {
  if (!Array.isArray(meta.review_cards)) return [];
  const cards: ReviewCardRef[] = [];
  for (const item of meta.review_cards) {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).chatId === 'number' &&
      typeof (item as Record<string, unknown>).messageId === 'number'
    ) {
      cards.push({
        chatId: (item as Record<string, unknown>).chatId as number,
        messageId: (item as Record<string, unknown>).messageId as number,
      });
    }
  }
  return cards;
}

function resolveReviewTargetChats(env: CloudflareBindings): number[] {
  const candidates = [env.APPEALS, env.LOGS];
  const unique: number[] = [];
  for (const raw of candidates) {
    const id = Number(raw || '0');
    if (Number.isFinite(id) && id !== 0 && !unique.includes(id)) {
      unique.push(id);
    }
  }
  if (unique.length === 0) {
    const fallback = Number(env.OWNER_ID || '0');
    if (Number.isFinite(fallback) && fallback !== 0) {
      unique.push(fallback);
    }
  }
  return unique;
}

function buildReviewCardKeyboard(
  appealId: number,
  lockedBy: number | null,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (lockedBy) {
    kb.text(`🔓 Lepas Klaim (${lockedBy})`, `appeal:unlock:${appealId}`);
  } else {
    kb.text('🔒 Klaim (12j)', `appeal:claim:${appealId}`);
  }
  kb.row()
    .text('✅ Setujui', `appeal:approve:${appealId}`)
    .text('❌ Tolak', `appeal:reject:${appealId}`);
  return kb;
}

function buildReviewCardText(params: {
  appealId: number;
  userId: number;
  banRef: string;
  banReason: string | null;
  appealText: string;
  proofCount: number;
  lockedBy?: number | null;
}) {
  const lockLine = params.lockedBy
    ? `\n🔒 Diklaim oleh: ${params.lockedBy} (12j)`
    : '';
  const proofLine =
    params.proofCount > 0 ? `\n📎 Bukti terlampir: ${params.proofCount}` : '';
  return fmt`${b}⚖️ Banding Baru #${String(params.appealId)}${b}
${b}Pemohon:${b} ${code}${String(params.userId)}${code}
${b}Ref Ban:${b} ${code}${params.banRef}${code}
${b}Alasan Ban:${b} ${params.banReason ?? '-'}${proofLine}${lockLine}
${b}Penjelasan Pemohon:${b} ${params.appealText.slice(0, 800)}`;
}

function extractProofMedia(
  msg: Message,
): Omit<
  ProofMediaDraft,
  'sourceChatId' | 'sourceMessageId' | 'archiveChatId' | 'archiveMessageId'
> | null {
  const caption = msg.caption?.slice(0, 500) ?? null;
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

async function persistAppealProofs(
  ctx: BotContext,
  params: {
    appealId: number;
    userId: number;
    caseId: number | null;
    banRef: string;
    proofItems: ProofMediaDraft[];
  },
): Promise<number | null> {
  if (!ctx.supabase || params.proofItems.length === 0) return null;

  let resolvedCaseId = params.caseId;
  if (!resolvedCaseId) {
    const { data: createdCase } = await ctx.supabase
      .from('moderation_cases')
      .insert({
        subject_user_id: params.userId,
        opened_by_user_id: params.userId,
        case_type: 'appeal',
        source: 'telegram_appeal',
        status: 'open',
        title: `Appeal proof for ${params.banRef}`,
        summary: `Bukti pendukung banding #${params.appealId} (${params.banRef})`,
      })
      .select('id')
      .single();
    resolvedCaseId = createdCase?.id ?? null;
  }

  if (!resolvedCaseId) return null;

  const fallbackDest = Number(
    ctx.appEnv.LOGS || ctx.appEnv.APPEALS || params.userId,
  );
  const firstDest =
    params.proofItems[0]?.archiveChatId ??
    (Number.isFinite(fallbackDest) && fallbackDest !== 0
      ? fallbackDest
      : params.userId);
  const nowIso = new Date().toISOString();

  const { data: upload } = await ctx.supabase
    .from('moderation_evidence_uploads')
    .insert({
      case_id: resolvedCaseId,
      destination_chat_id: firstDest,
      uploaded_by_user_id: params.userId,
      expected_item_count: params.proofItems.length,
      status: 'completed',
      started_at: nowIso,
      finished_at: nowIso,
      metadata: {
        appeal_id: params.appealId,
        ban_ref: params.banRef,
      } as never,
    })
    .select('id')
    .single();

  if (!upload?.id) return null;

  const rows = params.proofItems.map((item, idx) => ({
    upload_id: upload.id,
    archive_message_id: item.archiveMessageId ?? item.sourceMessageId,
    destination_chat_id: item.archiveChatId ?? firstDest,
    source_chat_id: item.sourceChatId,
    source_message_id: item.sourceMessageId,
    item_order: idx,
    media_type: item.mediaType,
    file_unique_id: item.fileUniqueId,
    mime_type: item.mimeType,
    file_name: item.fileName,
    caption_text: item.caption,
    metadata: {
      file_id: item.fileId,
      appeal_id: params.appealId,
    } as never,
  }));

  await ctx.supabase.from('moderation_evidence_items').insert(rows);
  return upload.id;
}

async function syncReviewCards(
  ctx: BotContext,
  cards: ReviewCardRef[],
  text: string,
  entities: Message['entities'],
  replyMarkup: InlineKeyboard,
  excludeChatId?: number,
  excludeMessageId?: number,
): Promise<void> {
  for (const card of cards) {
    if (
      excludeChatId !== undefined &&
      excludeMessageId !== undefined &&
      card.chatId === excludeChatId &&
      card.messageId === excludeMessageId
    ) {
      continue;
    }
    await ctx.api
      .editMessageText(card.chatId, card.messageId, text, {
        entities,
        reply_markup: replyMarkup,
      })
      .catch(() => {});
  }
}

async function submitAppealRecord(
  ctx: BotContext,
  params: {
    userId: number;
    actionId: number;
    caseId: number | null;
    banRef: string;
    banReason: string | null;
    appealText: string;
    proofItems?: ProofMediaDraft[];
  },
): Promise<void> {
  const isId = ctx.locale === 'id-ID';
  if (!ctx.supabase) {
    await ctx.reply(t(ctx.locale, 'err.db_unconfigured'));
    return;
  }

  const proofItems = params.proofItems ?? [];

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

  const evidenceUploadId = await persistAppealProofs(ctx, {
    appealId: inserted.id,
    userId: params.userId,
    caseId: params.caseId,
    banRef: params.banRef,
    proofItems,
  });

  const targetChats = resolveReviewTargetChats(ctx.appEnv);
  const reviewCards: ReviewCardRef[] = [];

  if (targetChats.length > 0) {
    const reviewCard = buildReviewCardText({
      appealId: inserted.id,
      userId: params.userId,
      banRef: params.banRef,
      banReason: params.banReason,
      appealText: params.appealText,
      proofCount: proofItems.length,
    });
    const reviewKeyboard = buildReviewCardKeyboard(inserted.id, null);

    const results = await Promise.all(
      targetChats.map((chatId) =>
        ctx.api
          .sendMessage(chatId, reviewCard.text, {
            entities: reviewCard.entities,
            reply_markup: reviewKeyboard,
          })
          .then((sent) => ({ chatId, messageId: sent.message_id }))
          .catch(() => null),
      ),
    );
    for (const ref of results) {
      if (ref) reviewCards.push(ref);
    }
  }

  if (reviewCards.length > 0 || evidenceUploadId !== null) {
    await ctx.supabase
      .from('moderation_appeals')
      .update({
        metadata: {
          ban_ref: params.banRef,
          ban_reason: params.banReason,
          proof_count: proofItems.length,
          ...(evidenceUploadId !== null
            ? { evidence_upload_id: evidenceUploadId }
            : {}),
          ...(reviewCards.length > 0 ? { review_cards: reviewCards } : {}),
        } as never,
      })
      .eq('id', inserted.id);
  }

  await recordAuditEvent(ctx.supabase, {
    eventKey: 'appeal.submitted',
    entityType: 'moderation_appeal',
    entityId: String(inserted.id),
    actorUserId: params.userId,
    subjectUserId: params.userId,
    actionId: params.actionId,
    caseId: params.caseId,
    payload: {
      banRef: params.banRef,
      proofCount: proofItems.length,
      reviewCardsCount: reviewCards.length,
    },
  });

  const proofSummary =
    proofItems.length > 0
      ? isId
        ? `\n📎 Bukti terlampir: ${proofItems.length} file`
        : `\n📎 Attached proof: ${proofItems.length} file(s)`
      : '';

  const formatted = fmt`${b}${isId ? '📩 Banding Terkirim' : '📩 Appeal Submitted'}${b}
${b}ID Banding:${b} #${String(inserted.id)}
${b}Ref:${b} ${code}${params.banRef}${code}${proofSummary}
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
  caseId?: number | null;
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
    .select('id, case_id, external_ref, status, reason')
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
    .select('id, submitted_at, metadata')
    .eq('action_id', banAction.id)
    .eq('appellant_user_id', userId)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPending) {
    const elapsedPending =
      Date.now() - new Date(existingPending.submitted_at).getTime();
    if (elapsedPending >= STALE_REVIEW_MS) {
      const staleMeta = asMetaRecord(existingPending.metadata);
      delete staleMeta.locked_by;
      delete staleMeta.locked_until;
      await ctx.supabase
        .from('moderation_appeals')
        .update({
          status: 'withdrawn',
          resolved_at: new Date().toISOString(),
          decision_note:
            'Otomatis dilepas setelah melewati batas tinjau 72 jam',
          metadata: staleMeta as never,
        })
        .eq('id', existingPending.id)
        .eq('status', 'pending');
    } else {
      const remainingHours = Math.max(
        1,
        Math.ceil((STALE_REVIEW_MS - elapsedPending) / (60 * 60 * 1000)),
      );
      return {
        ok: false,
        errorMsg: isId
          ? `Anda sudah memiliki banding aktif (#${existingPending.id}) yang sedang menunggu peninjauan (kadaluarsa otomatis dalam ~${remainingHours} jam).`
          : `You already have a pending appeal (#${existingPending.id}) under review (auto-expires in ~${remainingHours}h).`,
      };
    }
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
    caseId: banAction.case_id ?? null,
    banRef: banAction.external_ref,
    banReason: banAction.reason,
  };
}

async function startInteractiveAppeal(
  ctx: BotContext,
  userId: number,
  banRef?: string,
): Promise<void> {
  const isId = ctx.locale === 'id-ID';
  const check = await validateAppealEligibility(ctx, userId, banRef);
  if (!check.ok || !check.actionId || !check.banRef) {
    await ctx.reply(
      check.errorMsg ??
        (isId
          ? 'Tidak ada ban aktif untuk diajukan banding.'
          : 'No active ban found to appeal.'),
    );
    return;
  }

  const prompt = fmt`${b}${isId ? '⚖️ Pengajuan Banding (Langkah 1/2)' : '⚖️ Submit Appeal (Step 1/2)'}${b}
${b}Ref Ban:${b} ${code}${check.banRef}${code}
${b}Alasan Ban:${b} ${check.banReason ?? '-'}

${isId ? 'Silakan ketik dan kirim penjelasan banding Anda (10–2000 karakter). Setelah itu Anda dapat melampirkan bukti media opsional.' : 'Please type and send your appeal explanation (10–2000 characters). Afterward you may optionally attach proof media.'}`;

  const kb = new InlineKeyboard().text(
    isId ? '❌ Batal' : '❌ Cancel',
    'appeal:cancel',
  );
  const sent = await ctx.reply(prompt.text, {
    entities: prompt.entities,
    reply_markup: kb,
  });

  await setBotSession<AppealSubmitSession>(
    ctx.appEnv,
    'appeal_submit',
    userId,
    {
      step: 'awaiting_text',
      actionId: check.actionId,
      caseId: check.caseId ?? null,
      banRef: check.banRef,
      banReason: check.banReason ?? null,
      instructionMsgId: sent.message_id,
      proofItems: [],
    },
    SESSION_TTL_SECONDS,
  );
}

// Deep link: /start appeal, /start appeal_<ban_ref>, or /start appeal<ban_ref>
appealsComposer.on('message:text', async (ctx, next) => {
  const text = ctx.message.text.trim();
  const match = text.match(
    /^\/start(?:@\w+)?\s+appeal(?:_?([A-Za-z0-9_-]+))?$/i,
  );
  if (!match || ctx.chat.type !== 'private') {
    await next();
    return;
  }

  const userId = ctx.from?.id ?? 0;
  await startInteractiveAppeal(ctx, userId, match[1] || undefined);
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
    const botUsername = ctx.me?.username;
    const kb = new InlineKeyboard();
    if (botUsername) {
      kb.url(
        isId ? '📩 Buka DM Bot' : '📩 Open Bot DM',
        `https://t.me/${botUsername}?start=appeal`,
      );
    }
    await ctx.reply(
      isId
        ? 'Silakan kirim perintah /appeal melalui pesan pribadi (DM) ke bot.'
        : 'Please submit /appeal via direct message (DM) to the bot.',
      kb.inline_keyboard.length > 0 ? { reply_markup: kb } : undefined,
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

    await startInteractiveAppeal(ctx, userId, banRef || undefined);
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
    caseId: check.caseId ?? null,
    banRef: check.banRef,
    banReason: check.banReason ?? null,
    appealText,
  });
});

// Handle interactive appeal text in DM (Step 1 -> Step 2)
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

  if (session.step === 'awaiting_proof') {
    const kb = new InlineKeyboard()
      .text(
        session.proofItems.length > 0
          ? isId
            ? `✅ Selesai & Kirim (${session.proofItems.length})`
            : `✅ Done & Submit (${session.proofItems.length})`
          : isId
            ? '📤 Kirim Tanpa Bukti'
            : '📤 Submit Without Proof',
        session.proofItems.length > 0
          ? 'appeal:proof:done'
          : 'appeal:proof:skip',
      )
      .row()
      .text(isId ? '❌ Batal' : '❌ Cancel', 'appeal:cancel');
    await ctx.reply(
      isId
        ? 'Penjelasan Anda sudah tersimpan. Kirimkan media bukti (foto/video/dokumen/GIF/suara) atau tekan tombol di bawah untuk mengirim banding.'
        : 'Your explanation is saved. Send proof media (photo/video/document/GIF/voice) or tap the button below to submit.',
      { reply_markup: kb },
    );
    return;
  }

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

  const nextSession: AppealSubmitSession = {
    ...session,
    step: 'awaiting_proof',
    appealText: text,
  };
  await setBotSession<AppealSubmitSession>(
    ctx.appEnv,
    'appeal_submit',
    ctx.from.id,
    nextSession,
    SESSION_TTL_SECONDS,
  );

  const proofPrompt = fmt`${b}${isId ? '📎 Lampirkan Bukti (Langkah 2/2 — Opsional)' : '📎 Attach Proof (Step 2/2 — Optional)'}${b}
${b}Ref Ban:${b} ${code}${session.banRef}${code}
${b}Panjang teks:${b} ${String(text.length)}/2000 karakter

${isId ? `Kirimkan hingga ${MAX_PROOF_ITEMS} media bukti (foto, video, dokumen, GIF, atau pesan suara), atau langsung kirim tanpa bukti.` : `Send up to ${MAX_PROOF_ITEMS} proof media items (photo, video, document, GIF, or voice), or submit without proof.`}`;

  const kb = new InlineKeyboard()
    .text(
      isId ? '📤 Kirim Tanpa Bukti' : '📤 Submit Without Proof',
      'appeal:proof:skip',
    )
    .row()
    .text(isId ? '❌ Batal' : '❌ Cancel', 'appeal:cancel');

  await ctx.reply(proofPrompt.text, {
    entities: proofPrompt.entities,
    reply_markup: kb,
  });
});

// Handle proof media attachments in DM (Step 2)
appealsComposer.on(
  [
    'message:photo',
    'message:video',
    'message:animation',
    'message:document',
    'message:voice',
  ],
  async (ctx, next) => {
    if (ctx.chat.type !== 'private' || !ctx.from) {
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
    if (session.step !== 'awaiting_proof') {
      await ctx.reply(
        isId
          ? 'Harap kirimkan penjelasan banding dalam bentuk teks terlebih dahulu (10–2000 karakter).'
          : 'Please send your appeal explanation as text first (10–2000 characters).',
      );
      return;
    }

    if (session.proofItems.length >= MAX_PROOF_ITEMS) {
      const kb = new InlineKeyboard()
        .text(
          isId
            ? `✅ Selesai & Kirim (${session.proofItems.length})`
            : `✅ Done & Submit (${session.proofItems.length})`,
          'appeal:proof:done',
        )
        .row()
        .text(isId ? '❌ Batal' : '❌ Cancel', 'appeal:cancel');
      await ctx.reply(
        isId
          ? `Maksimal ${MAX_PROOF_ITEMS} bukti media sudah tercapai. Tekan Selesai & Kirim.`
          : `Maximum of ${MAX_PROOF_ITEMS} proof items reached. Tap Done & Submit.`,
        { reply_markup: kb },
      );
      return;
    }

    const meta = extractProofMedia(ctx.message);
    if (!meta) {
      await ctx.reply(
        isId
          ? 'Jenis media ini tidak didukung sebagai bukti.'
          : 'This media type is not supported as proof.',
      );
      return;
    }

    const archiveTarget = Number(ctx.appEnv.LOGS || ctx.appEnv.APPEALS || '0');
    let archiveChatId: number | null = null;
    let archiveMessageId: number | null = null;
    if (
      Number.isFinite(archiveTarget) &&
      archiveTarget !== 0 &&
      archiveTarget !== ctx.chat.id
    ) {
      const copied = await ctx.api
        .copyMessage(archiveTarget, ctx.chat.id, ctx.message.message_id)
        .catch(() => null);
      if (copied?.message_id) {
        archiveChatId = archiveTarget;
        archiveMessageId = copied.message_id;
      }
    }

    const updatedItems: ProofMediaDraft[] = [
      ...session.proofItems,
      {
        ...meta,
        sourceChatId: ctx.chat.id,
        sourceMessageId: ctx.message.message_id,
        archiveChatId,
        archiveMessageId,
      },
    ];

    await setBotSession<AppealSubmitSession>(
      ctx.appEnv,
      'appeal_submit',
      ctx.from.id,
      {
        ...session,
        proofItems: updatedItems,
      },
      SESSION_TTL_SECONDS,
    );

    const kb = new InlineKeyboard()
      .text(
        isId
          ? `✅ Selesai & Kirim (${updatedItems.length})`
          : `✅ Done & Submit (${updatedItems.length})`,
        'appeal:proof:done',
      )
      .row()
      .text(isId ? '❌ Batal' : '❌ Cancel', 'appeal:cancel');

    await ctx.reply(
      isId
        ? `📎 Bukti #${updatedItems.length}/${MAX_PROOF_ITEMS} (${meta.mediaType}) diterima. Kirim media lain atau tekan Selesai & Kirim.`
        : `📎 Proof #${updatedItems.length}/${MAX_PROOF_ITEMS} (${meta.mediaType}) attached. Send another or tap Done & Submit.`,
      { reply_markup: kb },
    );
  },
);

appealsComposer.callbackQuery(/^appeal:proof:(skip|done)$/, async (ctx) => {
  const mode = ctx.match[1] as 'skip' | 'done';
  const isId = ctx.locale === 'id-ID';
  const session = await getBotSession<AppealSubmitSession>(
    ctx.appEnv,
    'appeal_submit',
    ctx.from.id,
  );

  if (session?.step !== 'awaiting_proof' || !session.appealText) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Sesi banding sudah berakhir. Jalankan /appeal lagi.'
        : 'Appeal session expired. Run /appeal again.',
      show_alert: true,
    });
    return;
  }

  await clearBotSession(ctx.appEnv, 'appeal_submit', ctx.from.id);
  await ctx.answerCallbackQuery({
    text: isId ? 'Mengirim banding...' : 'Submitting appeal...',
  });
  await ctx
    .editMessageReplyMarkup({ reply_markup: new InlineKeyboard() })
    .catch(() => {});

  await submitAppealRecord(ctx, {
    userId: ctx.from.id,
    actionId: session.actionId,
    caseId: session.caseId,
    banRef: session.banRef,
    banReason: session.banReason,
    appealText: session.appealText,
    proofItems: mode === 'done' ? session.proofItems : [],
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
    .select(
      'id, appellant_user_id, appeal_text, status, metadata, moderation_actions!moderation_appeals_action_id_fkey(external_ref, reason)',
    )
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

  const meta = asMetaRecord(appeal.metadata);
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

  await recordAuditEvent(ctx.supabase, {
    eventKey: 'appeal.claimed',
    entityType: 'moderation_appeal',
    entityId: String(appealId),
    actorUserId: reviewerId,
    subjectUserId: appeal.appellant_user_id,
    payload: { lockedUntil: lockUntilIso },
  });

  await ctx.answerCallbackQuery({
    text: isId ? 'Banding diklaim selama 12 jam.' : 'Appeal claimed for 12h.',
  });

  const actionInfo = appeal.moderation_actions;
  const banRef =
    (typeof meta.ban_ref === 'string' ? meta.ban_ref : null) ??
    actionInfo?.external_ref ??
    `appeal_${appealId}`;
  const banReason =
    (typeof meta.ban_reason === 'string' ? meta.ban_reason : null) ??
    actionInfo?.reason ??
    null;
  const proofCount =
    typeof meta.proof_count === 'number' ? meta.proof_count : 0;

  const updatedCard = buildReviewCardText({
    appealId,
    userId: appeal.appellant_user_id,
    banRef,
    banReason,
    appealText: appeal.appeal_text,
    proofCount,
    lockedBy: reviewerId,
  });
  const updatedKb = buildReviewCardKeyboard(appealId, reviewerId);

  await ctx
    .editMessageText(updatedCard.text, {
      entities: updatedCard.entities,
      reply_markup: updatedKb,
    })
    .catch(() => {});

  const cards = parseReviewCards(meta);
  if (cards.length > 0 && ctx.chat && ctx.callbackQuery.message) {
    await syncReviewCards(
      ctx,
      cards,
      updatedCard.text,
      updatedCard.entities,
      updatedKb,
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
    );
  }
});

appealsComposer.callbackQuery(/^appeal:unlock:(\d+)$/, async (ctx) => {
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
    .select(
      'id, appellant_user_id, appeal_text, status, metadata, moderation_actions!moderation_appeals_action_id_fkey(external_ref, reason)',
    )
    .eq('id', appealId)
    .maybeSingle();

  if (appeal?.status !== 'pending') {
    await ctx.answerCallbackQuery({
      text: isId ? 'Banding tidak tersedia.' : 'Appeal unavailable.',
      show_alert: true,
    });
    return;
  }

  const meta = asMetaRecord(appeal.metadata);
  const lockedBy = typeof meta.locked_by === 'number' ? meta.locked_by : null;

  if (!lockedBy) {
    await ctx.answerCallbackQuery({
      text: isId ? 'Klaim sudah dilepas.' : 'Lock already released.',
    });
    return;
  }

  if (lockedBy !== reviewerId && !isAdminOrOwner(role)) {
    await ctx.answerCallbackQuery({
      text: isId
        ? `Hanya staf ${lockedBy} atau admin/owner yang dapat melepas klaim ini.`
        : `Only staff ${lockedBy} or an admin/owner can release this lock.`,
      show_alert: true,
    });
    return;
  }

  const nextMeta = { ...meta };
  delete nextMeta.locked_by;
  delete nextMeta.locked_until;

  await ctx.supabase
    .from('moderation_appeals')
    .update({ metadata: nextMeta as never })
    .eq('id', appealId);

  await recordAuditEvent(ctx.supabase, {
    eventKey: 'appeal.unlocked',
    entityType: 'moderation_appeal',
    entityId: String(appealId),
    actorUserId: reviewerId,
    subjectUserId: appeal.appellant_user_id,
    payload: { previousLockedBy: lockedBy },
  });

  await ctx.answerCallbackQuery({
    text: isId ? 'Klaim peninjauan dilepas.' : 'Reviewer lock released.',
  });

  const actionInfo = appeal.moderation_actions;
  const banRef =
    (typeof meta.ban_ref === 'string' ? meta.ban_ref : null) ??
    actionInfo?.external_ref ??
    `appeal_${appealId}`;
  const banReason =
    (typeof meta.ban_reason === 'string' ? meta.ban_reason : null) ??
    actionInfo?.reason ??
    null;
  const proofCount =
    typeof meta.proof_count === 'number' ? meta.proof_count : 0;

  const updatedCard = buildReviewCardText({
    appealId,
    userId: appeal.appellant_user_id,
    banRef,
    banReason,
    appealText: appeal.appeal_text,
    proofCount,
    lockedBy: null,
  });
  const updatedKb = buildReviewCardKeyboard(appealId, null);

  await ctx
    .editMessageText(updatedCard.text, {
      entities: updatedCard.entities,
      reply_markup: updatedKb,
    })
    .catch(() => {});

  const cards = parseReviewCards(meta);
  if (cards.length > 0 && ctx.chat && ctx.callbackQuery.message) {
    await syncReviewCards(
      ctx,
      cards,
      updatedCard.text,
      updatedCard.entities,
      updatedKb,
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
    );
  }
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

    const meta = asMetaRecord(appeal.metadata);
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
    const cleanedMeta = { ...meta };
    delete cleanedMeta.locked_by;
    delete cleanedMeta.locked_until;

    const { data: claimedRow, error: updateErr } = await ctx.supabase
      .from('moderation_appeals')
      .update({
        status: nextStatus,
        resolved_at: nowIso,
        reviewed_by_user_id: reviewerId,
        decision_note:
          action === 'approve'
            ? 'Disetujui melalui kartu review bot'
            : 'Ditolak melalui kartu review bot',
        metadata: cleanedMeta as never,
      })
      .eq('id', appealId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (updateErr || !claimedRow) {
      await ctx.answerCallbackQuery({
        text: updateErr
          ? 'Gagal memperbarui status banding.'
          : 'Banding ini sudah diputuskan sebelumnya.',
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

    const emptyKb = new InlineKeyboard();
    await ctx
      .editMessageText(cardText.text, {
        entities: cardText.entities,
        reply_markup: emptyKb,
      })
      .catch(() => {});

    const cards = parseReviewCards(meta);
    if (cards.length > 0 && ctx.chat && ctx.callbackQuery.message) {
      await syncReviewCards(
        ctx,
        cards,
        cardText.text,
        cardText.entities,
        emptyKb,
        ctx.chat.id,
        ctx.callbackQuery.message.message_id,
      );
    }
  },
);
