import type { Chat, User } from 'grammy/types';
import type { RoleKey } from '../db/types';
import type { TypedSupabaseClient } from '../lib/supabase';
import { type Locale, normalizeLocale } from './i18n';

const MIN_DURATION_SECONDS = 60;
const MAX_DURATION_SECONDS = 366 * 24 * 60 * 60;

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 7 * 86400,
  mo: 30 * 86400,
  ye: 365 * 86400,
};

/**
 * Parses duration tokens such as `30m`, `2h`, `7d`, `1w`, `1mo`.
 * Enforces legacy bounds: 60s minimum, 366d maximum.
 */
export function parseDurationSeconds(raw?: string): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d+)(mo|ye|[smhdw])$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = DURATION_UNITS[unit];
  if (!multiplier || !Number.isFinite(amount) || amount <= 0) return null;

  const seconds = amount * multiplier;
  if (seconds < MIN_DURATION_SECONDS) return MIN_DURATION_SECONDS;
  if (seconds > MAX_DURATION_SECONDS) return MAX_DURATION_SECONDS;
  return seconds;
}

export async function upsertTelegramUser(
  supabase: TypedSupabaseClient,
  user: User,
): Promise<void> {
  await supabase.from('telegram_users').upsert(
    {
      user_id: user.id,
      username: user.username ?? null,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      language_code: user.language_code ?? null,
      is_bot: user.is_bot,
      is_premium: Boolean(user.is_premium),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}

export async function upsertTelegramChat(
  supabase: TypedSupabaseClient,
  chat: Chat,
): Promise<void> {
  const title = 'title' in chat ? (chat.title ?? null) : null;
  const username = 'username' in chat ? (chat.username ?? null) : null;
  const isForum = 'is_forum' in chat ? Boolean(chat.is_forum) : false;

  await supabase.from('telegram_chats').upsert(
    {
      chat_id: chat.id,
      chat_type: chat.type,
      title,
      username,
      is_forum: isForum,
    },
    { onConflict: 'chat_id' },
  );
}

export async function getUserRole(
  supabase: TypedSupabaseClient | null,
  userId: number,
  ownerIdEnv: string,
): Promise<RoleKey | null> {
  const envOwner = Number(ownerIdEnv);
  if (Number.isFinite(envOwner) && envOwner > 0 && userId === envOwner) {
    return 'owner';
  }
  if (!supabase) return null;

  const { data } = await supabase
    .from('role_assignments')
    .select('role_key')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  const key = data?.role_key;
  if (
    key === 'owner' ||
    key === 'admin' ||
    key === 'developer' ||
    key === 'moderator'
  ) {
    return key;
  }
  return null;
}

export async function ensureOwnerAssignment(
  supabase: TypedSupabaseClient,
  userId: number,
  ownerIdEnv: string,
): Promise<void> {
  const envOwner = Number(ownerIdEnv);
  if (!Number.isFinite(envOwner) || envOwner <= 0 || userId !== envOwner) {
    return;
  }

  const { data: existing } = await supabase
    .from('role_assignments')
    .select('id')
    .eq('role_key', 'owner')
    .eq('status', 'active')
    .maybeSingle();

  if (!existing) {
    await supabase.from('role_assignments').insert({
      user_id: userId,
      role_key: 'owner',
      assigned_by_user_id: userId,
      status: 'active',
    });
  }
}

export function isStaffRole(role: RoleKey | null): boolean {
  return (
    role === 'owner' ||
    role === 'admin' ||
    role === 'developer' ||
    role === 'moderator'
  );
}

export function isAdminOrOwner(role: RoleKey | null): boolean {
  return role === 'owner' || role === 'admin';
}

const LOCALE_CACHE_TTL_MS = 60_000;
const LOCALE_CACHE_MAX_SIZE = 4096;
const localeCache = new Map<number, { locale: Locale; expiresAt: number }>();

export function setCachedUserLocale(userId: number, locale: Locale): void {
  if (localeCache.size >= LOCALE_CACHE_MAX_SIZE) {
    const oldestKey = localeCache.keys().next().value;
    if (oldestKey !== undefined) {
      localeCache.delete(oldestKey);
    }
  }
  localeCache.set(userId, {
    locale,
    expiresAt: Date.now() + LOCALE_CACHE_TTL_MS,
  });
}

export async function resolveUserLocale(
  supabase: TypedSupabaseClient | null,
  userId: number | undefined,
  fallbackLanguageCode?: string,
): Promise<Locale> {
  if (supabase && userId) {
    const cached = localeCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.locale;
    }
    const { data } = await supabase
      .from('user_settings')
      .select('locale')
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.locale) {
      const normalized = normalizeLocale(data.locale);
      setCachedUserLocale(userId, normalized);
      return normalized;
    }
    const fallback = normalizeLocale(fallbackLanguageCode);
    setCachedUserLocale(userId, fallback);
    return fallback;
  }
  return normalizeLocale(fallbackLanguageCode);
}

export interface TargetResolution {
  userId: number;
  label: string;
  remainingArgs: string[];
}

export async function resolveTargetUser(
  supabase: TypedSupabaseClient | null,
  argsText: string,
  replyUser?: User,
): Promise<TargetResolution | null> {
  const tokens = argsText.trim().split(/\s+/).filter(Boolean);

  if (replyUser && !tokens[0]?.match(/^(@[A-Za-z0-9_]{3,}|-?\d+)$/)) {
    const label = replyUser.username
      ? `@${replyUser.username}`
      : replyUser.first_name || String(replyUser.id);
    return {
      userId: replyUser.id,
      label,
      remainingArgs: tokens,
    };
  }

  const first = tokens[0];
  if (!first) {
    if (replyUser) {
      return {
        userId: replyUser.id,
        label: replyUser.username
          ? `@${replyUser.username}`
          : String(replyUser.id),
        remainingArgs: [],
      };
    }
    return null;
  }

  if (/^\d+$/.test(first)) {
    const uid = Number(first);
    return { userId: uid, label: String(uid), remainingArgs: tokens.slice(1) };
  }

  if (first.startsWith('@') && supabase) {
    const uname = first.slice(1);
    const { data } = await supabase
      .from('telegram_users')
      .select('user_id, username')
      .ilike('username', uname)
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        userId: data.user_id,
        label: data.username ? `@${data.username}` : String(data.user_id),
        remainingArgs: tokens.slice(1),
      };
    }
  }

  if (replyUser) {
    return {
      userId: replyUser.id,
      label: replyUser.username
        ? `@${replyUser.username}`
        : String(replyUser.id),
      remainingArgs: tokens,
    };
  }

  return null;
}

export async function getActiveConnectedChatIds(
  supabase: TypedSupabaseClient,
): Promise<number[]> {
  const { data } = await supabase
    .from('connected_chats')
    .select('chat_id')
    .eq('is_active', true);

  return (data ?? []).map((row) => row.chat_id);
}
