import { b, code, type FormattedString, fmt, i } from '@grammyjs/parse-mode';
import { InlineKeyboard } from 'grammy';
import type { Locale } from './i18n';

export function buildStartCard(
  locale: Locale,
  communityName: string,
  firstName?: string,
  isAdmin = false,
): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const isId = locale === 'id-ID';
  const greeting = isId
    ? firstName
      ? `Halo, ${firstName}!`
      : 'Halo!'
    : firstName
      ? `Hello, ${firstName}!`
      : 'Hello!';

  const formatted = isId
    ? fmt`${b}${communityName} Moderation Bot${b}

${greeting}
Bot aktif di Cloudflare Workers dan siap menjaga federasi Anda.

Gunakan tombol di bawah untuk navigasi cepat atau ketik ${code}/help${code}.`
    : fmt`${b}${communityName} Moderation Bot${b}

${greeting}
Bot is running on Cloudflare Workers and ready to guard your federation.

Use the buttons below for quick navigation or type ${code}/help${code}.`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '📖 Bantuan' : '📖 Help', 'nav:help')
    .text(isId ? '🛡 Status Saya' : '🛡 My Status', 'nav:checkme')
    .row()
    .text(isId ? '🌐 Bahasa' : '🌐 Language', 'nav:lang')
    .text('🏓 Ping', 'nav:ping');

  if (isAdmin) {
    keyboard
      .row()
      .text(isId ? '👥 Grup Terhubung' : '👥 Connected Groups', 'nav:groups');
  }

  keyboard.row().text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

export function buildHelpCard(locale: Locale): {
  formatted: FormattedString;
  keyboard: InlineKeyboard;
} {
  const isId = locale === 'id-ID';
  const formatted = isId
    ? fmt`${b}Daftar Perintah${b}

${b}Umum${b}
• ${code}/start${code} — Pesan pembuka & menu utama
• ${code}/help${code} — Tampilkan bantuan ini
• ${code}/ping${code} — Cek latensi bot
• ${code}/language${code} — Ubah bahasa (${code}en-US${code} / ${code}id-ID${code})
• ${code}/checkme${code} — Cek status moderasi Anda

${b}Staf & Moderasi${b}
• ${code}/tcconnect${code} — Hubungkan grup ke federasi
• ${code}/tcdisconnect${code} — Putuskan grup dari federasi
• ${code}/tcgroups${code} — Daftar grup terhubung
• ${code}/tcban${code} ${i}<user> [durasi] [alasan]${i} — Ban federasi
• ${code}/tcunban${code} ${i}<user>${i} — Cabut ban
• ${code}/tcmute${code} ${i}<user> [durasi] [alasan]${i} — Bisukan pengguna
• ${code}/tcunmute${code} ${i}<user>${i} — Buka bisu
• ${code}/tcwarn${code} ${i}<user> [alasan]${i} — Beri peringatan
• ${code}/check${code} ${i}<user>${i} — Periksa status pengguna`
    : fmt`${b}Available commands:${b}

${b}General${b}
• ${code}/start${code} — Welcome message & main menu
• ${code}/help${code} — Show this help
• ${code}/ping${code} — Check bot latency
• ${code}/language${code} — Switch language (${code}en-US${code} / ${code}id-ID${code})
• ${code}/checkme${code} — Check your moderation status

${b}Staff & Moderation${b}
• ${code}/tcconnect${code} — Connect group to federation
• ${code}/tcdisconnect${code} — Disconnect group
• ${code}/tcgroups${code} — List connected groups
• ${code}/tcban${code} ${i}<user> [duration] [reason]${i} — Federation ban
• ${code}/tcunban${code} ${i}<user>${i} — Lift ban
• ${code}/tcmute${code} ${i}<user> [duration] [reason]${i} — Mute user
• ${code}/tcunmute${code} ${i}<user>${i} — Unmute user
• ${code}/tcwarn${code} ${i}<user> [reason]${i} — Warn user
• ${code}/check${code} ${i}<user>${i} — Inspect user status`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

export function buildPingCard(
  locale: Locale,
  elapsedMs?: number,
): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const isId = locale === 'id-ID';
  const latencyText =
    elapsedMs !== undefined
      ? fmt`\n${b}${isId ? 'Latensi' : 'Latency'}:${b} ${code}${String(elapsedMs)}ms${code}`
      : '';

  const formatted = fmt`${b}🏓 Pong${b}${latencyText}`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '↻ Ping Lagi' : '↻ Ping Again', 'nav:ping')
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

export function buildLanguageCard(locale: Locale): {
  formatted: FormattedString;
  keyboard: InlineKeyboard;
} {
  const isId = locale === 'id-ID';
  const formatted = isId
    ? fmt`${b}Pengaturan Bahasa${b}
Bahasa aktif saat ini: ${code}${locale}${code}`
    : fmt`${b}Language Settings${b}
Current active language: ${code}${locale}${code}`;

  const keyboard = new InlineKeyboard()
    .text(
      locale === 'en-US' ? '✓ English (en-US)' : 'English (en-US)',
      'lang:set:en-US',
    )
    .text(
      locale === 'id-ID' ? '✓ Indonesia (id-ID)' : 'Indonesia (id-ID)',
      'lang:set:id-ID',
    )
    .row()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

export function buildGroupsCard(
  locale: Locale,
  groups: Array<{ chatId: number; title: string }>,
): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const isId = locale === 'id-ID';

  const formatted =
    groups.length === 0
      ? fmt`${b}${isId ? 'Grup Terhubung' : 'Connected Groups'}${b}
${isId ? 'Belum ada grup terhubung.' : 'No connected groups yet.'}`
      : fmt`${b}${isId ? 'Grup Terhubung' : 'Connected Groups'} (${String(groups.length)})${b}
${groups.map((g) => `• ${g.title} (${g.chatId})`).join('\n')}`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '↻ Segarkan' : '↻ Refresh', 'nav:groups')
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

export function buildModerationActionCard(opts: {
  locale: Locale;
  title: string;
  targetLabel: string;
  targetId: number;
  count?: number;
  reason?: string;
  ref?: string;
  extraLine?: string;
  actionType: 'ban' | 'mute' | 'warn';
}): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const {
    locale,
    title,
    targetLabel,
    targetId,
    count,
    reason,
    ref,
    extraLine,
    actionType,
  } = opts;

  const isId = locale === 'id-ID';
  const countLine =
    count !== undefined
      ? fmt`\n${b}${isId ? 'Grup terdampak' : 'Affected groups'}:${b} ${String(count)}`
      : '';
  const reasonLine = reason
    ? fmt`\n${b}${isId ? 'Alasan' : 'Reason'}:${b} ${reason}`
    : '';
  const refLine = ref ? fmt`\n${b}Ref:${b} ${code}${ref}${code}` : '';
  const extra = extraLine ? fmt`\n${extraLine}` : '';

  const formatted = fmt`${b}${title}${b}
${b}Target:${b} ${targetLabel} (${code}${String(targetId)}${code})${countLine}${reasonLine}${refLine}${extra}`;

  const keyboard = new InlineKeyboard();
  if (actionType === 'ban') {
    keyboard.text(isId ? '🔓 Cabut Ban' : '🔓 Unban', `mod:unban:${targetId}`);
  } else if (actionType === 'mute') {
    keyboard.text(
      isId ? '🔊 Buka Bisu' : '🔊 Unmute',
      `mod:unmute:${targetId}`,
    );
  }
  keyboard
    .text(isId ? '🔍 Cek Status' : '🔍 Check', `mod:check:${targetId}`)
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

export function buildModerationRevokedCard(opts: {
  locale: Locale;
  title: string;
  targetLabel: string;
  targetId: number;
  count: number;
}): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const { locale, title, targetLabel, targetId, count } = opts;
  const isId = locale === 'id-ID';

  const formatted = fmt`${b}${title}${b}
${b}Target:${b} ${targetLabel} (${code}${String(targetId)}${code})
${b}${isId ? 'Grup terdampak' : 'Affected groups'}:${b} ${String(count)}`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '🔍 Cek Status' : '🔍 Check', `mod:check:${targetId}`)
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

export function buildCheckCard(opts: {
  locale: Locale;
  targetLabel: string;
  targetId: number;
  banRef: string | null;
  muteRef: string | null;
  warns: number;
  showStaffActions?: boolean;
}): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const {
    locale,
    targetLabel,
    targetId,
    banRef,
    muteRef,
    warns,
    showStaffActions = false,
  } = opts;
  const isId = locale === 'id-ID';

  const formatted =
    !banRef && !muteRef && warns === 0
      ? fmt`${b}${isId ? 'Status Bersih' : 'Clean Record'}${b}
${targetLabel} (${code}${String(targetId)}${code}) ${isId ? 'tidak memiliki ban, bisu, atau peringatan aktif.' : 'has no active bans, mutes, or warnings.'}`
      : fmt`${b}${isId ? 'Status Moderasi' : 'Moderation Status'}${b}
${b}Target:${b} ${targetLabel} (${code}${String(targetId)}${code})
• ${b}Ban:${b} ${banRef ? fmt`${code}${banRef}${code}` : isId ? 'Tidak ada' : 'None'}
• ${b}${isId ? 'Bisu' : 'Mute'}:${b} ${muteRef ? fmt`${code}${muteRef}${code}` : isId ? 'Tidak ada' : 'None'}
• ${b}${isId ? 'Peringatan aktif' : 'Active warns'}:${b} ${String(warns)}`;

  const keyboard = new InlineKeyboard();
  if (showStaffActions && (banRef || muteRef)) {
    if (banRef) {
      keyboard.text(
        isId ? '🔓 Cabut Ban' : '🔓 Unban',
        `mod:unban:${targetId}`,
      );
    }
    if (muteRef) {
      keyboard.text(
        isId ? '🔊 Buka Bisu' : '🔊 Unmute',
        `mod:unmute:${targetId}`,
      );
    }
    keyboard.row();
  }

  keyboard
    .text(isId ? '↻ Segarkan' : '↻ Refresh', `mod:check:${targetId}`)
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}
