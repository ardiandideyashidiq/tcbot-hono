import { describe, expect, it } from 'bun:test';
import {
  isAdminOrOwner,
  isStaffRole,
  parseDurationSeconds,
  resolveTargetUser,
} from '../src/bot/db';
import { normalizeLocale, t } from '../src/bot/i18n';
import app from '../src/index';

const botEnv = {
  COMMUNITY_NAME: 'Bot',
  PREFIXES: '/,!,.',
  DB_SCHEMA: 'public',
  ALBUM_DEBOUNCE_SECONDS: '4',
  PROMOTION_REQUEST_TTL_DAYS: '7',
  WARN_LIMIT: '3',
  FED_WARN_LIMIT: '0',
  WARN_EXPIRY_DAYS: '0',
  LOG_LEVEL: 'INFO',
  TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN',
  TELEGRAM_WEBHOOK_SECRET: 'super_secret_token',
  SUPABASE_URL: '',
  SUPABASE_SECRET_KEY: '',
  SUPABASE_PUBLISHABLE_KEY: '',
  SUPABASE_JWKS_URL: '',
  OWNER_ID: '1001',
  PROOFS: '',
  MAIN_GROUP: '',
  MAIN_CHANNEL: '',
  LOGS: '',
  LOGS_ERRORS: '',
  APPEALS: '',
  INFRA_CHAT_IDS: '',
  SENTRY_DSN: '',
} as unknown as CloudflareBindings;

describe('Telegram Bot MVP helpers & webhook', () => {
  it('parseDurationSeconds enforces 60s floor and 366d cap', () => {
    expect(parseDurationSeconds('10s')).toBe(60);
    expect(parseDurationSeconds('5m')).toBe(300);
    expect(parseDurationSeconds('2h')).toBe(7200);
    expect(parseDurationSeconds('7d')).toBe(604800);
    expect(parseDurationSeconds('2ye')).toBe(366 * 86400);
    expect(parseDurationSeconds('invalid')).toBeNull();
  });

  it('i18n normalizes locales and interpolates variables', () => {
    expect(normalizeLocale('en')).toBe('en-US');
    expect(normalizeLocale('id')).toBe('id-ID');
    expect(normalizeLocale(undefined)).toBe('id-ID');
    expect(t('id-ID', 'lang.updated', { locale: 'id-ID' })).toBe(
      'Bahasa diubah ke id-ID.',
    );
    expect(t('en-US', 'lang.updated', { locale: 'en-US' })).toBe(
      'Language updated to en-US.',
    );
  });

  it('role helpers enforce staff and admin gates', () => {
    expect(isStaffRole('moderator')).toBe(true);
    expect(isStaffRole('developer')).toBe(true);
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('owner')).toBe(true);
    expect(isStaffRole(null)).toBe(false);

    expect(isAdminOrOwner('owner')).toBe(true);
    expect(isAdminOrOwner('admin')).toBe(true);
    expect(isAdminOrOwner('moderator')).toBe(false);
  });

  it('resolveTargetUser parses numeric ID and reply target', async () => {
    const byId = await resolveTargetUser(null, '987654321 spam link');
    expect(byId).toEqual({
      userId: 987654321,
      label: '987654321',
      remainingArgs: ['spam', 'link'],
    });

    const byReply = await resolveTargetUser(null, '7d toxic', {
      id: 555111,
      is_bot: false,
      first_name: 'Budi',
      username: 'budi_dev',
    });
    expect(byReply).toEqual({
      userId: 555111,
      label: '@budi_dev',
      remainingArgs: ['7d', 'toxic'],
    });
  });

  it('POST /webhook/telegram rejects invalid secret token with 401', async () => {
    const res = await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'wrong_secret',
        },
        body: JSON.stringify({ update_id: 1 }),
      },
      botEnv,
    );

    expect(res.status).toBe(401);
  });
});
