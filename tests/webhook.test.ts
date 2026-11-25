import { afterEach, describe, expect, it } from 'bun:test';
import type { Update } from 'grammy/types';
import { app } from '../src/index';

const webhookEnv = {
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
  TELEGRAM_WEBHOOK_SECRET: 'local_webhook_secret',
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

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

interface RecordedTelegramCall {
  method: string;
  body: Record<string, unknown>;
}

function installTelegramFetchStub() {
  const calls: RecordedTelegramCall[] = [];

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.startsWith('https://api.telegram.org/')) {
      throw new Error(`Unexpected external fetch to ${url}`);
    }

    const method = url.split('/').pop() ?? 'unknown';
    let body: Record<string, unknown> = {};
    if (typeof init?.body === 'string') {
      body = JSON.parse(init.body) as Record<string, unknown>;
    }

    calls.push({ method, body });

    if (method === 'getMe') {
      return Response.json({
        ok: true,
        result: {
          id: 999999,
          is_bot: true,
          first_name: 'tcbot',
          username: 'tcbot_test_bot',
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
        },
      });
    }

    if (method === 'sendMessage' || method === 'editMessageText') {
      return Response.json({
        ok: true,
        result: {
          message_id: 42,
          date: 1700000000,
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: String(body.text ?? ''),
        },
      });
    }

    return Response.json({ ok: true, result: true });
  }) as typeof fetch;

  return calls;
}

function makeStartUpdate(updateId: number): Update {
  return {
    update_id: updateId,
    message: {
      message_id: 10,
      date: 1700000000,
      chat: { id: 1001, type: 'private', first_name: 'Owner' },
      from: {
        id: 1001,
        is_bot: false,
        first_name: 'Owner',
        language_code: 'id',
      },
      text: '/start',
      entities: [{ offset: 0, length: 6, type: 'bot_command' }],
    },
  };
}

describe('POST /webhook/telegram end-to-end reliability', () => {
  it('returns 401 before calling Telegram API when secret token is missing or wrong', async () => {
    const calls = installTelegramFetchStub();

    const missingSecretRes = await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makeStartUpdate(1)),
      },
      webhookEnv,
    );
    expect(missingSecretRes.status).toBe(401);

    const wrongSecretRes = await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'wrong',
        },
        body: JSON.stringify(makeStartUpdate(2)),
      },
      webhookEnv,
    );
    expect(wrongSecretRes.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('processes /start update through Hono + grammY webhookCallback and sends rich reply', async () => {
    const calls = installTelegramFetchStub();

    const res = await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'local_webhook_secret',
        },
        body: JSON.stringify(makeStartUpdate(101)),
      },
      webhookEnv,
    );

    expect(res.status).toBe(200);
    const sendCall = calls.find((c) => c.method === 'sendMessage');
    expect(String(sendCall?.body.text)).toContain('Cloudflare Workers');
    expect(sendCall?.body.entities).toBeDefined();
    expect(sendCall?.body.reply_markup).toBeDefined();

    // Second request in the same isolate reuses memoized bot/botInfo (no extra getMe)
    const callsBeforeSecond = calls.length;
    const secondRes = await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'local_webhook_secret',
        },
        body: JSON.stringify(makeStartUpdate(103)),
      },
      webhookEnv,
    );
    expect(secondRes.status).toBe(200);
    const secondWaveCalls = calls.slice(callsBeforeSecond);
    expect(secondWaveCalls.some((c) => c.method === 'getMe')).toBe(false);
    expect(secondWaveCalls.some((c) => c.method === 'sendMessage')).toBe(true);
  });

  it('processes callback_query update via webhook and answers + edits message', async () => {
    const calls = installTelegramFetchStub();

    const callbackUpdate: Update = {
      update_id: 102,
      callback_query: {
        id: 'cb_webhook_1',
        from: {
          id: 1001,
          is_bot: false,
          first_name: 'Owner',
          language_code: 'id',
        },
        chat_instance: 'ci_webhook_1',
        data: 'nav:help',
        message: {
          message_id: 42,
          date: 1700000000,
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: 'Start',
        },
      },
    };

    const res = await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'local_webhook_secret',
        },
        body: JSON.stringify(callbackUpdate),
      },
      webhookEnv,
    );

    expect(res.status).toBe(200);
    expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    const editCall = calls.find((c) => c.method === 'editMessageText');
    expect(editCall).toBeDefined();
    expect(String(editCall?.body.text)).toContain('Daftar Perintah');
  });

  it('rejects malformed JSON body without throwing unhandled errors', async () => {
    installTelegramFetchStub();

    const res = await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'local_webhook_secret',
        },
        body: '{not-valid-json',
      },
      webhookEnv,
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 200 immediately and schedules handleUpdate on executionCtx.waitUntil when available', async () => {
    const calls = installTelegramFetchStub();
    const pending: Promise<unknown>[] = [];
    const mockExecCtx = {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
      passThroughOnException() {},
    } as unknown as ExecutionContext;

    const res = await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'local_webhook_secret',
        },
        body: JSON.stringify(makeStartUpdate(104)),
      },
      webhookEnv,
      mockExecCtx,
    );

    expect(res.status).toBe(200);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(calls.some((c) => c.method === 'sendMessage')).toBe(true);
  });
});
