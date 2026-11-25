export type Locale = 'en-US' | 'id-ID';

const CATALOG: Record<Locale, Record<string, string>> = {
  'en-US': {
    'start.welcome':
      'tcbot is online on Cloudflare Workers.\nUse /help to view available commands.',
    'help.text':
      'Available commands:\n' +
      '/start - Welcome message\n' +
      '/help - Show interactive help topics\n' +
      '/ping - Check bot latency\n' +
      '/speedtest - Measure Workers, DB & KV latency\n' +
      '/language - Switch language (en-US / id-ID)\n' +
      '/checkme - Check your moderation status\n' +
      '/rules - View community rules\n' +
      '/appeal - Submit a ban appeal (DM)\n' +
      '/privacy - Privacy policy & data rights\n' +
      '/about - About this community\n\n' +
      'Staff commands:\n' +
      '/tcconnect, /tcdisconnect, /rmtc, /tcgroups\n' +
      '/tcban, /tcunban, /tcmute, /tcunmute, /tckick\n' +
      '/tcwarn, /tcunwarn, /warns, /resetwarns\n' +
      '/check, /tcrules, /tcbroadcast, /tcstats\n' +
      '/admins, /tcpromote, /tcsetrole, /tcdemote, /transferowner\n' +
      '/cleanup, /leaveall, /tcrepair, /tcforget',
    'lang.prompt': 'Select your preferred language:',
    'lang.updated': 'Language updated to {locale}.',
    'err.staff_only': 'This command is restricted to federation staff.',
    'err.admin_only':
      'This command is restricted to federation admins or owner.',
    'err.owner_only': 'This command is restricted to the federation owner.',
    'err.group_only': 'This command can only be used inside a group.',
    'err.dm_only':
      'Please use this command in a direct message (DM) with the bot.',
    'err.target_missing':
      'Reply to a user or provide a numeric user ID / @username.',
    'err.self_target': 'You cannot target yourself.',
    'err.db_unconfigured': 'Database is not configured.',
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
      '/help - Tampilkan bantuan interaktif\n' +
      '/ping - Cek respons bot\n' +
      '/speedtest - Ukur latensi Workers, DB & KV\n' +
      '/language - Ubah bahasa (en-US / id-ID)\n' +
      '/checkme - Cek status moderasi Anda\n' +
      '/rules - Lihat aturan komunitas\n' +
      '/appeal - Ajukan banding ban (DM)\n' +
      '/privacy - Kebijakan privasi & hak data\n' +
      '/about - Tentang komunitas ini\n\n' +
      'Perintah staf:\n' +
      '/tcconnect, /tcdisconnect, /rmtc, /tcgroups\n' +
      '/tcban, /tcunban, /tcmute, /tcunmute, /tckick\n' +
      '/tcwarn, /tcunwarn, /warns, /resetwarns\n' +
      '/check, /tcrules, /tcbroadcast, /tcstats\n' +
      '/admins, /tcpromote, /tcsetrole, /tcdemote, /transferowner\n' +
      '/cleanup, /leaveall, /tcrepair, /tcforget',
    'lang.prompt': 'Pilih bahasa yang diinginkan:',
    'lang.updated': 'Bahasa diubah ke {locale}.',
    'err.staff_only': 'Perintah ini hanya untuk staf federasi.',
    'err.admin_only': 'Perintah ini hanya untuk admin atau owner federasi.',
    'err.owner_only': 'Perintah ini hanya untuk owner federasi.',
    'err.group_only': 'Perintah ini hanya dapat digunakan di dalam grup.',
    'err.dm_only':
      'Silakan gunakan perintah ini melalui pesan pribadi (DM) ke bot.',
    'err.target_missing':
      'Balas pesan pengguna atau sertakan user ID / @username.',
    'err.self_target': 'Anda tidak dapat menargetkan diri sendiri.',
    'err.db_unconfigured': 'Database belum terkonfigurasi.',
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
