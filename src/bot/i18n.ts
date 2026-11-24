export type Locale = 'en-US' | 'id-ID';

const CATALOG: Record<Locale, Record<string, string>> = {
  'en-US': {
    'start.welcome':
      'tcbot is online on Cloudflare Workers.\nUse /help to view available commands.',
    'help.text':
      'Available commands:\n' +
      '/start - Welcome message\n' +
      '/help - Show this help\n' +
      '/ping - Check bot latency\n' +
      '/language - Switch language (en-US / id-ID)\n' +
      '/checkme - Check your moderation status\n\n' +
      'Staff commands:\n' +
      '/tcconnect - Connect this group to the federation\n' +
      '/tcdisconnect - Disconnect this group\n' +
      '/tcgroups - List connected groups\n' +
      '/tcban <user> [reason] - Ban user across federation\n' +
      '/tcunban <user> - Unban user\n' +
      '/tcmute <user> [duration] [reason] - Mute user\n' +
      '/tcunmute <user> - Unmute user\n' +
      '/tcwarn <user> [reason] - Warn user\n' +
      '/check <user> - Inspect user moderation status',
    'lang.prompt': 'Select your preferred language:',
    'lang.updated': 'Language updated to {locale}.',
    'err.staff_only': 'This command is restricted to federation staff.',
    'err.admin_only':
      'This command is restricted to federation admins or owner.',
    'err.group_only': 'This command can only be used inside a group.',
    'err.target_missing':
      'Reply to a user or provide a numeric user ID / @username.',
    'err.self_target': 'You cannot target yourself.',
    'group.connected': 'Group connected to the federation ({title}).',
    'group.disconnected': 'Group disconnected from the federation.',
    'group.none': 'No connected groups yet.',
    'mod.banned': 'Banned {target} across {count} group(s).\nRef: {ref}',
    'mod.unbanned': 'Unbanned {target} across {count} group(s).',
    'mod.muted': 'Muted {target} across {count} group(s).\nRef: {ref}',
    'mod.unmuted': 'Unmuted {target} across {count} group(s).',
    'mod.warned': 'Warned {target} ({warns}/{limit}).\nRef: {ref}',
    'mod.autoban':
      'Warn limit reached ({warns}/{limit}). {target} was auto-banned.',
    'check.clean': '{target} has no active bans, mutes, or warnings.',
    'check.summary':
      'Moderation status for {target}:\nActive ban: {ban}\nActive mute: {mute}\nActive warns: {warns}',
  },
  'id-ID': {
    'start.welcome':
      'tcbot aktif di Cloudflare Workers.\nGunakan /help untuk melihat daftar perintah.',
    'help.text':
      'Perintah tersedia:\n' +
      '/start - Pesan pembuka\n' +
      '/help - Tampilkan bantuan ini\n' +
      '/ping - Cek respons bot\n' +
      '/language - Ubah bahasa (en-US / id-ID)\n' +
      '/checkme - Cek status moderasi Anda\n\n' +
      'Perintah staf:\n' +
      '/tcconnect - Hubungkan grup ini ke federasi\n' +
      '/tcdisconnect - Putuskan grup dari federasi\n' +
      '/tcgroups - Daftar grup terhubung\n' +
      '/tcban <user> [alasan] - Ban pengguna di seluruh federasi\n' +
      '/tcunban <user> - Cabut ban pengguna\n' +
      '/tcmute <user> [durasi] [alasan] - Bisukan pengguna\n' +
      '/tcunmute <user> - Buka bisu pengguna\n' +
      '/tcwarn <user> [alasan] - Beri peringatan pengguna\n' +
      '/check <user> - Periksa status moderasi pengguna',
    'lang.prompt': 'Pilih bahasa yang diinginkan:',
    'lang.updated': 'Bahasa diubah ke {locale}.',
    'err.staff_only': 'Perintah ini hanya untuk staf federasi.',
    'err.admin_only': 'Perintah ini hanya untuk admin atau owner federasi.',
    'err.group_only': 'Perintah ini hanya dapat digunakan di dalam grup.',
    'err.target_missing':
      'Balas pesan pengguna atau sertakan user ID / @username.',
    'err.self_target': 'Anda tidak dapat menargetkan diri sendiri.',
    'group.connected': 'Grup terhubung ke federasi ({title}).',
    'group.disconnected': 'Grup diputuskan dari federasi.',
    'group.none': 'Belum ada grup terhubung.',
    'mod.banned': 'Pengguna {target} di-ban di {count} grup.\nRef: {ref}',
    'mod.unbanned': 'Ban {target} dicabut di {count} grup.',
    'mod.muted': 'Pengguna {target} dibisukan di {count} grup.\nRef: {ref}',
    'mod.unmuted': 'Bisu {target} dicabut di {count} grup.',
    'mod.warned': 'Peringatan untuk {target} ({warns}/{limit}).\nRef: {ref}',
    'mod.autoban':
      'Batas peringatan tercapai ({warns}/{limit}). {target} otomatis di-ban.',
    'check.clean': '{target} tidak memiliki ban, bisu, atau peringatan aktif.',
    'check.summary':
      'Status moderasi {target}:\nBan aktif: {ban}\nBisu aktif: {mute}\nPeringatan aktif: {warns}',
  },
};

export function normalizeLocale(raw?: string | null): Locale {
  if (!raw) return 'id-ID';
  const lower = raw.toLowerCase();
  if (lower.startsWith('en')) return 'en-US';
  if (lower.startsWith('id')) return 'id-ID';
  return 'id-ID';
}

export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const template = CATALOG[locale][key] ?? CATALOG['en-US'][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}
