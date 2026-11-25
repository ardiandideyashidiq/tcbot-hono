import { afterEach, describe, expect, it } from 'bun:test';
import type { Update } from 'grammy/types';
import { createBot } from '../src/bot';
import { parsePrefixedCommand } from '../src/bot/prefixes';
import {
  clearBotSession,
  getBotSession,
  setBotSession,
} from '../src/bot/session';
import { app } from '../src/index';
import { getSessionSecret, signAdminSession } from '../src/lib/auth';
import {
  releaseStaleAppeals,
  retryPendingEnforcementTargets,
} from '../src/lib/telegram-sync';

const testEnv = {
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
  TELEGRAM_WEBHOOK_SECRET: 'test_secret',
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

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

const FIXED_TIMESTAMP = 1_700_000_000;

function createHarness() {
  const bot = createBot(testEnv);
  const calls: ApiCall[] = [];

  bot.botInfo = {
    id: 999999,
    is_bot: true,
    first_name: 'tcbot',
    username: 'tcbot_test_bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    supports_guest_queries: false,
    needs_inline_query_location: false,
    has_topic_sidebar: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };

  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({
      method,
      payload: payload as unknown as Record<string, unknown>,
    });

    if (method === 'sendMessage' || method === 'editMessageText') {
      return {
        ok: true,
        result: {
          message_id: 99,
          date: FIXED_TIMESTAMP,
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: String((payload as Record<string, unknown>).text ?? ''),
        },
      } as never;
    }

    if (method === 'getMe') {
      return { ok: true, result: bot.botInfo } as never;
    }

    return { ok: true, result: true } as never;
  });

  const sentMessages = () => calls.filter((c) => c.method === 'sendMessage');
  const editedMessages = () =>
    calls.filter((c) => c.method === 'editMessageText');

  return { bot, calls, sentMessages, editedMessages };
}

let updateSeq = 5000;

function makeTextUpdate(
  text: string,
  opts?: {
    userId?: number;
    chatId?: number;
    chatType?: 'private' | 'supergroup';
  },
): Update {
  const userId = opts?.userId ?? 1001;
  const chatId = opts?.chatId ?? userId;
  const chatType = opts?.chatType ?? 'private';

  return {
    update_id: updateSeq++,
    message: {
      message_id: updateSeq++,
      date: FIXED_TIMESTAMP,
      chat:
        chatType === 'private'
          ? { id: chatId, type: 'private', first_name: 'User' }
          : { id: chatId, type: 'supergroup', title: 'Test Group' },
      from: {
        id: userId,
        is_bot: false,
        first_name: 'User',
        language_code: 'id',
      },
      text,
    },
  } as Update;
}

function makeCallbackUpdate(
  data: string,
  opts?: { userId?: number; chatId?: number },
): Update {
  const userId = opts?.userId ?? 1001;
  const chatId = opts?.chatId ?? userId;
  return {
    update_id: updateSeq++,
    callback_query: {
      id: `cb_${updateSeq++}`,
      from: { id: userId, is_bot: false, first_name: 'User' },
      chat_instance: 'ci',
      data,
      message: {
        message_id: 99,
        date: FIXED_TIMESTAMP,
        chat: { id: chatId, type: 'private', first_name: 'User' },
        text: 'msg',
      },
    },
  } as Update;
}

describe('Migrated Python -> Hono features & improved logic', () => {
  it('parsePrefixedCommand supports /, !, . prefixes and @bot mentions', () => {
    expect(parsePrefixedCommand('!tcban 123 spam', '/,!,.')).toEqual({
      prefix: '!',
      command: 'tcban',
      args: '123 spam',
    });
    expect(
      parsePrefixedCommand('.ping@tcbot_test_bot', '/,!,.', 'tcbot_test_bot'),
    ).toEqual({
      prefix: '.',
      command: 'ping',
      args: '',
    });
    expect(
      parsePrefixedCommand('/ping@other_bot', '/,!,.', 'tcbot_test_bot'),
    ).toBeNull();
  });

  it('KV/memory session store sets, gets, and clears scoped sessions', async () => {
    await setBotSession(testEnv, 'stats_search', 1001, { active: true });
    expect(
      await getBotSession<{ active: boolean }>(testEnv, 'stats_search', 1001),
    ).toEqual({ active: true });
    await clearBotSession(testEnv, 'stats_search', 1001);
    expect(
      await getBotSession<{ active: boolean }>(testEnv, 'stats_search', 1001),
    ).toBeNull();
  });

  it('handles custom-prefixed commands (!ping, .speedtest, !additional)', async () => {
    const { bot, sentMessages, editedMessages } = createHarness();

    await bot.handleUpdate(makeTextUpdate('!ping'));
    expect(sentMessages()[0]?.payload.text).toContain('Pong');
    expect(editedMessages()[0]?.payload.text).toContain('Latensi');

    await bot.handleUpdate(makeTextUpdate('.speedtest'));
    expect(sentMessages()[1]?.payload.text).toContain('Speedtest');

    await bot.handleUpdate(makeTextUpdate('!additional'));
    expect(sentMessages()[2]?.payload.text).toContain('Menu Tambahan');
  });

  it('handles help topics, privacy sections, and about sections callbacks', async () => {
    const { bot, editedMessages } = createHarness();

    await bot.handleUpdate(makeCallbackUpdate('help:topic:mod'));
    expect(editedMessages()[0]?.payload.text).toContain('/tcban');

    await bot.handleUpdate(makeCallbackUpdate('privacy:sec:rights'));
    expect(editedMessages()[1]?.payload.text).toContain('/tcforget');

    await bot.handleUpdate(makeCallbackUpdate('about:sec:appeals'));
    expect(editedMessages()[2]?.payload.text).toContain('/appeal');
  });

  it('enforces RBAC on /tcsetrole, /transferowner, /tcdemote confirmation, and /rmtc', async () => {
    const { bot, sentMessages } = createHarness();

    await bot.handleUpdate(
      makeTextUpdate('/tcsetrole 3003 moderator', { userId: 2002 }),
    );
    expect(sentMessages()[0]?.payload.text).toContain('admin atau owner');

    await bot.handleUpdate(
      makeTextUpdate('/transferowner 3003', { userId: 2002 }),
    );
    expect(sentMessages()[1]?.payload.text).toContain('owner');

    await bot.handleUpdate(
      makeTextUpdate('/transferowner 3003', { userId: 1001 }),
    );
    expect(sentMessages()[2]?.payload.text).toContain('Transfer Owner');

    await bot.handleUpdate(makeTextUpdate('/rmtc -100999', { userId: 1001 }));
    expect(sentMessages()[3]?.payload.text).toContain('-100999');
  });

  it('enforces guards on /cleanup, /leaveall, /tcrepair, /tcforget, /tcstats, and /tcrules', async () => {
    const { bot, sentMessages } = createHarness();

    await bot.handleUpdate(makeTextUpdate('/leaveall', { userId: 2002 }));
    expect(sentMessages()[0]?.payload.text).toContain('owner');

    await bot.handleUpdate(makeTextUpdate('/leaveall', { userId: 1001 }));
    expect(sentMessages()[1]?.payload.text).toContain('Leave All');

    await bot.handleUpdate(makeTextUpdate('/tcrepair', { userId: 1001 }));
    expect(sentMessages()[2]?.payload.text).toContain('Enforcement');

    await bot.handleUpdate(makeTextUpdate('/tcforget', { userId: 2002 }));
    expect(sentMessages()[3]?.payload.text).toContain('Penghapusan Data');

    await bot.handleUpdate(makeTextUpdate('/tcstats', { userId: 2002 }));
    expect(sentMessages()[4]?.payload.text).toContain('staf');

    await bot.handleUpdate(makeTextUpdate('/tcrules', { userId: 1001 }));
    expect(sentMessages()[5]?.payload.text).toContain('Rules Editor');
  });

  it('handles #appeal hashtag in groups', async () => {
    const { bot, sentMessages } = createHarness();
    await bot.handleUpdate(
      makeTextUpdate('Tolong cek #appeal saya', {
        userId: 2002,
        chatId: -10012345,
        chatType: 'supergroup',
      }),
    );
    expect(sentMessages()[0]?.payload.text).toContain('/appeal');
  });

  it('background cron helpers safely no-op when Supabase is unconfigured', async () => {
    expect(await retryPendingEnforcementTargets(testEnv)).toEqual({
      retried: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(await releaseStaleAppeals(testEnv)).toEqual({ unlocked: 0 });
  });
});

const configuredLedgerEnv = {
  ...testEnv,
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SECRET_KEY: 'mock-service-role-key',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'test_admin_password',
  ADMIN_SESSION_SECRET: 'test_session_secret_key',
} as unknown as CloudflareBindings;

const unconfiguredLedgerEnv = {
  ...testEnv,
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'test_admin_password',
  ADMIN_SESSION_SECRET: 'test_session_secret_key',
} as unknown as CloudflareBindings;

async function adminCookieHeader(env: CloudflareBindings) {
  const secret = getSessionSecret(env);
  if (!secret) throw new Error('Expected test session secret');
  const token = await signAdminSession('admin', secret);
  return { Cookie: `tcbot_admin_session=${encodeURIComponent(token)}` };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Ledger endpoints for erasures and enforcement runs', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res1 = await app.request(
      '/api/ledger/erasures',
      {},
      configuredLedgerEnv,
    );
    expect(res1.status).toBe(401);

    const res2 = await app.request(
      '/api/ledger/enforcement-runs',
      {},
      configuredLedgerEnv,
    );
    expect(res2.status).toBe(401);

    const res3 = await app.request(
      'http://localhost/api/ledger/enforcement-runs/retry',
      {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
      },
      configuredLedgerEnv,
    );
    expect(res3.status).toBe(401);
  });

  it('handles unconfigured Supabase gracefully on erasures and enforcement-runs', async () => {
    const headers = await adminCookieHeader(unconfiguredLedgerEnv);

    const erasuresRes = await app.request(
      '/api/ledger/erasures?page=1&limit=10',
      { headers },
      unconfiguredLedgerEnv,
    );
    expect(erasuresRes.status).toBe(200);
    expect(await erasuresRes.json()).toEqual({
      configured: false,
      items: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });

    const runsRes = await app.request(
      '/api/ledger/enforcement-runs?page=2&limit=5',
      { headers },
      unconfiguredLedgerEnv,
    );
    expect(runsRes.status).toBe(200);
    expect(await runsRes.json()).toEqual({
      configured: false,
      items: [],
      pagination: { page: 2, limit: 5, total: 0, totalPages: 1 },
    });

    const retryRes = await app.request(
      'http://localhost/api/ledger/enforcement-runs/retry',
      {
        method: 'POST',
        headers: { ...headers, Origin: 'http://localhost' },
      },
      unconfiguredLedgerEnv,
    );
    expect(retryRes.status).toBe(503);
  });

  it('validates pagination query, CSRF origin, and retry payload', async () => {
    const headers = await adminCookieHeader(configuredLedgerEnv);

    const badLimitRes = await app.request(
      '/api/ledger/erasures?limit=99',
      { headers },
      configuredLedgerEnv,
    );
    expect(badLimitRes.status).toBe(400);

    const badPageRes = await app.request(
      '/api/ledger/enforcement-runs?page=0',
      { headers },
      configuredLedgerEnv,
    );
    expect(badPageRes.status).toBe(400);

    const csrfRes = await app.request(
      'http://localhost/api/ledger/enforcement-runs/retry',
      {
        method: 'POST',
        headers: { ...headers, Origin: 'https://evil.example' },
      },
      configuredLedgerEnv,
    );
    expect(csrfRes.status).toBe(403);

    const badRetryBodyRes = await app.request(
      'http://localhost/api/ledger/enforcement-runs/retry',
      {
        method: 'POST',
        headers: {
          ...headers,
          Origin: 'http://localhost',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 0 }),
      },
      configuredLedgerEnv,
    );
    expect(badRetryBodyRes.status).toBe(400);
  });

  it('lists erasures and enforcement runs with pagination and cursor, and retries pending targets', async () => {
    const erasures = [
      {
        id: 12,
        user_id: 5002,
        status: 'completed',
        source: 'telegram_command',
        reason: 'User requested erasure',
        notes: 'Anonymized',
        requested_at: '2026-11-24T10:00:00.000Z',
        processed_at: '2026-11-24T10:01:00.000Z',
        processed_by_user_id: 1001,
        affected: { messages: 3 },
      },
      {
        id: 11,
        user_id: 5001,
        status: 'pending',
        source: 'web_console',
        reason: null,
        notes: null,
        requested_at: '2026-11-23T09:00:00.000Z',
        processed_at: null,
        processed_by_user_id: null,
        affected: {},
      },
    ];

    const runs = [
      {
        id: 77,
        action_id: 301,
        operation: 'ban',
        status: 'partial_failure',
        target_count: 3,
        succeeded_count: 2,
        failed_count: 1,
        skipped_count: 0,
        requested_by_user_id: 1001,
        started_at: '2026-11-24T08:00:00.000Z',
        finished_at: '2026-11-24T08:00:05.000Z',
        created_at: '2026-11-24T08:00:00.000Z',
      },
    ];

    const targets = [
      {
        id: 901,
        run_id: 77,
        chat_id: -100777888,
        attempt_count: 1,
        status: 'failed',
        next_retry_at: null,
      },
    ];

    const updatedTargets: Array<Record<string, unknown>> = [];
    const insertedAttempts: Array<Record<string, unknown>> = [];
    const telegramCalls: string[] = [];

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString();
      const url = new URL(rawUrl);

      if (url.origin === 'https://api.telegram.org') {
        telegramCalls.push(url.pathname);
        return Response.json({ ok: true, result: true });
      }

      if (url.origin !== 'https://mock.supabase.co') {
        throw new Error(`Unexpected external fetch to ${url.toString()}`);
      }

      const table = url.pathname.replace('/rest/v1/', '');
      const method = (init?.method ?? 'GET').toUpperCase();
      const body =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;

      if (table === 'telegram_user_erasures' && method === 'GET') {
        const ltRequested = url.searchParams.get('requested_at');
        let rows = erasures;
        if (ltRequested?.startsWith('lt.')) {
          const cursorVal = ltRequested.slice(3);
          rows = rows.filter((r) => r.requested_at < cursorVal);
        }
        const limitParam = Number(url.searchParams.get('limit') ?? rows.length);
        const sliced = rows.slice(0, limitParam);
        return Response.json(sliced, {
          headers: {
            'Content-Range': `0-${Math.max(0, sliced.length - 1)}/${rows.length}`,
          },
        });
      }

      if (table === 'moderation_enforcement_runs' && method === 'GET') {
        return Response.json(runs, {
          headers: {
            'Content-Range': `0-${Math.max(0, runs.length - 1)}/${runs.length}`,
          },
        });
      }

      if (table === 'moderation_enforcement_targets') {
        if (method === 'GET') {
          return Response.json(targets);
        }
        if (method === 'PATCH' && body) {
          updatedTargets.push(body);
          return Response.json([body]);
        }
      }

      if (table === 'moderation_actions' && method === 'GET') {
        return Response.json([
          { id: 301, target_user_id: 888999, expires_at: null },
        ]);
      }

      if (
        table === 'moderation_enforcement_attempts' &&
        method === 'POST' &&
        body
      ) {
        insertedAttempts.push(body);
        return Response.json([body], { status: 201 });
      }

      return Response.json([]);
    }) as typeof fetch;

    const headers = await adminCookieHeader(configuredLedgerEnv);

    const erasuresPage1 = await app.request(
      '/api/ledger/erasures?page=1&limit=1',
      { headers },
      configuredLedgerEnv,
    );
    expect(erasuresPage1.status).toBe(200);
    const erasuresJson = (await erasuresPage1.json()) as {
      configured: boolean;
      items: Array<{ id: number; userId: number; status: string }>;
      pagination: { nextCursor?: string; total: number; totalPages: number };
    };
    expect(erasuresJson.configured).toBe(true);
    expect(erasuresJson.items).toHaveLength(1);
    expect(erasuresJson.items[0]?.id).toBe(12);
    expect(erasuresJson.items[0]?.userId).toBe(5002);
    expect(erasuresJson.pagination.nextCursor).toBe('2026-11-24T10:00:00.000Z');
    expect(erasuresJson.pagination.total).toBe(2);
    expect(erasuresJson.pagination.totalPages).toBe(2);

    const erasuresPage2 = await app.request(
      `/api/ledger/erasures?page=2&limit=1&cursor=${encodeURIComponent(erasuresJson.pagination.nextCursor ?? '')}`,
      { headers },
      configuredLedgerEnv,
    );
    expect(erasuresPage2.status).toBe(200);
    const erasuresPage2Json = (await erasuresPage2.json()) as {
      items: Array<{ id: number; status: string }>;
    };
    expect(erasuresPage2Json.items.map((item) => item.id)).toEqual([11]);

    const runsRes = await app.request(
      '/api/ledger/enforcement-runs?page=1&limit=10',
      { headers },
      configuredLedgerEnv,
    );
    expect(runsRes.status).toBe(200);
    const runsJson = (await runsRes.json()) as {
      configured: boolean;
      items: Array<{
        id: number;
        actionId: number;
        operation: string;
        failedCount: number;
      }>;
    };
    expect(runsJson.configured).toBe(true);
    expect(runsJson.items).toHaveLength(1);
    expect(runsJson.items[0]).toMatchObject({
      id: 77,
      actionId: 301,
      operation: 'ban',
      failedCount: 1,
    });

    const retryRes = await app.request(
      'http://localhost/api/ledger/enforcement-runs/retry',
      {
        method: 'POST',
        headers: {
          ...headers,
          Origin: 'http://localhost',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 10 }),
      },
      configuredLedgerEnv,
    );
    expect(retryRes.status).toBe(200);
    const retryJson = (await retryRes.json()) as {
      ok: boolean;
      retried: number;
      succeeded: number;
      failed: number;
    };
    expect(retryJson.ok).toBe(true);
    expect(retryJson.retried).toBe(1);
    expect(retryJson.succeeded + retryJson.failed).toBe(1);
    expect(updatedTargets).toHaveLength(1);
    expect(updatedTargets[0]?.attempt_count).toBe(2);
    expect(insertedAttempts).toHaveLength(1);
    expect(insertedAttempts[0]?.attempt_number).toBe(2);

    const emptyBodyRetryRes = await app.request(
      'http://localhost/api/ledger/enforcement-runs/retry',
      {
        method: 'POST',
        headers: {
          ...headers,
          Origin: 'http://localhost',
        },
      },
      configuredLedgerEnv,
    );
    expect(emptyBodyRetryRes.status).toBe(200);
  });

  it('propagates Supabase errors as 500 on erasures and enforcement-runs', async () => {
    globalThis.fetch = (async (): Promise<Response> =>
      Response.json(
        { message: 'Database unavailable' },
        { status: 500 },
      )) as unknown as typeof fetch;

    const headers = await adminCookieHeader(configuredLedgerEnv);

    const erasuresErr = await app.request(
      '/api/ledger/erasures',
      { headers },
      configuredLedgerEnv,
    );
    expect(erasuresErr.status).toBe(500);

    const runsErr = await app.request(
      '/api/ledger/enforcement-runs',
      { headers },
      configuredLedgerEnv,
    );
    expect(runsErr.status).toBe(500);
  });
});
