import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  constantTimeEqual,
  getSessionSecret,
  isTrustedSameOriginMutation,
  signAdminSession,
  verifyAdminRequest,
} from '../lib/auth';
import type { AppEnv } from '../lib/env';

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 5;
const MAX_RATE_LIMIT_ENTRIES = 2048;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function isLoginRateLimited(ip: string, now: number): boolean {
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(ip: string, now: number): void {
  const existing = loginAttempts.get(ip);
  if (!existing || existing.resetAt <= now) {
    if (loginAttempts.size >= MAX_RATE_LIMIT_ENTRIES) {
      const oldest = loginAttempts.keys().next().value;
      if (oldest !== undefined) loginAttempts.delete(oldest);
    }
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  existing.count += 1;
}

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Nama pengguna wajib diisi'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

const authApp = new Hono<AppEnv>()
  .get('/session', async (c) => {
    const configured = Boolean(
      c.env.ADMIN_USERNAME?.trim() && c.env.ADMIN_PASSWORD?.trim(),
    );
    const session = await verifyAdminRequest(c.req.header('Cookie'), c.env);
    return c.json({
      configured,
      authenticated: Boolean(session),
      username: session?.username ?? null,
    });
  })
  .post('/login', zValidator('json', loginSchema), async (c) => {
    if (
      !isTrustedSameOriginMutation(
        c.req.url,
        c.req.header('Origin'),
        c.req.header('Sec-Fetch-Site'),
      )
    ) {
      return c.json({ ok: false, error: 'Forbidden' }, 403);
    }

    const expectedUser = c.env.ADMIN_USERNAME?.trim() ?? '';
    const expectedPass = c.env.ADMIN_PASSWORD?.trim() ?? '';
    const sessionSecret = getSessionSecret(c.env);

    if (!expectedUser || !expectedPass || !sessionSecret) {
      return c.json(
        {
          ok: false,
          error:
            'Kredensial admin belum dikonfigurasi pada environment server.',
        },
        503,
      );
    }

    const clientIp = getClientIp(c.req.raw.headers);
    const now = Date.now();
    if (isLoginRateLimited(clientIp, now)) {
      c.header('Retry-After', '60');
      return c.json(
        {
          ok: false,
          error: 'Terlalu banyak percobaan masuk. Coba lagi dalam 1 menit.',
        },
        429,
      );
    }

    const { username, password } = c.req.valid('json');
    const userOk = constantTimeEqual(username, expectedUser);
    const passOk = constantTimeEqual(password, expectedPass);

    if (!userOk || !passOk) {
      recordFailedLogin(clientIp, now);
      return c.json(
        { ok: false, error: 'Nama pengguna atau kata sandi salah.' },
        401,
      );
    }

    loginAttempts.delete(clientIp);
    const token = await signAdminSession(expectedUser, sessionSecret);
    const isSecure = new URL(c.req.url).protocol === 'https:';
    c.header('Set-Cookie', buildSessionCookie(token, isSecure));

    return c.json({
      ok: true,
      username: expectedUser,
    });
  })
  .post('/logout', (c) => {
    const isSecure = new URL(c.req.url).protocol === 'https:';
    c.header('Set-Cookie', buildClearSessionCookie(isSecure));
    return c.json({ ok: true });
  });

export default authApp;
