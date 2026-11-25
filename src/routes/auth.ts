import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  constantTimeEqual,
  getSessionSecret,
  signAdminSession,
  verifyAdminRequest,
} from '../lib/auth';
import type { AppEnv } from '../lib/env';

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
    const expectedUser = c.env.ADMIN_USERNAME?.trim() ?? '';
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

    const { username, password } = c.req.valid('json');
    const userOk = constantTimeEqual(username, expectedUser);
    const passOk = constantTimeEqual(password, expectedPass);

    if (!userOk || !passOk) {
      return c.json(
        { ok: false, error: 'Nama pengguna atau kata sandi salah.' },
        401,
      );
    }

    const token = await signAdminSession(expectedUser, getSessionSecret(c.env));
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
