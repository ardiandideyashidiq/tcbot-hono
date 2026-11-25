import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { type AppEnv, hasSupabaseConfig } from '../lib/env';
import { createSupabaseAdmin, type TypedSupabaseClient } from '../lib/supabase';
import { syncUnbanToTelegram } from '../lib/telegram-sync';

const DEFAULT_PAGE_SIZE = 15;

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(DEFAULT_PAGE_SIZE),
});

const appealsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['all', 'pending', 'history']).default('all'),
});

const decideAppealSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().max(1000).optional(),
});

const revokeBanSchema = z.object({
  reason: z.string().max(500).optional(),
});

const createRuleSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(5).max(3500),
  categoryTitle: z.string().min(2).max(100).default('Umum & Etika'),
  isMandatory: z.boolean().default(true),
});

function requireSupabase(env: CloudflareBindings): TypedSupabaseClient | null {
  if (!hasSupabaseConfig(env)) {
    return null;
  }
  return createSupabaseAdmin(env);
}

function buildPagination(page: number, limit: number, total: number) {
  const safeTotal = Math.max(0, total);
  const totalPages = Math.max(1, Math.ceil(safeTotal / limit));
  return {
    page,
    limit,
    total: safeTotal,
    totalPages,
  };
}

function toRange(page: number, limit: number): [number, number] {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return [from, to];
}

async function fetchUsersMap(supabase: TypedSupabaseClient, userIds: number[]) {
  const uniqueIds = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
  if (uniqueIds.length === 0) {
    return new Map<
      number,
      {
        username: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    >();
  }

  const { data } = await supabase
    .from('telegram_users')
    .select('user_id, username, first_name, last_name')
    .in('user_id', uniqueIds);

  return new Map(
    (data ?? []).map((u) => [
      u.user_id,
      {
        username: u.username,
        first_name: u.first_name,
        last_name: u.last_name,
      },
    ]),
  );
}

async function fetchChatsMap(supabase: TypedSupabaseClient, chatIds: number[]) {
  const uniqueIds = [...new Set(chatIds.filter((id) => Number.isFinite(id)))];
  if (uniqueIds.length === 0) {
    return new Map<number, { title: string | null; chat_type: string }>();
  }

  const { data } = await supabase
    .from('telegram_chats')
    .select('chat_id, title, chat_type')
    .in('chat_id', uniqueIds);

  return new Map(
    (data ?? []).map((ch) => [
      ch.chat_id,
      { title: ch.title, chat_type: ch.chat_type },
    ]),
  );
}

function formatDisplayName(
  user:
    | {
        username: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | undefined,
  fallbackId: number,
): string {
  if (!user) return `User ${fallbackId}`;
  const full = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (full) return full;
  if (user.username) return `@${user.username}`;
  return `User ${fallbackId}`;
}

const ledgerApp = new Hono<AppEnv>()
  .get('/appeals', zValidator('query', appealsQuerySchema), async (c) => {
    const { page, limit, status } = c.req.valid('query');
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      return c.json({
        configured: false,
        items: [],
        pagination: buildPagination(page, limit, 0),
      });
    }

    const [from, to] = toRange(page, limit);
    let query = supabase
      .from('moderation_appeals')
      .select(
        'id, action_id, appellant_user_id, appeal_text, status, submitted_at, resolved_at, reviewed_by_user_id, decision_note',
        { count: 'exact' },
      )
      .order('submitted_at', { ascending: false });

    if (status === 'pending') {
      query = query.eq('status', 'pending');
    } else if (status === 'history') {
      query = query.in('status', ['accepted', 'rejected', 'withdrawn']);
    }

    const { data: appeals, count, error } = await query.range(from, to);

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    const actionIds = (appeals ?? []).map((a) => a.action_id);
    const { data: actions } =
      actionIds.length > 0
        ? await supabase
            .from('moderation_actions')
            .select('id, external_ref, chat_id, origin_chat_id, reason')
            .in('id', actionIds)
        : { data: [] };

    const actionMap = new Map((actions ?? []).map((act) => [act.id, act]));
    const userMap = await fetchUsersMap(
      supabase,
      (appeals ?? []).map((a) => a.appellant_user_id),
    );
    const chatMap = await fetchChatsMap(
      supabase,
      (actions ?? []).map((a) => a.origin_chat_id ?? a.chat_id),
    );

    const items = (appeals ?? []).map((appeal) => {
      const action = actionMap.get(appeal.action_id);
      const user = userMap.get(appeal.appellant_user_id);
      const chatId = action?.origin_chat_id ?? action?.chat_id ?? 0;
      const chat = chatMap.get(chatId);

      const mappedStatus =
        appeal.status === 'accepted'
          ? ('approved' as const)
          : appeal.status === 'rejected'
            ? ('rejected' as const)
            : ('pending' as const);

      return {
        id: String(appeal.id),
        externalRef: action?.external_ref ?? `appeal_${appeal.id}`,
        userId: appeal.appellant_user_id,
        displayName: formatDisplayName(user, appeal.appellant_user_id),
        username: user?.username
          ? `@${user.username}`
          : `id:${appeal.appellant_user_id}`,
        originGroup: chat?.title ?? (chatId ? String(chatId) : 'Federasi'),
        ruleTier: 'Berat' as const,
        ruleTitle: 'Banding sanksi federasi',
        reason: action?.reason ?? 'Tidak ada catatan alasan.',
        appealText: appeal.appeal_text,
        status: mappedStatus,
        lockedBy: null,
        lockExpiresIn: null,
        submittedAt: new Date(appeal.submitted_at).toLocaleString('id-ID'),
        proofCount: 0,
      };
    });

    return c.json({
      configured: true,
      items,
      pagination: buildPagination(page, limit, count ?? items.length),
    });
  })
  .post(
    '/appeals/:id/decide',
    zValidator('json', decideAppealSchema),
    async (c) => {
      const supabase = requireSupabase(c.env);
      if (!supabase) {
        throw new HTTPException(503, { message: 'Supabase is not configured' });
      }

      const appealId = Number(c.req.param('id'));
      if (!Number.isInteger(appealId) || appealId <= 0) {
        throw new HTTPException(400, { message: 'Invalid appeal ID' });
      }

      const { decision, note } = c.req.valid('json');
      const dbStatus = decision === 'approved' ? 'accepted' : 'rejected';

      const { data: updatedAppeal, error } = await supabase
        .from('moderation_appeals')
        .update({
          status: dbStatus,
          decision_note: note ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', appealId)
        .select('id, action_id, appellant_user_id, status')
        .single();

      if (error || !updatedAppeal) {
        throw new HTTPException(404, {
          message: error?.message ?? 'Appeal not found',
        });
      }

      if (decision === 'approved') {
        await supabase
          .from('moderation_actions')
          .update({
            status: 'revoked',
            revoked_at: new Date().toISOString(),
          })
          .eq('id', updatedAppeal.action_id);

        const syncTask = syncUnbanToTelegram(
          c.env,
          supabase,
          updatedAppeal.appellant_user_id,
          'Banding Anda telah disetujui dan ban federasi Anda telah dicabut.',
        );
        try {
          c.executionCtx.waitUntil(syncTask);
        } catch {
          await syncTask;
        }
      }

      return c.json({ ok: true, appeal: updatedAppeal });
    },
  )
  .get('/bans', zValidator('query', paginationQuerySchema), async (c) => {
    const { page, limit } = c.req.valid('query');
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      return c.json({
        configured: false,
        items: [],
        pagination: buildPagination(page, limit, 0),
      });
    }

    const [from, to] = toRange(page, limit);
    const {
      data: bans,
      count,
      error,
    } = await supabase
      .from('moderation_actions')
      .select(
        'id, external_ref, target_user_id, actor_user_id, chat_id, origin_chat_id, reason, status, created_at, expires_at',
        { count: 'exact' },
      )
      .eq('action_type', 'ban')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    const userMap = await fetchUsersMap(
      supabase,
      (bans ?? []).map((b) => b.target_user_id),
    );
    const chatMap = await fetchChatsMap(
      supabase,
      (bans ?? []).map((b) => b.origin_chat_id ?? b.chat_id),
    );

    const items = (bans ?? []).map((ban) => {
      const user = userMap.get(ban.target_user_id);
      const chatId = ban.origin_chat_id ?? ban.chat_id;
      const chat = chatMap.get(chatId);

      return {
        id: ban.id,
        externalRef: ban.external_ref,
        userId: ban.target_user_id,
        displayName: formatDisplayName(user, ban.target_user_id),
        username: user?.username
          ? `@${user.username}`
          : `id:${ban.target_user_id}`,
        originGroup: chat?.title ?? String(chatId),
        reason: ban.reason ?? 'Tidak ada alasan',
        status: ban.status,
        expiresAt: ban.expires_at,
        createdAt: ban.created_at,
      };
    });

    return c.json({
      configured: true,
      items,
      pagination: buildPagination(page, limit, count ?? items.length),
    });
  })
  .post('/bans/:id/revoke', zValidator('json', revokeBanSchema), async (c) => {
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      throw new HTTPException(503, { message: 'Supabase is not configured' });
    }

    const actionId = Number(c.req.param('id'));
    if (!Number.isInteger(actionId) || actionId <= 0) {
      throw new HTTPException(400, { message: 'Invalid ban action ID' });
    }

    const { reason } = c.req.valid('json');
    const { data: updated, error } = await supabase
      .from('moderation_actions')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
      })
      .eq('id', actionId)
      .eq('action_type', 'ban')
      .select('id, target_user_id, status')
      .single();

    if (error || !updated) {
      throw new HTTPException(404, {
        message: error?.message ?? 'Ban action not found',
      });
    }

    await supabase.from('audit_events').insert({
      subject_user_id: updated.target_user_id,
      event_key: 'moderation.ban.revoked',
      entity_type: 'moderation_action',
      entity_id: String(updated.id),
      action_id: updated.id,
      payload: { reason: reason ?? 'Revoked from web console' },
    });

    const syncTask = syncUnbanToTelegram(
      c.env,
      supabase,
      updated.target_user_id,
    );
    try {
      c.executionCtx.waitUntil(syncTask);
    } catch {
      await syncTask;
    }

    return c.json({ ok: true, action: updated });
  })
  .get('/warns', zValidator('query', paginationQuerySchema), async (c) => {
    const { page, limit } = c.req.valid('query');
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      return c.json({
        configured: false,
        items: [],
        pagination: buildPagination(page, limit, 0),
      });
    }

    const [from, to] = toRange(page, limit);
    const {
      data: warns,
      count,
      error,
    } = await supabase
      .from('moderation_actions')
      .select(
        'id, external_ref, target_user_id, chat_id, reason, status, created_at, expires_at',
        { count: 'exact' },
      )
      .eq('action_type', 'warn')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    const userMap = await fetchUsersMap(
      supabase,
      (warns ?? []).map((w) => w.target_user_id),
    );
    const chatMap = await fetchChatsMap(
      supabase,
      (warns ?? []).map((w) => w.chat_id),
    );

    const items = (warns ?? []).map((warn) => {
      const user = userMap.get(warn.target_user_id);
      const chat = chatMap.get(warn.chat_id);
      return {
        id: warn.id,
        externalRef: warn.external_ref,
        userId: warn.target_user_id,
        displayName: formatDisplayName(user, warn.target_user_id),
        username: user?.username
          ? `@${user.username}`
          : `id:${warn.target_user_id}`,
        groupTitle: chat?.title ?? String(warn.chat_id),
        reason: warn.reason ?? 'Tidak ada alasan',
        status: warn.status,
        expiresAt: warn.expires_at,
        createdAt: warn.created_at,
      };
    });

    return c.json({
      configured: true,
      items,
      pagination: buildPagination(page, limit, count ?? items.length),
    });
  })
  .get('/groups', zValidator('query', paginationQuerySchema), async (c) => {
    const { page, limit } = c.req.valid('query');
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      return c.json({
        configured: false,
        items: [],
        pagination: buildPagination(page, limit, 0),
      });
    }

    const [from, to] = toRange(page, limit);
    const {
      data: connected,
      count,
      error,
    } = await supabase
      .from('connected_chats')
      .select('chat_id, added_by_user_id, added_at, is_active', {
        count: 'exact',
      })
      .order('added_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    const chatMap = await fetchChatsMap(
      supabase,
      (connected ?? []).map((g) => g.chat_id),
    );

    const items = (connected ?? []).map((group) => {
      const chat = chatMap.get(group.chat_id);
      return {
        chatId: group.chat_id,
        title: chat?.title ?? `Chat ${group.chat_id}`,
        chatType: chat?.chat_type ?? 'unknown',
        isActive: group.is_active,
        addedAt: group.added_at,
      };
    });

    return c.json({
      configured: true,
      items,
      pagination: buildPagination(page, limit, count ?? items.length),
    });
  })
  .post('/groups/:chatId/toggle', async (c) => {
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      throw new HTTPException(503, { message: 'Supabase is not configured' });
    }

    const chatId = Number(c.req.param('chatId'));
    if (!Number.isInteger(chatId) || chatId === 0) {
      throw new HTTPException(400, { message: 'Invalid chat ID' });
    }

    const { data: current } = await supabase
      .from('connected_chats')
      .select('is_active')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (!current) {
      throw new HTTPException(404, { message: 'Connected group not found' });
    }

    const { data: updated, error } = await supabase
      .from('connected_chats')
      .update({ is_active: !current.is_active })
      .eq('chat_id', chatId)
      .select('chat_id, is_active')
      .single();

    if (error || !updated) {
      throw new HTTPException(500, {
        message: error?.message ?? 'Failed to toggle group',
      });
    }

    return c.json({ ok: true, group: updated });
  })
  .post('/rules', zValidator('json', createRuleSchema), async (c) => {
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      throw new HTTPException(503, { message: 'Supabase is not configured' });
    }

    const { title, body, categoryTitle, isMandatory } = c.req.valid('json');
    let { data: version } = await supabase
      .from('rule_set_versions')
      .select('id')
      .in('status', ['published', 'draft'])
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!version) {
      const { data: createdSet, error: setErr } = await supabase
        .from('rule_sets')
        .insert({
          scope_type: 'community',
          rule_set_key: 'community_rules',
          name: 'Aturan Komunitas',
          is_active: true,
        })
        .select('id')
        .single();
      if (setErr || !createdSet) {
        throw new HTTPException(500, {
          message: setErr?.message ?? 'Failed to create rule set',
        });
      }

      const { data: createdVer, error: verErr } = await supabase
        .from('rule_set_versions')
        .insert({
          rule_set_id: createdSet.id,
          version_number: 1,
          locale: 'id-ID',
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (verErr || !createdVer) {
        throw new HTTPException(500, {
          message: verErr?.message ?? 'Failed to create rule version',
        });
      }
      version = createdVer;
    }

    const slug = `rule_${Date.now().toString(36)}`;
    const categoryKey = categoryTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    const { data: rule, error } = await supabase
      .from('rule_items')
      .insert({
        rule_set_version_id: version.id,
        rule_key: slug,
        category_key: categoryKey || 'umum',
        category_title: categoryTitle,
        title,
        body,
        is_mandatory: isMandatory,
        sort_order: 500,
      })
      .select(
        'id, rule_key, category_key, category_title, title, body, is_mandatory',
      )
      .single();

    if (error || !rule) {
      throw new HTTPException(500, {
        message: error?.message ?? 'Failed to create rule',
      });
    }

    return c.json({ ok: true, rule }, 201);
  })
  .get('/rules', zValidator('query', paginationQuerySchema), async (c) => {
    const { page, limit } = c.req.valid('query');
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      return c.json({
        configured: false,
        items: [],
        pagination: buildPagination(page, limit, 0),
      });
    }

    const { data: versions, error: versionError } = await supabase
      .from('rule_set_versions')
      .select('id, version_number, locale, status, published_at')
      .in('status', ['published', 'draft'])
      .order('version_number', { ascending: false })
      .limit(10);

    if (versionError) {
      throw new HTTPException(500, { message: versionError.message });
    }

    const versionIds = (versions ?? []).map((v) => v.id);
    if (versionIds.length === 0) {
      return c.json({
        configured: true,
        items: [],
        pagination: buildPagination(page, limit, 0),
      });
    }

    const [from, to] = toRange(page, limit);
    const {
      data: ruleItems,
      count,
      error: itemsError,
    } = await supabase
      .from('rule_items')
      .select(
        'id, rule_set_version_id, rule_key, category_key, category_title, title, body, sort_order, is_mandatory',
        { count: 'exact' },
      )
      .in('rule_set_version_id', versionIds)
      .order('sort_order', { ascending: true })
      .range(from, to);

    if (itemsError) {
      throw new HTTPException(500, { message: itemsError.message });
    }

    const versionMap = new Map((versions ?? []).map((v) => [v.id, v]));
    const items = (ruleItems ?? []).map((rule) => {
      const ver = versionMap.get(rule.rule_set_version_id);
      return {
        id: rule.id,
        ruleKey: rule.rule_key,
        categoryTitle: rule.category_title ?? rule.category_key,
        title: rule.title,
        body: rule.body,
        isMandatory: rule.is_mandatory,
        versionNumber: ver?.version_number ?? 1,
        versionStatus: ver?.status ?? 'draft',
        locale: ver?.locale ?? 'en-US',
      };
    });

    return c.json({
      configured: true,
      items,
      pagination: buildPagination(page, limit, count ?? items.length),
    });
  })
  .get('/staff', zValidator('query', paginationQuerySchema), async (c) => {
    const { page, limit } = c.req.valid('query');
    const supabase = requireSupabase(c.env);
    if (!supabase) {
      return c.json({
        configured: false,
        items: [],
        pagination: buildPagination(page, limit, 0),
      });
    }

    const [from, to] = toRange(page, limit);
    const {
      data: assignments,
      count,
      error,
    } = await supabase
      .from('role_assignments')
      .select(
        'id, user_id, role_key, assigned_by_user_id, assigned_at, status',
        {
          count: 'exact',
        },
      )
      .eq('status', 'active')
      .order('assigned_at', { ascending: true })
      .range(from, to);

    if (error) {
      throw new HTTPException(500, { message: error.message });
    }

    const { data: roles } = await supabase
      .from('role_definitions')
      .select('role_key, display_name, priority');

    const roleMap = new Map((roles ?? []).map((r) => [r.role_key, r]));
    const userMap = await fetchUsersMap(
      supabase,
      (assignments ?? []).map((a) => a.user_id),
    );

    const items = (assignments ?? [])
      .map((assignment) => {
        const user = userMap.get(assignment.user_id);
        const roleDef = roleMap.get(assignment.role_key);
        return {
          id: assignment.id,
          userId: assignment.user_id,
          displayName: formatDisplayName(user, assignment.user_id),
          username: user?.username
            ? `@${user.username}`
            : `id:${assignment.user_id}`,
          roleKey: assignment.role_key,
          roleDisplayName: roleDef?.display_name ?? assignment.role_key,
          priority: roleDef?.priority ?? 0,
          assignedAt: assignment.assigned_at,
        };
      })
      .sort((a, b) => b.priority - a.priority);

    return c.json({
      configured: true,
      items,
      pagination: buildPagination(page, limit, count ?? items.length),
    });
  });

export default ledgerApp;
