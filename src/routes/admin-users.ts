import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  type AdminSession,
  hashPassword,
  invalidateAdminSessionCache,
  isTrustedSameOriginMutation,
  verifyAdminRequest,
} from '../lib/auth';
import { type AppEnv, hasSupabaseConfig } from '../lib/env';
import { createSupabaseAdmin } from '../lib/supabase';

const createAdminSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9._-]{3,32}$/,
      'Username harus 3–32 karakter (a-z, 0-9, ., _, -)',
    ),
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(128),
});

const updateAdminSchema = z
  .object({
    isActive: z.boolean().optional(),
    newPassword: z.string().min(8).max(128).optional(),
    displayName: z.string().trim().min(2).max(80).optional(),
  })
  .refine(
    (data) =>
      data.isActive !== undefined ||
      data.newPassword !== undefined ||
      data.displayName !== undefined,
    { message: 'Minimal satu perubahan harus dikirim' },
  );

type AdminEnv = AppEnv & {
  Variables: {
    adminSession: AdminSession;
  };
};

const adminUsersApp = new Hono<AdminEnv>()
  .use('*', async (c, next) => {
    if (
      c.req.method !== 'GET' &&
      c.req.method !== 'HEAD' &&
      !isTrustedSameOriginMutation(
        c.req.url,
        c.req.header('Origin'),
        c.req.header('Sec-Fetch-Site'),
      )
    ) {
      throw new HTTPException(403, { message: 'Forbidden' });
    }
    const session = await verifyAdminRequest(c.req.header('Cookie'), c.env);
    if (!session) {
      throw new HTTPException(401, { message: 'Unauthorized' });
    }
    if (session.role !== 'superadmin') {
      throw new HTTPException(403, { message: 'Superadmin role required' });
    }
    c.set('adminSession', session);
    await next();
  })
  .get('/', async (c) => {
    if (!hasSupabaseConfig(c.env)) {
      return c.json({ configured: false, items: [] });
    }

    const supabase = createSupabaseAdmin(c.env);
    const { data, error } = await supabase
      .from('admin_accounts')
      .select(
        'id, username, display_name, role, is_active, last_login_at, created_at',
      )
      .order('role', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    return c.json({
      configured: true,
      items: (data ?? []).map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role:
          row.role === 'superadmin'
            ? ('superadmin' as const)
            : ('admin' as const),
        isActive: row.is_active,
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
      })),
    });
  })
  .post('/', zValidator('json', createAdminSchema), async (c) => {
    if (!hasSupabaseConfig(c.env)) {
      throw new HTTPException(503, { message: 'Supabase is not configured' });
    }

    const actor = c.get('adminSession');
    const { username, displayName, password } = c.req.valid('json');
    const supabase = createSupabaseAdmin(c.env);

    const { data: existing } = await supabase
      .from('admin_accounts')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      throw new HTTPException(409, {
        message: 'Nama pengguna sudah terdaftar.',
      });
    }

    const passwordHash = await hashPassword(password);
    const { data: created, error } = await supabase
      .from('admin_accounts')
      .insert({
        username,
        display_name: displayName,
        password_hash: passwordHash,
        role: 'admin',
        is_active: true,
        created_by_admin_id: actor.id > 0 ? actor.id : null,
      })
      .select(
        'id, username, display_name, role, is_active, last_login_at, created_at',
      )
      .single();

    if (error || !created) {
      throw new HTTPException(500, {
        message: error?.message ?? 'Gagal membuat akun admin.',
      });
    }

    await supabase.from('audit_events').insert({
      event_key: 'admin.created',
      entity_type: 'admin_account',
      entity_id: String(created.id),
      payload: {
        created_username: created.username,
        by_username: actor.username,
      },
    });

    return c.json(
      {
        ok: true,
        item: {
          id: created.id,
          username: created.username,
          displayName: created.display_name,
          role: 'admin' as const,
          isActive: created.is_active,
          lastLoginAt: created.last_login_at,
          createdAt: created.created_at,
        },
      },
      201,
    );
  })
  .patch('/:id', zValidator('json', updateAdminSchema), async (c) => {
    if (!hasSupabaseConfig(c.env)) {
      throw new HTTPException(503, { message: 'Supabase is not configured' });
    }

    const targetId = Number(c.req.param('id'));
    if (!Number.isInteger(targetId) || targetId <= 0) {
      throw new HTTPException(400, { message: 'Invalid admin ID' });
    }

    const actor = c.get('adminSession');
    const { isActive, newPassword, displayName } = c.req.valid('json');
    const supabase = createSupabaseAdmin(c.env);

    const { data: target } = await supabase
      .from('admin_accounts')
      .select('id, username, role, is_active, token_version')
      .eq('id', targetId)
      .maybeSingle();

    if (!target) {
      throw new HTTPException(404, { message: 'Akun admin tidak ditemukan.' });
    }

    if (target.role === 'superadmin') {
      throw new HTTPException(400, {
        message: 'Akun superadmin tidak dapat diubah dari daftar admin.',
      });
    }

    const updates: {
      is_active?: boolean;
      password_hash?: string;
      display_name?: string;
      token_version?: number;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (isActive !== undefined) {
      updates.is_active = isActive;
      updates.token_version = target.token_version + 1;
    }
    if (newPassword !== undefined) {
      updates.password_hash = await hashPassword(newPassword);
      updates.token_version = target.token_version + 1;
    }
    if (displayName !== undefined) {
      updates.display_name = displayName;
    }

    const { data: updated, error } = await supabase
      .from('admin_accounts')
      .update(updates)
      .eq('id', targetId)
      .select(
        'id, username, display_name, role, is_active, last_login_at, created_at',
      )
      .single();

    if (error || !updated) {
      throw new HTTPException(500, {
        message: error?.message ?? 'Gagal memperbarui akun admin.',
      });
    }

    await invalidateAdminSessionCache(targetId, c.env.BOT_CACHE);
    await supabase.from('audit_events').insert({
      event_key: 'admin.updated',
      entity_type: 'admin_account',
      entity_id: String(targetId),
      payload: {
        target_username: target.username,
        by_username: actor.username,
        toggled_active: isActive,
        password_reset: Boolean(newPassword),
      },
    });

    return c.json({
      ok: true,
      item: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        role: 'admin' as const,
        isActive: updated.is_active,
        lastLoginAt: updated.last_login_at,
        createdAt: updated.created_at,
      },
    });
  });

export default adminUsersApp;
