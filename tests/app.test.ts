import { describe, expect, it } from 'bun:test';
import { testClient } from 'hono/testing';
import { app } from '../src/index';
import {
  getSessionSecret,
  hashPassword,
  signAdminSession,
  verifyPassword,
} from '../src/lib/auth';
import { expireDueModerationActions } from '../src/lib/telegram-sync';

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
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'test_admin_password',
  ADMIN_SESSION_SECRET: 'test_session_secret_key',
} as unknown as CloudflareBindings;

async function getAdminCookieHeader(env: CloudflareBindings): Promise<string> {
  const secret = getSessionSecret(env);
  if (!secret) throw new Error('Expected test session secret');
  const token = await signAdminSession('admin', secret);
  return `tcbot_admin_session=${encodeURIComponent(token)}`;
}

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

  it('GET /api/public/overview returns public stats and empty lists when supabase is unset', async () => {
    const client = testClient(app, baseEnv);
    const res = await client.api.public.overview.$get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: false,
      communityName: 'Bot',
      stats: {
        connectedGroups: 0,
        publishedRules: 0,
        resolvedAppeals: 0,
        activeModerations: 0,
      },
      rules: [],
      groups: [],
    });
  });

  it('GET /api/ledger/* and POST /api/ledger/* reject unauthenticated requests with 401', async () => {
    const res = await app.request('/api/ledger/appeals', {}, baseEnv);
    expect(res.status).toBe(401);

    const postRes = await app.request(
      '/api/ledger/rules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', body: 'Test rule body' }),
      },
      baseEnv,
    );
    expect(postRes.status).toBe(401);
  });

  it('POST /api/auth/login validates credentials and sets HttpOnly session cookie', async () => {
    const badRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong' }),
      },
      baseEnv,
    );
    expect(badRes.status).toBe(401);

    const okRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          password: 'test_admin_password',
        }),
      },
      baseEnv,
    );
    expect(okRes.status).toBe(200);
    const setCookie = okRes.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('tcbot_admin_session=');
    expect(setCookie).toContain('HttpOnly');

    const sessionRes = await app.request(
      '/api/auth/session',
      { headers: { Cookie: setCookie.split(';')[0] ?? '' } },
      baseEnv,
    );
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.headers.get('Cache-Control')).toBe('no-store');
    expect(await sessionRes.json()).toEqual({
      configured: true,
      authenticated: true,
      username: 'admin',
      role: 'superadmin',
    });
  });

  it('PBKDF2 password hashing verifies matching passwords and /api/admin/users enforces superadmin RBAC', async () => {
    const hash = await hashPassword('secret_pass_123');
    expect(hash.startsWith('pbkdf2_sha256$')).toBe(true);
    expect(await verifyPassword('secret_pass_123', hash)).toBe(true);
    expect(await verifyPassword('wrong_pass', hash)).toBe(false);

    const secret = getSessionSecret(baseEnv);
    if (!secret) throw new Error('Expected test secret');

    const adminToken = await signAdminSession(
      { id: 0, username: 'mod1', role: 'admin', ver: 1 },
      secret,
    );
    const forbiddenRes = await app.request(
      '/api/admin/users',
      {
        headers: {
          Cookie: `tcbot_admin_session=${encodeURIComponent(adminToken)}`,
        },
      },
      baseEnv,
    );
    expect(forbiddenRes.status).toBe(403);

    const superToken = await signAdminSession(
      { id: 0, username: 'admin', role: 'superadmin', ver: 1 },
      secret,
    );
    const allowedRes = await app.request(
      '/api/admin/users',
      {
        headers: {
          Cookie: `tcbot_admin_session=${encodeURIComponent(superToken)}`,
        },
      },
      baseEnv,
    );
    expect(allowedRes.status).toBe(200);
    expect(await allowedRes.json()).toEqual({ configured: false, items: [] });
  });

  it('POST /api/auth/login enforces same-origin CSRF check and brute-force rate limiting', async () => {
    const csrfRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        body: JSON.stringify({
          username: 'admin',
          password: 'test_admin_password',
        }),
      },
      baseEnv,
    );
    expect(csrfRes.status).toBe(403);

    const ipHeaders = {
      'Content-Type': 'application/json',
      'cf-connecting-ip': '203.0.113.42',
    };
    for (let i = 0; i < 5; i += 1) {
      const failRes = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: ipHeaders,
          body: JSON.stringify({ username: 'admin', password: 'wrong' }),
        },
        baseEnv,
      );
      expect(failRes.status).toBe(401);
    }

    const limitedRes = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: ipHeaders,
        body: JSON.stringify({
          username: 'admin',
          password: 'test_admin_password',
        }),
      },
      baseEnv,
    );
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers.get('Retry-After')).toBe('60');
  });

  it('GET /api/ledger/* endpoints return unconfigured empty lists with pagination when authenticated and supabase is unset', async () => {
    const cookie = await getAdminCookieHeader(baseEnv);
    const client = testClient(app, baseEnv);
    const reqInit = { headers: { Cookie: cookie } };

    const [appealsRes, bansRes, warnsRes, groupsRes, rulesRes, staffRes] =
      await Promise.all([
        client.api.ledger.appeals.$get(
          { query: { page: '2', limit: '10' } },
          reqInit,
        ),
        client.api.ledger.bans.$get({ query: {} }, reqInit),
        client.api.ledger.warns.$get({ query: {} }, reqInit),
        client.api.ledger.groups.$get({ query: {} }, reqInit),
        client.api.ledger.rules.$get({ query: {} }, reqInit),
        client.api.ledger.staff.$get({ query: {} }, reqInit),
      ]);

    expect(appealsRes.status).toBe(200);
    expect(await appealsRes.json()).toEqual({
      configured: false,
      items: [],
      pagination: { page: 2, limit: 10, total: 0, totalPages: 1 },
    });

    for (const res of [bansRes, warnsRes, groupsRes, rulesRes, staffRes]) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        configured: false,
        items: [],
        pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
      });
    }
  });

  it('GET /webhook/info reports unconfigured status and sets X-Content-Type-Options', async () => {
    const client = testClient(app, baseEnv);
    const res = await client.webhook.info.$get();

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await res.json()).toEqual({
      configured: false,
      path: '/webhook/telegram',
    });
  });

  it('POST /api/ledger/rules and /groups/:chatId/toggle return 503 when authenticated and supabase is unconfigured', async () => {
    const cookie = await getAdminCookieHeader(baseEnv);
    const client = testClient(app, baseEnv);
    const reqInit = { headers: { Cookie: cookie } };
    const ruleRes = await client.api.ledger.rules.$post(
      {
        json: {
          title: 'Larangan Spam',
          body: 'Dilarang mengirim tautan spam di semua grup.',
          categoryTitle: 'Keamanan',
          isMandatory: true,
        },
      },
      reqInit,
    );
    expect(Number(ruleRes.status)).toBe(503);

    const toggleRes = await client.api.ledger.groups[':chatId'].toggle.$post(
      {
        param: { chatId: '-100123456' },
      },
      reqInit,
    );
    expect(toggleRes.status).toBe(503);
  });

  it('expireDueModerationActions safely no-ops when supabase is unconfigured', async () => {
    const result = await expireDueModerationActions(baseEnv);
    expect(result).toEqual({ expiredCount: 0 });
  });
});
