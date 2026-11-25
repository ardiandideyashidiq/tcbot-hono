/**
 * Captures baseline performance metrics for:
 * 1) In-process Hono + grammY + Ledger API throughput (stubbed network, pure app/middleware CPU)
 * 2) Live deployed Cloudflare Worker + Supabase RTT (end-to-end edge + DB latency)
 *
 * Usage:
 *   bun run scripts/benchmark-baseline.ts
 */

import type { Update } from 'grammy/types';
import { app } from '../src/index';
import { getSessionSecret, signAdminSession } from '../src/lib/auth';

interface Stats {
  name: string;
  requests: number;
  concurrency: number;
  totalMs: number;
  rps: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  errors: number;
}

function summarize(
  name: string,
  latenciesMs: number[],
  totalMs: number,
  concurrency: number,
  errors: number,
): Stats {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const pick = (pct: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * pct))] ?? 0;

  return {
    name,
    requests: latenciesMs.length,
    concurrency,
    totalMs: Number(totalMs.toFixed(2)),
    rps: Number(((latenciesMs.length / totalMs) * 1000).toFixed(1)),
    minMs: Number((sorted[0] ?? 0).toFixed(3)),
    p50Ms: Number(pick(0.5).toFixed(3)),
    p95Ms: Number(pick(0.95).toFixed(3)),
    p99Ms: Number(pick(0.99).toFixed(3)),
    maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
    errors,
  };
}

async function benchConcurrent(
  name: string,
  requests: number,
  concurrency: number,
  fn: (index: number) => Promise<boolean>,
): Promise<Stats> {
  const latencies: number[] = [];
  let errors = 0;
  let nextIdx = 0;

  const startedAt = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const idx = nextIdx++;
        if (idx >= requests) break;
        const t0 = performance.now();
        try {
          const ok = await fn(idx);
          if (!ok) errors += 1;
        } catch {
          errors += 1;
        }
        latencies.push(performance.now() - t0);
      }
    }),
  );
  const totalMs = performance.now() - startedAt;

  return summarize(name, latencies, totalMs, concurrency, errors);
}

const benchEnv = {
  COMMUNITY_NAME: 'Bot',
  PREFIXES: '/,!,.',
  DB_SCHEMA: 'public',
  ALBUM_DEBOUNCE_SECONDS: '4',
  PROMOTION_REQUEST_TTL_DAYS: '7',
  WARN_LIMIT: '3',
  FED_WARN_LIMIT: '0',
  WARN_EXPIRY_DAYS: '0',
  LOG_LEVEL: 'INFO',
  TELEGRAM_BOT_TOKEN: '123456:BENCH_TOKEN',
  TELEGRAM_WEBHOOK_SECRET: 'bench_webhook_secret_key',
  SUPABASE_URL: 'https://bench.supabase.co',
  SUPABASE_SECRET_KEY: 'bench-service-role-key',
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
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'bench_admin_password',
  ADMIN_SESSION_SECRET: 'bench_session_secret_key_32chars',
} as unknown as CloudflareBindings;

function installInProcessStubs() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('https://api.telegram.org/')) {
      const method = url.split('/').pop();
      if (method === 'getMe') {
        return Response.json({
          ok: true,
          result: {
            id: 999999,
            is_bot: true,
            first_name: 'tcbot',
            username: 'tcbot_bench_bot',
          },
        });
      }
      return Response.json({
        ok: true,
        result: {
          message_id: 42,
          date: 1700000000,
          chat: { id: 1001, type: 'private', first_name: 'User' },
          text: 'ok',
        },
      });
    }

    if (url.startsWith('https://bench.supabase.co/')) {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/user_settings')) {
        return Response.json({ locale: 'id-ID' });
      }
      return Response.json([], {
        headers: { 'Content-Range': '0-0/0' },
      });
    }

    return originalFetch(input);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function run() {
  const restoreFetch = installInProcessStubs();
  const inProcessResults: Stats[] = [];

  try {
    // Warm up memoized bot & supabase client (simulating warm isolate)
    const warmUpdate: Update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: 1700000000,
        chat: { id: 2002, type: 'private', first_name: 'User' },
        from: {
          id: 2002,
          is_bot: false,
          first_name: 'User',
          language_code: 'id',
        },
        text: '/ping',
        entities: [{ offset: 0, length: 5, type: 'bot_command' }],
      },
    };
    await app.request(
      '/webhook/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'bench_webhook_secret_key',
        },
        body: JSON.stringify(warmUpdate),
      },
      benchEnv,
    );

    inProcessResults.push(
      await benchConcurrent(
        'in-process GET /api/health',
        1000,
        20,
        async () => {
          const res = await app.request('/api/health', {}, benchEnv);
          return res.status === 200;
        },
      ),
    );

    inProcessResults.push(
      await benchConcurrent(
        'in-process POST /webhook/telegram (401 fast-path)',
        1000,
        20,
        async () => {
          const res = await app.request(
            '/webhook/telegram',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Bot-Api-Secret-Token': 'wrong',
              },
              body: '{"update_id":1}',
            },
            benchEnv,
          );
          return res.status === 401;
        },
      ),
    );

    inProcessResults.push(
      await benchConcurrent(
        'in-process POST /webhook/telegram (/ping warm)',
        500,
        10,
        async (i) => {
          const update: Update = {
            ...warmUpdate,
            update_id: 100 + i,
          };
          const res = await app.request(
            '/webhook/telegram',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Bot-Api-Secret-Token': 'bench_webhook_secret_key',
              },
              body: JSON.stringify(update),
            },
            benchEnv,
          );
          return res.status === 200;
        },
      ),
    );

    const adminToken = await signAdminSession(
      'admin',
      getSessionSecret(benchEnv) ?? '',
    );
    const adminCookie = `tcbot_admin_session=${encodeURIComponent(adminToken)}`;

    inProcessResults.push(
      await benchConcurrent(
        'in-process GET /api/ledger/appeals',
        500,
        10,
        async () => {
          const res = await app.request(
            '/api/ledger/appeals?page=1&limit=10',
            { headers: { Cookie: adminCookie } },
            benchEnv,
          );
          return res.status === 200;
        },
      ),
    );
  } finally {
    restoreFetch();
  }

  const liveBase = (
    process.env.BENCH_URL ?? 'https://tcbot-hono.tcbot.workers.dev'
  ).replace(/\/+$/, '');
  const liveRequests = Math.max(1, Number(process.env.LIVE_REQUESTS ?? '40'));
  const liveConcurrency = Math.max(
    1,
    Number(process.env.LIVE_CONCURRENCY ?? '10'),
  );
  const liveResults: Stats[] = [];

  // Warm up Worker edge route + caches.default once
  await fetch(`${liveBase}/api/health`).catch(() => {});
  await fetch(`${liveBase}/api/public/overview`).catch(() => {});

  liveResults.push(
    await benchConcurrent(
      `live GET ${liveBase}/api/health`,
      liveRequests,
      liveConcurrency,
      async () => {
        const res = await fetch(`${liveBase}/api/health`);
        await res.arrayBuffer();
        return res.status === 200;
      },
    ),
  );

  liveResults.push(
    await benchConcurrent(
      `live GET ${liveBase}/api/public/overview`,
      liveRequests,
      liveConcurrency,
      async () => {
        const res = await fetch(`${liveBase}/api/public/overview`);
        await res.arrayBuffer();
        return res.status === 200;
      },
    ),
  );

  liveResults.push(
    await benchConcurrent(
      `live GET ${liveBase}/api/ledger/appeals (401 auth gate)`,
      liveRequests,
      liveConcurrency,
      async () => {
        const res = await fetch(
          `${liveBase}/api/ledger/appeals?page=1&limit=10`,
        );
        await res.arrayBuffer();
        return res.status === 401;
      },
    ),
  );

  liveResults.push(
    await benchConcurrent(
      `live POST ${liveBase}/webhook/telegram (401 guard)`,
      liveRequests,
      liveConcurrency,
      async () => {
        const res = await fetch(`${liveBase}/webhook/telegram`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': 'bench-invalid',
          },
          body: '{"update_id":1}',
        });
        await res.arrayBuffer();
        return res.status === 401;
      },
    ),
  );

  console.log('=== IN-PROCESS BENCHMARK (BUN) ===');
  console.table(inProcessResults);
  console.log('\n=== LIVE PRODUCTION BASELINE (WORKERS + SUPABASE) ===');
  console.table(liveResults);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
