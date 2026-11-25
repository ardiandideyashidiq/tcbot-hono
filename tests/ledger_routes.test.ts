import { afterEach, describe, expect, it } from 'bun:test';
import { app } from '../src/index';
import { createSupabaseAdmin } from '../src/lib/supabase';

const configuredEnv = {
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
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SECRET_KEY: 'mock-service-role-key',
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

function installSupabaseStub() {
  const connectedChats = [
    {
      chat_id: -100123456,
      added_by_user_id: 1001,
      added_at: '2026-11-20T00:00:00.000Z',
      is_active: true,
    },
  ];
  const groups = [
    {
      chat_id: -100123456,
      title: 'Grup Komunitas Utama',
      chat_type: 'supergroup',
      is_active: true,
      added_at: '2026-11-20T00:00:00.000Z',
    },
  ];
  const ruleSets: Array<{ id: number; slug: string; title: string }> = [];
  const ruleVersions: Array<{
    id: number;
    rule_set_id: number;
    version_number: number;
    status: string;
    locale: string;
  }> = [];
  const ruleItems: Array<{
    id: number;
    version_id: number;
    rule_key: string;
    category_key: string;
    category_title: string | null;
    title: string;
    body: string;
    is_mandatory: boolean;
    sort_order: number;
  }> = [];
  const auditLogs: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.origin !== 'https://mock.supabase.co') {
      throw new Error(`Unexpected external fetch to ${url.toString()}`);
    }

    const table = url.pathname.replace('/rest/v1/', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const accept = new Headers(init?.headers).get('Accept') ?? '';
    const isSingle = accept.includes('application/vnd.pgrst.object+json');
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : null;

    if (table === 'connected_chats') {
      const eqChat = url.searchParams.get('chat_id');
      if (method === 'GET') {
        const filtered = eqChat
          ? connectedChats.filter((g) => `eq.${g.chat_id}` === eqChat)
          : connectedChats;
        if (isSingle) {
          if (!filtered[0]) {
            return Response.json(
              { code: 'PGRST116', message: 'Not found' },
              { status: 406 },
            );
          }
          return Response.json(filtered[0]);
        }
        return Response.json(filtered, {
          headers: {
            'Content-Range': `0-${Math.max(0, filtered.length - 1)}/${filtered.length}`,
          },
        });
      }
      if (method === 'PATCH' && body && eqChat) {
        const target = connectedChats.find((g) => `eq.${g.chat_id}` === eqChat);
        if (!target) {
          return Response.json(
            { code: 'PGRST116', message: 'Not found' },
            { status: 406 },
          );
        }
        target.is_active = Boolean(body.is_active);
        return Response.json(
          isSingle
            ? { chat_id: target.chat_id, is_active: target.is_active }
            : [target],
        );
      }
    }

    if (table === 'telegram_chats') {
      const eqChat = url.searchParams.get('chat_id');
      if (method === 'GET') {
        const filtered = eqChat
          ? groups.filter((g) => `eq.${g.chat_id}` === eqChat)
          : groups;
        if (isSingle) {
          if (!filtered[0]) {
            return Response.json(
              { code: 'PGRST116', message: 'Not found' },
              { status: 406 },
            );
          }
          return Response.json(filtered[0]);
        }
        return Response.json(filtered, {
          headers: {
            'Content-Range': `0-${Math.max(0, filtered.length - 1)}/${filtered.length}`,
          },
        });
      }
      if (method === 'PATCH' && body && eqChat) {
        const target = groups.find((g) => `eq.${g.chat_id}` === eqChat);
        if (!target) {
          return Response.json(
            { code: 'PGRST116', message: 'Not found' },
            { status: 406 },
          );
        }
        target.is_active = Boolean(body.is_active);
        return Response.json(
          isSingle
            ? { chat_id: target.chat_id, is_active: target.is_active }
            : [target],
        );
      }
    }

    if (table === 'rule_sets') {
      if (method === 'GET') {
        return Response.json(isSingle ? (ruleSets[0] ?? null) : ruleSets);
      }
      if (method === 'POST' && body) {
        const created = {
          id: ruleSets.length + 1,
          slug: String(body.slug ?? 'default'),
          title: String(body.title ?? 'Aturan'),
        };
        ruleSets.push(created);
        return Response.json(isSingle ? created : [created], { status: 201 });
      }
    }

    if (table === 'rule_set_versions') {
      if (method === 'GET') {
        return Response.json(
          isSingle ? (ruleVersions[0] ?? null) : ruleVersions,
        );
      }
      if (method === 'POST' && body) {
        const created = {
          id: ruleVersions.length + 1,
          rule_set_id: Number(body.rule_set_id ?? 1),
          version_number: Number(body.version_number ?? 1),
          status: String(body.status ?? 'published'),
          locale: String(body.locale ?? 'id'),
        };
        ruleVersions.push(created);
        return Response.json(isSingle ? created : [created], { status: 201 });
      }
    }

    if (table === 'rule_items') {
      if (method === 'GET') {
        return Response.json(ruleItems, {
          headers: {
            'Content-Range': `0-${Math.max(0, ruleItems.length - 1)}/${ruleItems.length}`,
          },
        });
      }
      if (method === 'POST' && body) {
        const created = {
          id: ruleItems.length + 1,
          version_id: Number(body.version_id ?? 1),
          rule_key: String(body.rule_key ?? 'rule'),
          category_key: String(body.category_key ?? 'umum'),
          category_title:
            typeof body.category_title === 'string'
              ? body.category_title
              : null,
          title: String(body.title ?? ''),
          body: String(body.body ?? ''),
          is_mandatory: Boolean(body.is_mandatory ?? true),
          sort_order: Number(body.sort_order ?? 100),
        };
        ruleItems.push(created);
        return Response.json(isSingle ? created : [created], { status: 201 });
      }
    }

    if (table === 'audit_logs' && method === 'POST' && body) {
      auditLogs.push(body);
      return Response.json([], { status: 201 });
    }

    return Response.json([], { status: 200 });
  }) as typeof fetch;

  return {
    connectedChats,
    groups,
    ruleSets,
    ruleVersions,
    ruleItems,
    auditLogs,
  };
}

describe('Ledger API routes with Supabase stub', () => {
  it('GET /api/ledger/groups and POST /groups/:chatId/toggle mutate group state and validate input', async () => {
    const db = installSupabaseStub();

    const listRes = await app.request(
      '/api/ledger/groups?page=1&limit=10',
      {},
      configuredEnv,
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      configured: boolean;
      items: Array<{ chatId: number; isActive: boolean }>;
    };
    expect(listBody.configured).toBe(true);
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0]?.isActive).toBe(true);

    const invalidRes = await app.request(
      '/api/ledger/groups/not-a-number/toggle',
      { method: 'POST' },
      configuredEnv,
    );
    expect(invalidRes.status).toBe(400);

    const missingRes = await app.request(
      '/api/ledger/groups/-100999/toggle',
      { method: 'POST' },
      configuredEnv,
    );
    expect(missingRes.status).toBe(404);

    const toggleRes = await app.request(
      '/api/ledger/groups/-100123456/toggle',
      { method: 'POST' },
      configuredEnv,
    );
    expect(toggleRes.status).toBe(200);
    const toggleBody = (await toggleRes.json()) as {
      ok: boolean;
      group: { chat_id: number; is_active: boolean };
    };
    expect(toggleBody).toEqual({
      ok: true,
      group: { chat_id: -100123456, is_active: false },
    });
    expect(db.connectedChats[0]?.is_active).toBe(false);
  });

  it('POST /api/ledger/rules validates body, creates fallback rule_set/version, and inserts rule', async () => {
    const db = installSupabaseStub();

    const badRes = await app.request(
      '/api/ledger/rules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x', body: 'y' }),
      },
      configuredEnv,
    );
    expect(badRes.status).toBe(400);

    const createRes = await app.request(
      '/api/ledger/rules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Dilarang Spam Link',
          body: 'Tidak boleh mengirim tautan promosi berulang di grup.',
          categoryTitle: 'Keamanan',
          isMandatory: true,
        }),
      },
      configuredEnv,
    );
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as {
      ok: boolean;
      rule: { id: number; title: string; category_key: string };
    };
    expect(createBody.ok).toBe(true);
    expect(createBody.rule.title).toBe('Dilarang Spam Link');
    expect(createBody.rule.category_key).toBe('keamanan');
    expect(db.ruleSets).toHaveLength(1);
    expect(db.ruleVersions).toHaveLength(1);
    expect(db.ruleItems).toHaveLength(1);
  });

  it('memoizes Supabase client per isolate for identical credentials', () => {
    const first = createSupabaseAdmin(configuredEnv);
    const second = createSupabaseAdmin(configuredEnv);
    expect(first).toBe(second);
  });
});
