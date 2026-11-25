import {
  b,
  blockquote,
  code,
  expandableBlockquote,
  type FormattedString,
  fmt,
  i,
  mentionUser,
  pre,
  s,
  spoiler,
  u,
} from '@grammyjs/parse-mode';
import { InlineKeyboard } from 'grammy';
import type { Locale } from './i18n';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownConfig {
  prefix: string;
  placeholder: string;
  selectedValue?: string | null;
  isOpen: boolean;
  options: DropdownOption[];
  closeLabel?: string;
  columns?: 1 | 2;
}

/**
 * Appends a stateless expandable inline dropdown to an existing InlineKeyboard.
 * Trigger: `<prefix>:open:<selected>` | Collapse: `<prefix>:close:<selected>` | Select: `<prefix>:pick:<value>`.
 */
export function appendDropdown(
  keyboard: InlineKeyboard,
  config: DropdownConfig,
): InlineKeyboard {
  const {
    prefix,
    placeholder,
    selectedValue,
    isOpen,
    options,
    closeLabel,
    columns = 2,
  } = config;
  const active = options.find((opt) => opt.value === selectedValue);
  const currentToken =
    selectedValue && selectedValue.length > 0 ? selectedValue : '_';

  if (!isOpen) {
    const triggerText = active
      ? `▾ ${placeholder}: ${active.label}`
      : `▾ ${placeholder}`;
    return keyboard
      .row()
      .text(triggerText, `${prefix}:open:${currentToken}`)
      .primary();
  }

  keyboard
    .row()
    .text(`▴ ${closeLabel ?? placeholder}`, `${prefix}:close:${currentToken}`)
    .danger();

  if (columns === 1) {
    for (const opt of options) {
      const isSelected = opt.value === selectedValue;
      keyboard
        .row()
        .text(
          isSelected ? `✓ ${opt.label}` : opt.label,
          `${prefix}:pick:${opt.value}`,
        );
      if (isSelected) {
        keyboard.success();
      } else {
        keyboard.primary();
      }
    }
    return keyboard;
  }

  for (let idx = 0; idx < options.length; idx += 2) {
    const left = options[idx];
    const right = options[idx + 1];
    if (left) {
      const leftSelected = left.value === selectedValue;
      keyboard
        .row()
        .text(
          leftSelected ? `✓ ${left.label}` : left.label,
          `${prefix}:pick:${left.value}`,
        );
      if (leftSelected) {
        keyboard.success();
      } else {
        keyboard.primary();
      }
    }
    if (right) {
      const rightSelected = right.value === selectedValue;
      keyboard.text(
        rightSelected ? `✓ ${right.label}` : right.label,
        `${prefix}:pick:${right.value}`,
      );
      if (rightSelected) {
        keyboard.success();
      } else {
        keyboard.primary();
      }
    }
  }

  return keyboard;
}

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

Gunakan tombol di bawah untuk navigasi cepat atau ketik /help.`
    : fmt`${b}${communityName} Moderation Bot${b}

${greeting}
Bot is running on Cloudflare Workers and ready to guard your federation.

Use the buttons below for quick navigation or type /help.`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '📖 Bantuan' : '📖 Help', 'nav:help')
    .primary()
    .text(isId ? '🛡 Status Saya' : '🛡 My Status', 'nav:checkme')
    .primary()
    .row()
    .text(isId ? '📜 Aturan' : '📜 Rules', 'nav:rules')
    .primary()
    .text(isId ? '🌐 Bahasa' : '🌐 Language', 'nav:lang')
    .primary()
    .row()
    .text('🏓 Ping', 'nav:ping')
    .primary();

  if (isAdmin) {
    keyboard
      .text(isId ? '👥 Grup Terhubung' : '👥 Connected Groups', 'nav:groups')
      .primary();
  }

  keyboard
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  return { formatted, keyboard };
}

export function buildHelpCard(locale: Locale): {
  formatted: FormattedString;
  keyboard: InlineKeyboard;
} {
  const isId = locale === 'id-ID';
  const formatted = isId
    ? fmt`${b}Daftar Perintah${b}

${expandableBlockquote}${b}Umum${b}
• /start — Pesan pembuka & menu utama
• /help — Tampilkan bantuan ini
• /ping — Cek latensi bot
• /language — Ubah bahasa (${code}en-US${code} / ${code}id-ID${code})
• /checkme — Cek status moderasi Anda

${b}Staf & Moderasi${b}
• /tcconnect — Hubungkan grup ke federasi
• /tcdisconnect — Putuskan grup dari federasi
• /tcgroups — Daftar grup terhubung
• /tcban ${i}<user> [durasi] [alasan]${i} — Ban federasi
• /tcunban ${i}<user>${i} — Cabut ban
• /tcmute ${i}<user> [durasi] [alasan]${i} — Bisukan pengguna
• /tcunmute ${i}<user>${i} — Buka bisu
• /tcwarn ${i}<user> [alasan]${i} — Beri peringatan
• /check ${i}<user>${i} — Periksa status pengguna${expandableBlockquote}`
    : fmt`${b}Available commands:${b}

${expandableBlockquote}${b}General${b}
• /start — Welcome message & main menu
• /help — Show this help
• /ping — Check bot latency
• /language — Switch language (${code}en-US${code} / ${code}id-ID${code})
• /checkme — Check your moderation status

${b}Staff & Moderation${b}
• /tcconnect — Connect group to federation
• /tcdisconnect — Disconnect group
• /tcgroups — List connected groups
• /tcban ${i}<user> [duration] [reason]${i} — Federation ban
• /tcunban ${i}<user>${i} — Lift ban
• /tcmute ${i}<user> [duration] [reason]${i} — Mute user
• /tcunmute ${i}<user>${i} — Unmute user
• /tcwarn ${i}<user> [reason]${i} — Warn user
• /check ${i}<user>${i} — Inspect user status${expandableBlockquote}`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

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
    .success()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .primary()
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

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

  const keyboard = new InlineKeyboard().text(
    locale === 'en-US' ? '✓ English (en-US)' : 'English (en-US)',
    'lang:set:en-US',
  );
  if (locale === 'en-US') {
    keyboard.success();
  } else {
    keyboard.primary();
  }
  keyboard.text(
    locale === 'id-ID' ? '✓ Indonesia (id-ID)' : 'Indonesia (id-ID)',
    'lang:set:id-ID',
  );
  if (locale === 'id-ID') {
    keyboard.success();
  } else {
    keyboard.primary();
  }
  keyboard
    .row()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

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
${expandableBlockquote}${groups.map((g) => `• ${g.title} (${g.chatId})`).join('\n')}${expandableBlockquote}`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '↻ Segarkan' : '↻ Refresh', 'nav:groups')
    .primary()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .primary()
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

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
  actionId?: number | null;
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
    actionId,
  } = opts;

  const isId = locale === 'id-ID';
  const countLine =
    count !== undefined
      ? fmt`\n${b}${isId ? 'Grup terdampak' : 'Affected groups'}:${b} ${String(count)}`
      : '';
  const reasonLine = reason
    ? fmt`\n${b}${isId ? 'Alasan' : 'Reason'}:${b}\n${blockquote}${reason}${blockquote}`
    : '';
  const refLine = ref ? fmt`\n${b}Ref:${b} ${code}${ref}${code}` : '';
  const extra = extraLine ? fmt`\n${extraLine}` : '';

  const formatted = fmt`${b}${title}${b}
${b}Target:${b} ${mentionUser(targetLabel, targetId)} (${code}${String(targetId)}${code})${countLine}${reasonLine}${refLine}${extra}`;

  const keyboard = new InlineKeyboard();
  if (actionType === 'ban') {
    keyboard
      .text(isId ? '🔓 Cabut Ban' : '🔓 Unban', `mod:unban:${targetId}`)
      .success();
  } else if (actionType === 'mute') {
    keyboard
      .text(isId ? '🔊 Buka Bisu' : '🔊 Unmute', `mod:unmute:${targetId}`)
      .success();
  }
  keyboard
    .text(isId ? '🔍 Cek Status' : '🔍 Check', `mod:check:${targetId}`)
    .primary()
    .row();

  if (actionId) {
    keyboard
      .text(
        isId ? '📎 Lampirkan Bukti' : '📎 Attach Proof',
        `mod:proof:${actionId}`,
      )
      .primary()
      .text(isId ? '📜 Tandai Pasal' : '📜 Tag Rule', `mod:rule:${actionId}`)
      .primary()
      .row();
  }

  keyboard.text(isId ? '✖ Tutup' : '✖ Close', 'nav:close').danger();

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
${b}Target:${b} ${mentionUser(targetLabel, targetId)} (${code}${String(targetId)}${code})
${b}${isId ? 'Grup terdampak' : 'Affected groups'}:${b} ${String(count)}`;

  const keyboard = new InlineKeyboard()
    .text(isId ? '🔍 Cek Status' : '🔍 Check', `mod:check:${targetId}`)
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  return { formatted, keyboard };
}

export function buildCheckCard(opts: {
  locale: Locale;
  targetLabel: string;
  targetId: number;
  banRef: string | null;
  muteRef: string | null;
  warns: number;
  warnLimit?: number;
  roleLabel?: string | null;
  pendingAppealId?: number | null;
  showStaffActions?: boolean;
}): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const {
    locale,
    targetLabel,
    targetId,
    banRef,
    muteRef,
    warns,
    warnLimit,
    roleLabel,
    pendingAppealId,
    showStaffActions = false,
  } = opts;
  const isId = locale === 'id-ID';
  const warnText = warnLimit ? `${warns}/${warnLimit}` : String(warns);
  const roleLine = roleLabel
    ? fmt`\n• ${b}Role:${b} ${code}${roleLabel}${code}`
    : '';
  const appealLine = pendingAppealId
    ? fmt`\n• ${b}${isId ? 'Banding aktif' : 'Pending appeal'}:${b} #${String(pendingAppealId)}`
    : '';

  const formatted =
    !banRef && !muteRef && warns === 0 && !pendingAppealId
      ? fmt`${b}${isId ? 'Status Bersih' : 'Clean Record'}${b}
${mentionUser(targetLabel, targetId)} (${code}${String(targetId)}${code}) ${isId ? 'tidak memiliki ban, bisu, atau peringatan aktif.' : 'has no active bans, mutes, or warnings.'}${roleLine}`
      : fmt`${b}${isId ? 'Status Moderasi' : 'Moderation Status'}${b}
${b}Target:${b} ${mentionUser(targetLabel, targetId)} (${code}${String(targetId)}${code})
${blockquote}• ${b}Ban:${b} ${banRef ? fmt`${code}${banRef}${code}` : isId ? 'Tidak ada' : 'None'}
• ${b}${isId ? 'Bisu' : 'Mute'}:${b} ${muteRef ? fmt`${code}${muteRef}${code}` : isId ? 'Tidak ada' : 'None'}
• ${b}${isId ? 'Peringatan aktif' : 'Active warns'}:${b} ${warnText}${roleLine}${appealLine}${blockquote}`;

  const keyboard = new InlineKeyboard();
  if (showStaffActions && (banRef || muteRef)) {
    if (banRef) {
      keyboard
        .text(isId ? '🔓 Cabut Ban' : '🔓 Unban', `mod:unban:${targetId}`)
        .success();
    }
    if (muteRef) {
      keyboard
        .text(isId ? '🔊 Buka Bisu' : '🔊 Unmute', `mod:unmute:${targetId}`)
        .success();
    }
    keyboard.row();
  }

  keyboard
    .text(isId ? '⚠️ Riwayat Warn' : '⚠️ Warns', `check:warns:${targetId}:1`)
    .primary()
    .text(
      isId ? '⚖️ Riwayat Banding' : '⚖️ Appeals',
      `check:appeals:${targetId}:1`,
    )
    .primary()
    .row()
    .text(isId ? '↻ Segarkan' : '↻ Refresh', `mod:check:${targetId}`)
    .primary()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .primary()
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  return { formatted, keyboard };
}

export function buildFormatShowcaseCard(opts: {
  locale: Locale;
  userId: number;
  userName: string;
  dropdownOpen: boolean;
  selectedPreset: string;
}): { formatted: FormattedString; keyboard: InlineKeyboard } {
  const { locale, userId, userName, dropdownOpen, selectedPreset } = opts;
  const isId = locale === 'id-ID';

  const presetDetails: Record<string, { id: string; en: string }> = {
    entities: {
      id: 'Semua entity rich-text aktif: bold, italic, underline, strikethrough, code, pre, spoiler, blockquote, dan mention.',
      en: 'All rich-text entities active: bold, italic, underline, strikethrough, code, pre, spoiler, blockquote, and mention.',
    },
    buttons: {
      id: 'Semua gaya tombol aktif: primary (biru), success (hijau), dan danger (merah).',
      en: 'All button styles active: primary (blue), success (green), and danger (red).',
    },
    dropdown: {
      id: 'Dropdown stateless mendukung buka/tutup inline dan tanda ✓ pada opsi aktif.',
      en: 'Stateless dropdown supports inline expand/collapse and ✓ on the active option.',
    },
  };
  const detail = presetDetails[selectedPreset] ?? presetDetails.entities;

  const formatted = fmt`${b}🎨 ${isId ? 'Uji Format & Komponen UI' : 'Format & UI Showcase'}${b}

${b}Inline:${b} ${b}Bold${b} · ${i}Italic${i} · ${u}Underline${u} · ${s}Strike${s} · ${code}Code${code}
${b}Spoiler:${b} ${spoiler}${isId ? 'Teks rahasia tersembunyi' : 'Hidden secret text'}${spoiler}
${b}Mention:${b} ${mentionUser(userName, userId)} (${code}${String(userId)}${code})

${blockquote}${isId ? detail.id : detail.en}${blockquote}

${expandableBlockquote}${b}${isId ? 'Detail Teknis (Expandable)' : 'Technical Details (Expandable)'}${b}
${pre('json')}${JSON.stringify({ preset: selectedPreset, dropdownOpen, locale }, null, 2)}${pre}${expandableBlockquote}`;

  const keyboard = new InlineKeyboard();
  appendDropdown(keyboard, {
    prefix: 'dd:fmt',
    placeholder: isId ? 'Pilih Mode Tampilan' : 'Select View Mode',
    selectedValue: selectedPreset,
    isOpen: dropdownOpen,
    closeLabel: isId ? 'Tutup Pilihan' : 'Close Options',
    columns: 1,
    options: [
      {
        value: 'entities',
        label: isId ? 'Rich Text Entities' : 'Rich Text Entities',
      },
      { value: 'buttons', label: isId ? 'Warna Tombol' : 'Button Colors' },
      {
        value: 'dropdown',
        label: isId ? 'Dropdown Interaktif' : 'Interactive Dropdown',
      },
    ],
  });

  keyboard
    .row()
    .text(isId ? '✅ Aksi Sukses' : '✅ Success', 'fmt:demo:success')
    .success()
    .text(isId ? '🔵 Aksi Utama' : '🔵 Primary', 'fmt:demo:primary')
    .primary()
    .text(isId ? '🔴 Aksi Bahaya' : '🔴 Danger', 'fmt:demo:danger')
    .danger()
    .row()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  return { formatted, keyboard };
}
