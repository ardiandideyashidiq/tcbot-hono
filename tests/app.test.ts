import { describe, expect, it } from 'bun:test';
import { testClient } from 'hono/testing';
import app from '../src/index';

const baseEnv = {
  COMMUNITY_NAME: 'Bot',
  PREFIXES: '/,!,.',
  DB_SCHEMA: 'public',
  ALBUM_DEBOUNCE_SECONDS: '4',
  PROMOTION_REQUEST_TTL_DAYS: '7',
  WARN_LIMIT: '3',
  FED_WARN_LIMIT: '0',
  WARN_EXPIRY_DAYS: '0',
  LOG_LEVEL: 'INFO',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_WEBHOOK_SECRET: '',
  SUPABASE_URL: '',
  SUPABASE_SECRET_KEY: '',
  SUPABASE_PUBLISHABLE_KEY: '',
  SUPABASE_JWKS_URL: '',
  OWNER_ID: '',
  PROOFS: '',
  MAIN_GROUP: '',
  MAIN_CHANNEL: '',
  LOGS: '',
  LOGS_ERRORS: '',
  APPEALS: '',
  INFRA_CHAT_IDS: '',
  SENTRY_DSN: '',
} as unknown as CloudflareBindings;

describe('tcbot-hono foundation routes', () => {
  it('GET /api/health returns 200 with unconfigured supabase when env is empty', async () => {
    const client = testClient(app, baseEnv);
    const res = await client.api.health.$get({ query: {} });

    expect(res.status).toBe(200);
    const body = await res.json();
    if (!('ok' in body)) {
      throw new Error('Expected health response payload');
    }
    expect(body.ok).toBe(true);
    expect(body.service).toBe('tcbot-hono');
    expect(body.supabase).toBe('unconfigured');
  });

  it('GET /api/health?strict=true returns 503 when supabase is unconfigured', async () => {
    const client = testClient(app, baseEnv);
    const res = await client.api.health.$get({ query: { strict: 'true' } });

    expect(res.status).toBe(503);
    const body = await res.json();
    if (!('ok' in body)) {
      throw new Error('Expected health response payload');
    }
    expect(body.ok).toBe(false);
  });

  it('POST /webhook/telegram returns 500 when webhook secrets are missing', async () => {
    const res = await app.request(
      '/webhook/telegram',
      { method: 'POST', body: JSON.stringify({}) },
      baseEnv,
    );

    expect(res.status).toBe(500);
  });

  it('GET /api/unknown returns 404 JSON', async () => {
    const res = await app.request('/api/unknown', {}, baseEnv);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'Not Found' });
  });

  it('GET /api/ledger/* endpoints return unconfigured empty lists when supabase is unset', async () => {
    const client = testClient(app, baseEnv);

    const [appealsRes, bansRes, warnsRes, groupsRes, rulesRes, staffRes] =
      await Promise.all([
        client.api.ledger.appeals.$get(),
        client.api.ledger.bans.$get(),
        client.api.ledger.warns.$get(),
        client.api.ledger.groups.$get(),
        client.api.ledger.rules.$get(),
        client.api.ledger.staff.$get(),
      ]);

    for (const res of [
      appealsRes,
      bansRes,
      warnsRes,
      groupsRes,
      rulesRes,
      staffRes,
    ]) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ configured: false, items: [] });
    }
  });
});
