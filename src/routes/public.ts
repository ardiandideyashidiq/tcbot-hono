import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { type AppEnv, hasSupabaseConfig } from '../lib/env';
import { createSupabaseAdmin } from '../lib/supabase';

const publicApp = new Hono<AppEnv>().get('/overview', async (c) => {
  const communityName = c.env.COMMUNITY_NAME?.trim() || 'tcbot';

  if (!hasSupabaseConfig(c.env)) {
    return c.json({
      configured: false,
      communityName,
      stats: {
        connectedGroups: 0,
        publishedRules: 0,
        resolvedAppeals: 0,
        activeModerations: 0,
      },
      rules: [],
      groups: [],
    });
  }

  const edgeCache =
    typeof caches !== 'undefined' && 'default' in caches
      ? (caches as unknown as { default: Cache }).default
      : null;
  const cacheKey = edgeCache ? new Request(c.req.url, { method: 'GET' }) : null;

  if (edgeCache && cacheKey) {
    const cached = await edgeCache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Cache', 'HIT');
      return new Response(cached.body, {
        status: cached.status,
        headers,
      });
    }
  }

  const supabase = createSupabaseAdmin(c.env);

  const [groupsRes, versionRes, resolvedAppealsRes, activeModerationsRes] =
    await Promise.all([
      supabase
        .from('connected_chats')
        .select(
          'chat_id, added_at, is_active, telegram_chats!connected_chats_chat_id_fkey(title, chat_type)',
          { count: 'estimated' },
        )
        .eq('is_active', true)
        .order('added_at', { ascending: false })
        .limit(24),
      supabase
        .from('rule_set_versions')
        .select('id, version_number, status, locale')
        .in('status', ['published', 'draft'])
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('moderation_appeals')
        .select('id', { count: 'estimated', head: true })
        .in('status', ['accepted', 'rejected']),
      supabase
        .from('moderation_actions')
        .select('id', { count: 'estimated', head: true })
        .eq('status', 'active'),
    ]);

  if (groupsRes.error) {
    throw new HTTPException(500, { message: groupsRes.error.message });
  }

  let rules: Array<{
    id: number;
    ruleKey: string;
    categoryTitle: string;
    title: string;
    body: string;
    isMandatory: boolean;
  }> = [];

  if (versionRes.data) {
    const { data: ruleRows, error: ruleErr } = await supabase
      .from('rule_items')
      .select(
        'id, rule_key, category_key, category_title, title, body, is_mandatory',
      )
      .eq('rule_set_version_id', versionRes.data.id)
      .order('sort_order', { ascending: true })
      .limit(100);

    if (ruleErr) {
      throw new HTTPException(500, { message: ruleErr.message });
    }

    rules = (ruleRows ?? []).map((item) => ({
      id: item.id,
      ruleKey: item.rule_key,
      categoryTitle: item.category_title ?? item.category_key,
      title: item.title,
      body: item.body,
      isMandatory: item.is_mandatory,
    }));
  }

  const groups = (groupsRes.data ?? []).map((g) => {
    const chat = g.telegram_chats ?? undefined;
    return {
      chatId: g.chat_id,
      title: chat?.title ?? `Grup ${g.chat_id}`,
      chatType: chat?.chat_type ?? 'supergroup',
      addedAt: g.added_at,
    };
  });

  const payload = {
    configured: true,
    communityName,
    stats: {
      connectedGroups: groupsRes.count ?? groups.length,
      publishedRules: rules.length,
      resolvedAppeals: resolvedAppealsRes.count ?? 0,
      activeModerations: activeModerationsRes.count ?? 0,
    },
    rules,
    groups,
  };

  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=60',
      'X-Cache': 'MISS',
    },
  });

  if (edgeCache && cacheKey) {
    try {
      c.executionCtx.waitUntil(edgeCache.put(cacheKey, response.clone()));
    } catch {
      await edgeCache.put(cacheKey, response.clone());
    }
  }

  return response;
});

export default publicApp;
