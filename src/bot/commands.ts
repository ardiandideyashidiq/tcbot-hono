import type { Bot } from 'grammy';
import type { BotCommand, BotCommandScope, LanguageCode } from 'grammy/types';
import type { BotContext } from './context';

export const PUBLIC_COMMANDS_EN: BotCommand[] = [
  { command: 'start', description: 'Main menu & bot overview' },
  { command: 'help', description: 'Show help & command topics' },
  { command: 'ping', description: 'Check bot latency' },
  { command: 'speedtest', description: 'Measure Workers, DB & KV RTT' },
  { command: 'language', description: 'Switch language (en-US / id-ID)' },
  { command: 'checkme', description: 'Check your moderation status' },
  { command: 'rules', description: 'View community rules' },
  { command: 'appeal', description: 'Submit a ban appeal (DM)' },
  { command: 'privacy', description: 'View privacy policy' },
  { command: 'about', description: 'About this bot' },
  { command: 'additional', description: 'Additional resources' },
  { command: 'formattest', description: 'UI & formatting showcase' },
];

export const PUBLIC_COMMANDS_ID: BotCommand[] = [
  { command: 'start', description: 'Menu utama & ringkasan bot' },
  { command: 'help', description: 'Bantuan & topik perintah' },
  { command: 'ping', description: 'Cek latensi bot' },
  { command: 'speedtest', description: 'Ukur latensi Workers, DB & KV' },
  { command: 'language', description: 'Ubah bahasa (en-US / id-ID)' },
  { command: 'checkme', description: 'Cek status moderasi Anda' },
  { command: 'rules', description: 'Lihat aturan komunitas' },
  { command: 'appeal', description: 'Ajukan banding ban (DM)' },
  { command: 'privacy', description: 'Lihat kebijakan privasi' },
  { command: 'about', description: 'Tentang bot ini' },
  { command: 'additional', description: 'Sumber daya tambahan' },
  { command: 'formattest', description: 'Uji tampilan & format UI' },
];

export const GROUP_COMMANDS_EN: BotCommand[] = [
  { command: 'rules', description: 'View community rules' },
  { command: 'checkme', description: 'Check your moderation status' },
  { command: 'admins', description: 'List federation staff' },
  { command: 'help', description: 'Show help & command topics' },
  { command: 'ping', description: 'Check bot latency' },
];

export const GROUP_COMMANDS_ID: BotCommand[] = [
  { command: 'rules', description: 'Lihat aturan komunitas' },
  { command: 'checkme', description: 'Cek status moderasi Anda' },
  { command: 'admins', description: 'Daftar staf federasi' },
  { command: 'help', description: 'Bantuan & topik perintah' },
  { command: 'ping', description: 'Cek latensi bot' },
];

export const ADMIN_COMMANDS_EN: BotCommand[] = [
  ...GROUP_COMMANDS_EN,
  { command: 'tcconnect', description: 'Connect group to federation' },
  { command: 'tcdisconnect', description: 'Disconnect group from federation' },
  { command: 'tcgroups', description: 'List connected groups' },
  { command: 'tcban', description: 'Federation ban a user' },
  { command: 'tcunban', description: 'Lift federation ban' },
  { command: 'tcmute', description: 'Mute a user across federation' },
  { command: 'tcunmute', description: 'Unmute a user' },
  { command: 'tckick', description: 'Kick a user from group' },
  { command: 'tcwarn', description: 'Warn a user' },
  { command: 'tcunwarn', description: 'Remove one warning' },
  { command: 'warns', description: 'Inspect user warnings' },
  { command: 'resetwarns', description: 'Clear user warnings' },
  { command: 'check', description: 'Inspect user moderation history' },
  { command: 'tcbroadcast', description: 'Broadcast message to groups' },
  { command: 'tcrules', description: 'Open community rules editor' },
  { command: 'tcstats', description: 'View federation statistics' },
  { command: 'tcpromote', description: 'Promote or request promotion' },
  { command: 'tcsetrole', description: 'Assign staff role directly' },
  { command: 'tcdemote', description: 'Demote a staff member' },
];

export const ADMIN_COMMANDS_ID: BotCommand[] = [
  ...GROUP_COMMANDS_ID,
  { command: 'tcconnect', description: 'Hubungkan grup ke federasi' },
  { command: 'tcdisconnect', description: 'Putuskan grup dari federasi' },
  { command: 'tcgroups', description: 'Daftar grup terhubung' },
  { command: 'tcban', description: 'Ban pengguna di federasi' },
  { command: 'tcunban', description: 'Cabut ban federasi' },
  { command: 'tcmute', description: 'Bisukan pengguna di federasi' },
  { command: 'tcunmute', description: 'Buka bisu pengguna' },
  { command: 'tckick', description: 'Keluarkan pengguna dari grup' },
  { command: 'tcwarn', description: 'Beri peringatan ke pengguna' },
  { command: 'tcunwarn', description: 'Cabut satu peringatan' },
  { command: 'warns', description: 'Lihat daftar peringatan' },
  { command: 'resetwarns', description: 'Reset semua peringatan' },
  { command: 'check', description: 'Periksa riwayat moderasi' },
  { command: 'tcbroadcast', description: 'Kirim pengumuman ke semua grup' },
  { command: 'tcrules', description: 'Buka editor aturan komunitas' },
  { command: 'tcstats', description: 'Lihat statistik federasi' },
  { command: 'tcpromote', description: 'Promosi atau ajukan promosi' },
  { command: 'tcsetrole', description: 'Atur peran staf langsung' },
  { command: 'tcdemote', description: 'Turunkan peran staf' },
];

export interface CommandSyncTarget {
  commands: BotCommand[];
  scope: BotCommandScope;
  language_code?: LanguageCode;
}

export function getCommandSyncTargets(): CommandSyncTarget[] {
  return [
    { commands: PUBLIC_COMMANDS_EN, scope: { type: 'default' } },
    {
      commands: PUBLIC_COMMANDS_ID,
      scope: { type: 'default' },
      language_code: 'id',
    },
    { commands: PUBLIC_COMMANDS_EN, scope: { type: 'all_private_chats' } },
    {
      commands: PUBLIC_COMMANDS_ID,
      scope: { type: 'all_private_chats' },
      language_code: 'id',
    },
    { commands: GROUP_COMMANDS_EN, scope: { type: 'all_group_chats' } },
    {
      commands: GROUP_COMMANDS_ID,
      scope: { type: 'all_group_chats' },
      language_code: 'id',
    },
    { commands: ADMIN_COMMANDS_EN, scope: { type: 'all_chat_administrators' } },
    {
      commands: ADMIN_COMMANDS_ID,
      scope: { type: 'all_chat_administrators' },
      language_code: 'id',
    },
  ];
}

export async function syncBotCommands(bot: Bot<BotContext>): Promise<number> {
  const targets = getCommandSyncTargets();
  for (const target of targets) {
    await bot.api.setMyCommands(target.commands, {
      scope: target.scope,
      ...(target.language_code ? { language_code: target.language_code } : {}),
    });
  }
  return targets.length;
}
