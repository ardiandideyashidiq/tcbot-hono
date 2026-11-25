import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  type AdminSession,
  buildClearSessionCookie,
  buildSessionCookie,
  constantTimeEqual,
  getSessionSecret,
  hashPassword,
  invalidateAdminSessionCache,
  isTrustedSameOriginMutation,
  signAdminSession,
  verifyAdminRequest,
  verifyPassword,
} from '../lib/auth';
import { type AppEnv, hasSupabaseConfig } from '../lib/env';
import { createSupabaseAdmin } from '../lib/supabase';

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

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
  newPassword: z.string().min(8, 'Kata sandi baru minimal 8 karakter').max(128),
});

const authApp = new Hono<AppEnv>()
  .get('/session', async (c) => {
    const configured = Boolean(
      getSessionSecret(c.env) &&
        (hasSupabaseConfig(c.env) ||
          (c.env.ADMIN_USERNAME?.trim() && c.env.ADMIN_PASSWORD?.trim())),
    );
    const session = await verifyAdminRequest(c.req.header('Cookie'), c.env);
    return c.json({
      configured,
      authenticated: Boolean(session),
      username: session?.username ?? null,
      role: session?.role ?? null,
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

    const sessionSecret = getSessionSecret(c.env);
    if (!sessionSecret) {
      return c.json(
        {
          ok: false,
          error: 'Kunci sesi admin belum dikonfigurasi pada server.',
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

    const { username: rawUsername, password } = c.req.valid('json');
    const normalizedUsername = rawUsername.trim().toLowerCase();

    let authenticatedSession: AdminSession | null = null;

    if (hasSupabaseConfig(c.env)) {
      const supabase = createSupabaseAdmin(c.env);
      const { data: account } = await supabase
        .from('admin_accounts')
        .select('id, username, password_hash, role, is_active, token_version')
        .eq('username', normalizedUsername)
        .maybeSingle();

      if (account) {
        const valid =
          account.is_active &&
          (await verifyPassword(password, account.password_hash));
        if (valid) {
          authenticatedSession = {
            id: account.id,
            username: account.username,
            role: account.role === 'superadmin' ? 'superadmin' : 'admin',
            ver: account.token_version,
          };
          void supabase
            .from('admin_accounts')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', account.id);
        }
      } else {
        // Bootstrap initial superadmin on first login if admin_accounts is empty
        const { count } = await supabase
          .from('admin_accounts')
          .select('id', { count: 'exact', head: true });
        const expectedUser = c.env.ADMIN_USERNAME?.trim().toLowerCase() ?? '';
        const expectedPass = c.env.ADMIN_PASSWORD?.trim() ?? '';
        if (
          (count ?? 0) === 0 &&
          expectedUser &&
          expectedPass &&
          constantTimeEqual(normalizedUsername, expectedUser) &&
          constantTimeEqual(password, expectedPass)
        ) {
          const passwordHash = await hashPassword(password);
          const { data: created } = await supabase
            .from('admin_accounts')
            .insert({
              username: expectedUser,
              display_name: 'Superadmin',
              password_hash: passwordHash,
              role: 'superadmin',
              is_active: true,
              last_login_at: new Date().toISOString(),
            })
            .select('id, username, role, token_version')
            .single();
          if (created) {
            authenticatedSession = {
              id: created.id,
              username: created.username,
              role: 'superadmin',
              ver: created.token_version,
            };
          }
        }
      }
    } else {
      const expectedUser = c.env.ADMIN_USERNAME?.trim().toLowerCase() ?? '';
      const expectedPass = c.env.ADMIN_PASSWORD?.trim() ?? '';
      if (!expectedUser || !expectedPass) {
        return c.json(
          {
            ok: false,
            error:
              'Kredensial admin belum dikonfigurasi pada environment server.',
          },
          503,
        );
      }
      if (
        constantTimeEqual(normalizedUsername, expectedUser) &&
        constantTimeEqual(password, expectedPass)
      ) {
        authenticatedSession = {
          id: 0,
          username: expectedUser,
          role: 'superadmin',
          ver: 1,
        };
      }
    }

    if (!authenticatedSession) {
      recordFailedLogin(clientIp, now);
      return c.json(
        { ok: false, error: 'Nama pengguna atau kata sandi salah.' },
        401,
      );
    }

    loginAttempts.delete(clientIp);
    const token = await signAdminSession(authenticatedSession, sessionSecret);
    const isSecure = new URL(c.req.url).protocol === 'https:';
    c.header('Set-Cookie', buildSessionCookie(token, isSecure));

    return c.json({
      ok: true,
      username: authenticatedSession.username,
      role: authenticatedSession.role,
    });
  })
  .post('/password', zValidator('json', changePasswordSchema), async (c) => {
    if (
      !isTrustedSameOriginMutation(
        c.req.url,
        c.req.header('Origin'),
        c.req.header('Sec-Fetch-Site'),
      )
    ) {
      return c.json({ ok: false, error: 'Forbidden' }, 403);
    }

    const session = await verifyAdminRequest(c.req.header('Cookie'), c.env);
    if (!session) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!hasSupabaseConfig(c.env) || session.id <= 0) {
      return c.json(
        { ok: false, error: 'Perubahan sandi memerlukan database terhubung.' },
        503,
      );
    }

    const { currentPassword, newPassword } = c.req.valid('json');
    const supabase = createSupabaseAdmin(c.env);
    const { data: account } = await supabase
      .from('admin_accounts')
      .select('id, username, password_hash, role, token_version')
      .eq('id', session.id)
      .maybeSingle();

    if (
      !account ||
      !(await verifyPassword(currentPassword, account.password_hash))
    ) {
      return c.json({ ok: false, error: 'Kata sandi saat ini salah.' }, 401);
    }

    const nextHash = await hashPassword(newPassword);
    const nextVer = account.token_version + 1;
    const { error } = await supabase
      .from('admin_accounts')
      .update({
        password_hash: nextHash,
        token_version: nextVer,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id);

    if (error) {
      return c.json({ ok: false, error: 'Gagal memperbarui kata sandi.' }, 500);
    }

    await invalidateAdminSessionCache(account.id, c.env.BOT_CACHE);
    const sessionSecret = getSessionSecret(c.env);
    if (sessionSecret) {
      const nextToken = await signAdminSession(
        {
          id: account.id,
          username: account.username,
          role: account.role === 'superadmin' ? 'superadmin' : 'admin',
          ver: nextVer,
        },
        sessionSecret,
      );
      const isSecure = new URL(c.req.url).protocol === 'https:';
      c.header('Set-Cookie', buildSessionCookie(nextToken, isSecure));
    }

    return c.json({ ok: true });
  })
  .post('/logout', (c) => {
    const isSecure = new URL(c.req.url).protocol === 'https:';
    c.header('Set-Cookie', buildClearSessionCookie(isSecure));
    return c.json({ ok: true });
  });

export default authApp;
