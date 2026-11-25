import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';

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

  if (!ctx.supabase) {
    await ctx.reply(
      isId ? 'Database belum terkonfigurasi.' : 'Database is not configured.',
    );
    return;
  }

  const { data: banAction } = await ctx.supabase
    .from('moderation_actions')
    .select('id, status')
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

  const { error } = await ctx.supabase.from('moderation_appeals').insert({
    action_id: banAction.id,
    appellant_user_id: userId,
    appeal_text: appealText.slice(0, 2000),
    status: 'pending',
  });

  if (error) {
    await ctx.reply(
      isId
        ? 'Gagal menyimpan banding. Coba lagi nanti.'
        : 'Failed to submit appeal. Please try again later.',
    );
    return;
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
