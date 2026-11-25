import { b, code, fmt, i } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner, recordAuditEvent } from '../db';
import { type Locale, normalizeLocale, t } from '../i18n';
import { onCommand } from '../prefixes';
import { clearBotSession, getBotSession, setBotSession } from '../session';

export const rulesComposer = new Composer<BotContext>();

const RULES_CACHE_TTL_SECONDS = 300;
const CATEGORIES_PER_PAGE = 8;
const ITEMS_PER_PAGE = 5;
const EDITOR_ITEMS_PER_PAGE = 6;
const CHANNEL_MESSAGE_LIMIT = 3900;

interface RuleCategoryView {
  key: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

interface RuleItemView {
  id: number;
  ruleKey: string;
  categoryKey: string;
  categoryTitle: string | null;
  title: string;
  body: string;
  referenceUrl: string | null;
  sortOrder: number;
}

interface PublishedRulesData {
  versionId: number | null;
  versionNumber: number | null;
  ruleSetId: number | null;
  requiresAcknowledgement: boolean;
  publishedAt: string | null;
  categories: RuleCategoryView[];
  items: RuleItemView[];
}

interface ChatGreetingSettings {
  locale: Locale;
  welcomeEnabled: boolean;
  goodbyeEnabled: boolean;
  requireRulesAck: boolean;
  welcomeMessage: string | null;
  goodbyeMessage: string | null;
}

type RulesEditorSession =
  | { step: 'await_category' }
  | { step: 'await_title'; categoryKey: string }
  | { step: 'await_body'; categoryKey: string; title: string }
  | { step: 'edit_title'; itemId: number }
  | { step: 'edit_body'; itemId: number };

function rulesCacheKey(locale: Locale): string {
  return `rules:published:v1:${locale}`;
}

async function invalidatePublishedRulesCache(
  env: Pick<CloudflareBindings, 'BOT_CACHE'>,
): Promise<void> {
  if (!env.BOT_CACHE) return;
  await Promise.allSettled([
    env.BOT_CACHE.delete(rulesCacheKey('en-US')),
    env.BOT_CACHE.delete(rulesCacheKey('id-ID')),
  ]);
}

function slugifyCategory(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'general';
}

function defaultCategoryTitle(key: string, locale: Locale): string {
  if (key === 'general') {
    return locale === 'id-ID' ? 'Umum' : 'General';
  }
  return key
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseMainChannelTarget(raw?: string): string | number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^-?\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return Number.isFinite(id) && id !== 0 ? id : null;
  }
  if (trimmed.startsWith('@')) return trimmed;
  if (trimmed.startsWith('https://t.me/')) {
    const slug = trimmed.slice('https://t.me/'.length).split('/')[0];
    return slug ? `@${slug}` : null;
  }
  return `@${trimmed}`;
}

function buildChannelLink(
  target: string | number | null,
  messageId?: number | null,
): string | null {
  if (!target) return null;
  if (typeof target === 'string' && target.startsWith('@')) {
    const username = target.slice(1);
    return messageId
      ? `https://t.me/${username}/${messageId}`
      : `https://t.me/${username}`;
  }
  if (typeof target === 'number') {
    const raw = String(target);
    if (raw.startsWith('-100') && messageId) {
      return `https://t.me/c/${raw.slice(4)}/${messageId}`;
    }
  }
  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function loadPublishedRules(
  ctx: BotContext,
  opts?: { bypassCache?: boolean },
): Promise<PublishedRulesData> {
  const empty: PublishedRulesData = {
    versionId: null,
    versionNumber: null,
    ruleSetId: null,
    requiresAcknowledgement: true,
    publishedAt: null,
    categories: [],
    items: [],
  };
  if (!ctx.supabase) return empty;

  const cacheKey = rulesCacheKey(ctx.locale);
  if (!opts?.bypassCache && ctx.appEnv.BOT_CACHE) {
    const cachedRaw = await ctx.appEnv.BOT_CACHE.get(cacheKey).catch(
      () => null,
    );
    if (cachedRaw) {
      try {
        return JSON.parse(cachedRaw) as PublishedRulesData;
      } catch {
        // Ignore malformed cache entry and reload from Supabase
      }
    }
  }

  const { data: versions } = await ctx.supabase
    .from('rule_set_versions')
    .select('id, version_number, rule_set_id, locale, published_at')
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(5);

  const version =
    versions?.find((v) => v.locale === ctx.locale) ?? versions?.[0] ?? null;

  if (!version) return empty;

  const [itemsRes, catsRes, catContentRes, ruleSetRes] = await Promise.all([
    ctx.supabase
      .from('rule_items')
      .select(
        'id, rule_key, category_key, category_title, title, body, reference_url, sort_order, category_sort_order',
      )
      .eq('rule_set_version_id', version.id)
      .order('category_sort_order', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .limit(100),
    ctx.supabase
      .from('rule_categories')
      .select('category_key, title, description, sort_order')
      .eq('rule_set_id', version.rule_set_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    ctx.supabase
      .from('rule_category_content')
      .select('category_key, label, description')
      .eq('rule_set_id', version.rule_set_id)
      .eq('locale', ctx.locale),
    ctx.supabase
      .from('rule_sets')
      .select('requires_acknowledgement')
      .eq('id', version.rule_set_id)
      .maybeSingle(),
  ]);

  const contentMap = new Map(
    (catContentRes.data ?? []).map((row) => [row.category_key, row]),
  );
  const categoryMap = new Map<string, RuleCategoryView>();

  for (const cat of catsRes.data ?? []) {
    const localized = contentMap.get(cat.category_key);
    categoryMap.set(cat.category_key, {
      key: cat.category_key,
      title: localized?.label || cat.title || cat.category_key,
      description: localized?.description ?? cat.description ?? null,
      sortOrder: cat.sort_order,
    });
  }

  const items: RuleItemView[] = (itemsRes.data ?? []).map((row) => {
    if (!categoryMap.has(row.category_key)) {
      const localized = contentMap.get(row.category_key);
      categoryMap.set(row.category_key, {
        key: row.category_key,
        title:
          localized?.label ||
          row.category_title ||
          defaultCategoryTitle(row.category_key, ctx.locale),
        description: localized?.description ?? null,
        sortOrder: row.category_sort_order ?? 100,
      });
    }
    return {
      id: row.id,
      ruleKey: row.rule_key,
      categoryKey: row.category_key,
      categoryTitle: row.category_title,
      title: row.title,
      body: row.body,
      referenceUrl: row.reference_url,
      sortOrder: row.sort_order,
    };
  });

  const categories = Array.from(categoryMap.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
  );

  const result: PublishedRulesData = {
    versionId: version.id,
    versionNumber: version.version_number,
    ruleSetId: version.rule_set_id,
    requiresAcknowledgement: ruleSetRes.data?.requires_acknowledgement ?? true,
    publishedAt: version.published_at,
    categories,
    items,
  };

  if (ctx.appEnv.BOT_CACHE) {
    void ctx.appEnv.BOT_CACHE.put(cacheKey, JSON.stringify(result), {
      expirationTtl: RULES_CACHE_TTL_SECONDS,
    }).catch(() => {});
  }

  return result;
}

async function getPrimaryChannelLink(
  ctx: BotContext,
  data: PublishedRulesData,
): Promise<string | null> {
  const target = parseMainChannelTarget(ctx.appEnv.MAIN_CHANNEL);
  if (!target) return null;
  if (typeof target === 'string') {
    return buildChannelLink(target, null);
  }
  if (ctx.supabase && data.ruleSetId) {
    const { data: pub } = await ctx.supabase
      .from('rule_publications')
      .select('message_id')
      .eq('rule_set_id', data.ruleSetId)
      .eq('chat_id', target)
      .eq('status', 'synced')
      .order('part_index', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pub?.message_id) {
      return buildChannelLink(target, pub.message_id);
    }
  }
  return null;
}

async function sendRulesMenu(ctx: BotContext, edit = false, page = 1) {
  const isId = ctx.locale === 'id-ID';
  const data = await loadPublishedRules(ctx);
  const channelLink = await getPrimaryChannelLink(ctx, data);

  if (data.items.length === 0) {
    const formatted = fmt`${b}${isId ? 'Aturan Komunitas' : 'Community Rules'}${b}
${isId ? 'Belum ada aturan yang diterbitkan.' : 'No published rules yet.'}`;
    const keyboard = new InlineKeyboard();
    if (channelLink) {
      keyboard
        .url(isId ? '📢 Channel Aturan' : '📢 Rules Channel', channelLink)
        .row();
    }
    keyboard
      .text(isId ? '← Kembali' : '← Back', 'nav:start')
      .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

    if (edit) {
      await ctx
        .editMessageText(formatted.text, {
          entities: formatted.entities,
          reply_markup: keyboard,
        })
        .catch(() => {});
    } else {
      await ctx.reply(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      });
    }
    return;
  }

  const totalPages = Math.max(
    1,
    Math.ceil(data.categories.length / CATEGORIES_PER_PAGE),
  );
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = data.categories.slice(
    (safePage - 1) * CATEGORIES_PER_PAGE,
    safePage * CATEGORIES_PER_PAGE,
  );

  const versionBadge = data.versionNumber ? `v${data.versionNumber}` : 'v1';
  const community = ctx.appEnv.COMMUNITY_NAME || 'Community';
  const formatted = fmt`${b}${isId ? 'Aturan Komunitas' : 'Community Rules'}${b} (${code}${versionBadge}${code})
${
  isId
    ? `Pilih kategori aturan ${community} di bawah ini untuk membaca detail pasal:`
    : `Select a ${community} rules category below to read the details:`
}`;

  const keyboard = new InlineKeyboard();
  for (let idx = 0; idx < slice.length; idx += 2) {
    const left = slice[idx];
    const right = slice[idx + 1];
    if (left) {
      keyboard.text(`📂 ${left.title.slice(0, 24)}`, `rules:cat:${left.key}`);
    }
    if (right) {
      keyboard.text(`📂 ${right.title.slice(0, 24)}`, `rules:cat:${right.key}`);
    }
    keyboard.row();
  }

  if (totalPages > 1) {
    if (safePage > 1) {
      keyboard.text('◀️', `rules:index:${safePage - 1}`);
    }
    if (safePage < totalPages) {
      keyboard.text('▶️', `rules:index:${safePage + 1}`);
    }
    keyboard.row();
  }

  if (data.versionId && data.requiresAcknowledgement) {
    keyboard
      .text(
        isId ? '✅ Saya Setuju' : '✅ I Acknowledge',
        `rules:ack:${data.versionId}`,
      )
      .row();
  }

  if (channelLink) {
    keyboard
      .url(isId ? '📢 Channel Aturan' : '📢 Rules Channel', channelLink)
      .row();
  }

  keyboard
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  if (edit) {
    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  } else {
    await ctx.reply(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    });
  }
}

async function sendRulesCategory(
  ctx: BotContext,
  categoryKey: string,
  page = 1,
) {
  const isId = ctx.locale === 'id-ID';
  const data = await loadPublishedRules(ctx);
  const category = data.categories.find((c) => c.key === categoryKey);
  const catItems = data.items.filter(
    (item) => item.categoryKey === categoryKey,
  );

  if (!category || catItems.length === 0) {
    await sendRulesMenu(ctx, true, 1);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(catItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = catItems.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  const descPart = category.description
    ? fmt`\n${i}${category.description}${i}\n`
    : '\n';

  const bodyText = slice
    .map((item, idx) => {
      const num = (safePage - 1) * ITEMS_PER_PAGE + idx + 1;
      const refLine = item.referenceUrl ? `\n   🔗 ${item.referenceUrl}` : '';
      return `${num}. ${item.title}\n   ${item.body}${refLine}`;
    })
    .join('\n\n');

  const pageSuffix = totalPages > 1 ? ` (${safePage}/${totalPages})` : '';
  const formatted = fmt`${b}📂 ${category.title}${pageSuffix}${b}${descPart}
${bodyText}`;

  const keyboard = new InlineKeyboard();
  if (totalPages > 1) {
    if (safePage > 1) {
      keyboard.text('◀️', `rules:cat:${categoryKey}:p:${safePage - 1}`);
    }
    if (safePage < totalPages) {
      keyboard.text('▶️', `rules:cat:${categoryKey}:p:${safePage + 1}`);
    }
    keyboard.row();
  }

  if (data.versionId && data.requiresAcknowledgement) {
    keyboard
      .text(
        isId ? '✅ Saya Setuju' : '✅ I Acknowledge',
        `rules:ack:${data.versionId}`,
      )
      .row();
  }

  keyboard
    .text(isId ? '← Kategori' : '← Categories', 'nav:rules')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
}

onCommand(rulesComposer, 'rules', async (ctx) => {
  await sendRulesMenu(ctx, false, 1);
});

rulesComposer.callbackQuery('nav:rules', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendRulesMenu(ctx, true, 1);
});

rulesComposer.callbackQuery(/^rules:(?:index|page):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendRulesMenu(ctx, true, Number(ctx.match[1]));
});

rulesComposer.callbackQuery(
  /^rules:cat:([a-z0-9_-]+)(?::p:(\d+))?$/i,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const categoryKey = ctx.match[1];
    const page = ctx.match[2] ? Number(ctx.match[2]) : 1;
    await sendRulesCategory(ctx, categoryKey, page);
  },
);

async function handleRuleAcknowledge(
  ctx: BotContext,
  versionId: number,
  expectedMemberId?: number,
): Promise<void> {
  const isId = ctx.locale === 'id-ID';
  if (
    expectedMemberId !== undefined &&
    (!ctx.from || ctx.from.id !== expectedMemberId)
  ) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Tombol ini khusus untuk anggota baru yang disapa.'
        : 'This acknowledgement button belongs to another member.',
      show_alert: true,
    });
    return;
  }

  if (!ctx.supabase || !ctx.from) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Terima kasih, persetujuan aturan Anda tercatat.'
        : 'Thank you, your acknowledgement has been recorded.',
      show_alert: true,
    });
    return;
  }

  const published = await loadPublishedRules(ctx);
  if (published.versionId !== null && published.versionId !== versionId) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Versi aturan ini sudah diperbarui. Gunakan /rules untuk melihat versi terbaru.'
        : 'This rules version is outdated. Use /rules to view the latest version.',
      show_alert: true,
    });
    return;
  }

  const { data: existing } = await ctx.supabase
    .from('rule_acknowledgements')
    .select('id')
    .eq('rule_set_version_id', versionId)
    .eq('user_id', ctx.from.id)
    .maybeSingle();

  if (existing) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Anda sudah menyetujui versi aturan ini.'
        : 'You have already acknowledged this version of the rules.',
      show_alert: true,
    });
    return;
  }

  await ctx.supabase.from('rule_acknowledgements').upsert(
    {
      rule_set_version_id: versionId,
      user_id: ctx.from.id,
      context_chat_id: ctx.chat?.id ?? null,
      telegram_message_id: ctx.callbackQuery?.message?.message_id ?? null,
      acknowledgement_method: 'inline_button',
    },
    { onConflict: 'rule_set_version_id,user_id' },
  );

  await ctx.answerCallbackQuery({
    text: isId
      ? 'Terima kasih, persetujuan aturan Anda tercatat.'
      : 'Thank you, your acknowledgement has been recorded.',
    show_alert: true,
  });
}

rulesComposer.callbackQuery(/^rules:ack:(\d+)$/, async (ctx) => {
  await handleRuleAcknowledge(ctx, Number(ctx.match[1]));
});

rulesComposer.callbackQuery(/^rules_ack:(\d+):(\d+)$/, async (ctx) => {
  await handleRuleAcknowledge(ctx, Number(ctx.match[1]), Number(ctx.match[2]));
});

// ─────────────────────────── Staff Rules Editor (/tcrules) ─────────────────────────── #

interface WorkingVersionInfo {
  ruleSetId: number;
  versionId: number;
  versionNumber: number;
  status: string;
  items: RuleItemView[];
}

async function getWorkingVersion(
  ctx: BotContext,
): Promise<WorkingVersionInfo | null> {
  if (!ctx.supabase) return null;

  const { data: draft } = await ctx.supabase
    .from('rule_set_versions')
    .select('id, rule_set_id, version_number, status')
    .eq('status', 'draft')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version =
    draft ??
    (
      await ctx.supabase
        .from('rule_set_versions')
        .select('id, rule_set_id, version_number, status')
        .eq('status', 'published')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;

  if (!version) return null;

  const { data: items } = await ctx.supabase
    .from('rule_items')
    .select(
      'id, rule_key, category_key, category_title, title, body, reference_url, sort_order',
    )
    .eq('rule_set_version_id', version.id)
    .order('category_sort_order', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
    .limit(100);

  return {
    ruleSetId: version.rule_set_id,
    versionId: version.id,
    versionNumber: version.version_number,
    status: version.status,
    items: (items ?? []).map((row) => ({
      id: row.id,
      ruleKey: row.rule_key,
      categoryKey: row.category_key,
      categoryTitle: row.category_title,
      title: row.title,
      body: row.body,
      referenceUrl: row.reference_url,
      sortOrder: row.sort_order,
    })),
  };
}

async function ensureDraftVersion(ctx: BotContext): Promise<{
  ruleSetId: number;
  versionId: number;
  versionNumber: number;
} | null> {
  if (!ctx.supabase) return null;

  const { data: existingDraft } = await ctx.supabase
    .from('rule_set_versions')
    .select('id, rule_set_id, version_number')
    .eq('status', 'draft')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingDraft) {
    return {
      ruleSetId: existingDraft.rule_set_id,
      versionId: existingDraft.id,
      versionNumber: existingDraft.version_number,
    };
  }

  let { data: ruleSet } = await ctx.supabase
    .from('rule_sets')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (!ruleSet) {
    const { data: createdSet } = await ctx.supabase
      .from('rule_sets')
      .insert({
        rule_set_key: 'community-rules',
        name: 'Community Rules',
        scope_type: 'community',
        created_by_user_id: ctx.from?.id ?? null,
      })
      .select('id')
      .single();
    ruleSet = createdSet;
  }

  if (!ruleSet) return null;

  const { data: latestAny } = await ctx.supabase
    .from('rule_set_versions')
    .select('id, version_number, status')
    .eq('rule_set_id', ruleSet.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersionNumber = (latestAny?.version_number ?? 0) + 1;
  const { data: createdDraft } = await ctx.supabase
    .from('rule_set_versions')
    .insert({
      rule_set_id: ruleSet.id,
      version_number: nextVersionNumber,
      status: 'draft',
      locale: ctx.locale,
      created_by_user_id: ctx.from?.id ?? null,
    })
    .select('id, rule_set_id, version_number')
    .single();

  if (!createdDraft) return null;

  if (latestAny) {
    const { data: sourceItems } = await ctx.supabase
      .from('rule_items')
      .select(
        'rule_key, category_key, category_title, category_sort_order, title, body, content_format, reference_url, sort_order, is_mandatory, metadata',
      )
      .eq('rule_set_version_id', latestAny.id)
      .order('sort_order', { ascending: true });

    if (sourceItems && sourceItems.length > 0) {
      await ctx.supabase.from('rule_items').insert(
        sourceItems.map((item) => ({
          rule_set_version_id: createdDraft.id,
          rule_key: item.rule_key,
          category_key: item.category_key,
          category_title: item.category_title,
          category_sort_order: item.category_sort_order,
          title: item.title,
          body: item.body,
          content_format: item.content_format,
          reference_url: item.reference_url,
          sort_order: item.sort_order,
          is_mandatory: item.is_mandatory,
          metadata: item.metadata,
        })),
      );
    }
  }

  return {
    ruleSetId: createdDraft.rule_set_id,
    versionId: createdDraft.id,
    versionNumber: createdDraft.version_number,
  };
}

function renderChannelChunks(
  communityName: string,
  versionNumber: number,
  items: RuleItemView[],
  locale: Locale,
): string[] {
  const isId = locale === 'id-ID';
  const header = `${isId ? '📜 ATURAN KOMUNITAS' : '📜 COMMUNITY RULES'} — ${communityName}`;
  const footer = `\nv${versionNumber}`;

  const grouped = new Map<string, RuleItemView[]>();
  for (const item of items) {
    const key =
      item.categoryTitle || defaultCategoryTitle(item.categoryKey, locale);
    const arr = grouped.get(key) ?? [];
    arr.push(item);
    grouped.set(key, arr);
  }

  const blocks: string[] = [];
  for (const [categoryName, groupItems] of grouped.entries()) {
    const lines = [`📂 ${categoryName}`];
    for (const [idx, item] of groupItems.entries()) {
      const ref = item.referenceUrl ? `\n🔗 ${item.referenceUrl}` : '';
      lines.push(`${idx + 1}. ${item.title}\n${item.body}${ref}`);
    }
    blocks.push(lines.join('\n\n'));
  }

  if (blocks.length === 0) {
    return [
      `${header}\n\n${isId ? 'Belum ada pasal aturan.' : 'No rules defined.'}${footer}`,
    ];
  }

  const chunks: string[] = [];
  let current = `${header}\n\n`;
  for (const block of blocks) {
    if (
      current.length + block.length + 2 > CHANNEL_MESSAGE_LIMIT &&
      current.trim() !== header
    ) {
      chunks.push(current.trim());
      current = `${block}\n\n`;
    } else {
      current += `${block}\n\n`;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  if (chunks.length > 1) {
    return chunks.map((chunk, i) => {
      const partTag = `(${i + 1}/${chunks.length})`;
      const withPart =
        i === 0
          ? chunk.replace(header, `${header} ${partTag}`)
          : `${partTag}\n\n${chunk}`;
      return i === chunks.length - 1 ? `${withPart}${footer}` : withPart;
    });
  }

  return [`${chunks[0]}${footer}`];
}

async function syncRulesToMainChannel(
  ctx: BotContext,
  versionId: number,
): Promise<{
  synced: number;
  failed: number;
  skipped: boolean;
  channelLink: string | null;
}> {
  const target = parseMainChannelTarget(ctx.appEnv.MAIN_CHANNEL);
  if (!target || !ctx.supabase) {
    return { synced: 0, failed: 0, skipped: true, channelLink: null };
  }

  const [{ data: version }, { data: items }] = await Promise.all([
    ctx.supabase
      .from('rule_set_versions')
      .select('id, rule_set_id, version_number, locale')
      .eq('id', versionId)
      .maybeSingle(),
    ctx.supabase
      .from('rule_items')
      .select(
        'id, rule_key, category_key, category_title, title, body, reference_url, sort_order',
      )
      .eq('rule_set_version_id', versionId)
      .order('category_sort_order', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
  ]);

  if (!version) {
    return { synced: 0, failed: 0, skipped: true, channelLink: null };
  }

  const normalizedLocale = normalizeLocale(version.locale);
  const chunks = renderChannelChunks(
    ctx.appEnv.COMMUNITY_NAME || 'Community',
    version.version_number,
    (items ?? []).map((row) => ({
      id: row.id,
      ruleKey: row.rule_key,
      categoryKey: row.category_key,
      categoryTitle: row.category_title,
      title: row.title,
      body: row.body,
      referenceUrl: row.reference_url,
      sortOrder: row.sort_order,
    })),
    normalizedLocale,
  );

  const numericChatId = typeof target === 'number' ? target : 0;
  const { data: runRow } = await ctx.supabase
    .from('rule_publication_runs')
    .insert({
      rule_set_id: version.rule_set_id,
      rule_set_version_id: version.id,
      chat_id: numericChatId,
      status: 'running',
      lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
    })
    .select('id')
    .maybeSingle();

  const { data: existingPubs } = await ctx.supabase
    .from('rule_publications')
    .select('id, part_index, message_id, content_hash')
    .eq('rule_set_id', version.rule_set_id)
    .eq('chat_id', numericChatId)
    .eq('locale', version.locale);

  const existingByPart = new Map(
    (existingPubs ?? []).map((p) => [p.part_index, p]),
  );

  let synced = 0;
  let failed = 0;
  let firstMessageId: number | null = null;

  for (const [partIndex, text] of chunks.entries()) {
    const digest = await sha256Hex(text);
    const prev = existingByPart.get(partIndex);
    let messageId = prev?.message_id ?? null;

    try {
      if (messageId && prev?.content_hash === digest) {
        synced += 1;
      } else if (messageId) {
        try {
          await ctx.api.editMessageText(target, messageId, text);
          synced += 1;
        } catch {
          const sent = await ctx.api.sendMessage(target, text);
          messageId = sent.message_id;
          synced += 1;
        }
      } else {
        const sent = await ctx.api.sendMessage(target, text);
        messageId = sent.message_id;
        synced += 1;
      }

      if (partIndex === 0 && messageId) {
        firstMessageId = messageId;
      }

      await ctx.supabase.from('rule_publications').upsert(
        {
          rule_set_id: version.rule_set_id,
          rule_set_version_id: version.id,
          chat_id: numericChatId,
          locale: version.locale,
          category_key: 'all',
          part_index: partIndex,
          message_id: messageId,
          content_hash: digest,
          run_id: runRow?.id ?? null,
          status: 'synced',
          last_synced_at: new Date().toISOString(),
          last_error: null,
        },
        {
          onConflict: 'rule_set_id,chat_id,locale,category_key,part_index',
        },
      );
    } catch (err) {
      failed += 1;
      await ctx.supabase.from('rule_publications').upsert(
        {
          rule_set_id: version.rule_set_id,
          rule_set_version_id: version.id,
          chat_id: numericChatId,
          locale: version.locale,
          category_key: 'all',
          part_index: partIndex,
          message_id: messageId,
          content_hash: digest,
          run_id: runRow?.id ?? null,
          status: 'failed',
          last_error:
            err instanceof Error ? err.message.slice(0, 300) : 'Sync failed',
        },
        {
          onConflict: 'rule_set_id,chat_id,locale,category_key,part_index',
        },
      );
    }
  }

  if (runRow?.id) {
    await ctx.supabase
      .from('rule_publication_runs')
      .update({
        status: failed === 0 ? 'completed' : synced > 0 ? 'partial' : 'failed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', runRow.id);
  }

  return {
    synced,
    failed,
    skipped: false,
    channelLink: buildChannelLink(target, firstMessageId),
  };
}

async function buildRulesEditorPanel(ctx: BotContext) {
  const isId = ctx.locale === 'id-ID';
  if (!ctx.supabase) {
    return {
      formatted: fmt`${b}📜 Rules Editor${b}\n${t(ctx.locale, 'err.db_unconfigured')}`,
      keyboard: new InlineKeyboard().text('✖', 'nav:close'),
    };
  }

  const working = await getWorkingVersion(ctx);
  const items = working?.items ?? [];
  const versionLine = working
    ? fmt`\n${b}${isId ? 'Versi Aktif' : 'Working Version'}:${b} ${code}v${String(working.versionNumber)} (${working.status})${code}`
    : '';

  const list =
    items.length === 0
      ? isId
        ? 'Belum ada pasal aturan.'
        : 'No rule items yet.'
      : items
          .slice(0, 10)
          .map((r, idx) => `${idx + 1}. [${r.categoryKey}] ${r.title}`)
          .join('\n');

  const formatted = fmt`${b}📜 ${isId ? 'Rules Editor — Aturan Komunitas' : 'Community Rules Editor'}${b}${versionLine}\n\n${list}`;
  const keyboard = new InlineKeyboard()
    .text(isId ? '➕ Tambah Aturan' : '➕ Add Rule', 'rules_editor:add')
    .text(isId ? '✏️ Kelola Pasal' : '✏️ Manage Items', 'rules_editor:list:1')
    .row()
    .text(
      isId ? '🚀 Terbitkan Versi Baru' : '🚀 Publish New Version',
      'rules_editor:publish',
    )
    .text(isId ? '🔄 Sync Channel' : '🔄 Sync Channel', 'rules_editor:sync')
    .row()
    .text(isId ? '👁️ Pratinjau' : '👁️ Preview', 'nav:rules')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

async function buildEditorItemsList(ctx: BotContext, page = 1) {
  const isId = ctx.locale === 'id-ID';
  const working = await getWorkingVersion(ctx);
  const items = working?.items ?? [];

  if (items.length === 0) {
    return buildRulesEditorPanel(ctx);
  }

  const totalPages = Math.max(
    1,
    Math.ceil(items.length / EDITOR_ITEMS_PER_PAGE),
  );
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = items.slice(
    (safePage - 1) * EDITOR_ITEMS_PER_PAGE,
    safePage * EDITOR_ITEMS_PER_PAGE,
  );

  const formatted = fmt`${b}✏️ ${isId ? 'Pilih Pasal untuk Diedit/Hapus' : 'Select Rule Item to Edit/Delete'}${b} (${safePage}/${totalPages})`;
  const keyboard = new InlineKeyboard();
  for (const item of slice) {
    keyboard
      .text(
        `${item.categoryKey}: ${item.title.slice(0, 24)}`,
        `rules_editor:item:${item.id}`,
      )
      .row();
  }
  if (totalPages > 1) {
    if (safePage > 1) {
      keyboard.text('◀️', `rules_editor:list:${safePage - 1}`);
    }
    if (safePage < totalPages) {
      keyboard.text('▶️', `rules_editor:list:${safePage + 1}`);
    }
    keyboard.row();
  }
  keyboard
    .text(isId ? '← Kembali' : '← Back', 'rules_editor:panel')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  return { formatted, keyboard };
}

onCommand(rulesComposer, ['tcrules', 'tcrls'], async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  const { formatted, keyboard } = await buildRulesEditorPanel(ctx);
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

rulesComposer.callbackQuery('rules_editor:panel', async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.admin_only'),
      show_alert: true,
    });
    return;
  }
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = await buildRulesEditorPanel(ctx);
  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});

rulesComposer.callbackQuery(/^rules_editor:list:(\d+)$/, async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.admin_only'),
      show_alert: true,
    });
    return;
  }
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = await buildEditorItemsList(
    ctx,
    Number(ctx.match[1]),
  );
  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});

rulesComposer.callbackQuery(/^rules_editor:item:(\d+)$/, async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role) || !ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.admin_only'),
      show_alert: true,
    });
    return;
  }

  const itemId = Number(ctx.match[1]);
  const { data: item } = await ctx.supabase
    .from('rule_items')
    .select('id, category_key, title, body')
    .eq('id', itemId)
    .maybeSingle();

  if (!item) {
    await ctx.answerCallbackQuery({
      text: isId ? 'Pasal tidak ditemukan.' : 'Rule item not found.',
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  const formatted = fmt`${b}${item.title}${b} (${code}${item.category_key}${code})

${item.body}`;

  const keyboard = new InlineKeyboard()
    .text(
      isId ? '✏️ Edit Judul' : '✏️ Edit Title',
      `rules_editor:edit_title:${item.id}`,
    )
    .text(
      isId ? '📝 Edit Isi' : '📝 Edit Body',
      `rules_editor:edit_body:${item.id}`,
    )
    .row()
    .text(isId ? '🗑️ Hapus' : '🗑️ Delete', `rules_editor:del:${item.id}`)
    .text(isId ? '← Daftar' : '← List', 'rules_editor:list:1');

  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});

rulesComposer.callbackQuery('rules_editor:add', async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.admin_only'),
      show_alert: true,
    });
    return;
  }

  const working = await getWorkingVersion(ctx);
  const existingKeys = Array.from(
    new Set([
      'general',
      ...(working?.items.map((item) => item.categoryKey) ?? []),
    ]),
  ).slice(0, 6);

  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard();
  for (let idx = 0; idx < existingKeys.length; idx += 2) {
    const left = existingKeys[idx];
    const right = existingKeys[idx + 1];
    if (left) keyboard.text(`📂 ${left}`, `rules_editor:add_cat:${left}`);
    if (right) keyboard.text(`📂 ${right}`, `rules_editor:add_cat:${right}`);
    keyboard.row();
  }
  keyboard
    .text(
      isId ? '➕ Kategori Baru' : '➕ New Category',
      'rules_editor:add_cat:__custom__',
    )
    .text(isId ? '❌ Batal' : '❌ Cancel', 'rules_editor:cancel');

  await ctx.reply(
    isId
      ? '📂 Pilih kategori untuk pasal aturan baru:'
      : '📂 Select a category for the new rule:',
    { reply_markup: keyboard },
  );
});

rulesComposer.callbackQuery(
  /^rules_editor:add_cat:([a-z0-9_-]+)$/i,
  async (ctx) => {
    const isId = ctx.locale === 'id-ID';
    const role = await getUserRole(
      ctx.supabase,
      ctx.from.id,
      ctx.appEnv.OWNER_ID,
    );
    if (!isAdminOrOwner(role)) {
      await ctx.answerCallbackQuery({
        text: t(ctx.locale, 'err.admin_only'),
        show_alert: true,
      });
      return;
    }

    const picked = ctx.match[1];
    await ctx.answerCallbackQuery();

    if (picked === '__custom__') {
      await setBotSession<RulesEditorSession>(
        ctx.appEnv,
        'rules_editor',
        ctx.from.id,
        { step: 'await_category' },
      );
      await ctx.reply(
        isId
          ? '🏷️ Kirimkan nama/kunci kategori baru (contoh: spam, etika):'
          : '🏷️ Send the new category name/key (e.g., spam, conduct):',
        {
          reply_markup: new InlineKeyboard().text(
            isId ? '❌ Batal' : '❌ Cancel',
            'rules_editor:cancel',
          ),
        },
      );
      return;
    }

    await setBotSession<RulesEditorSession>(
      ctx.appEnv,
      'rules_editor',
      ctx.from.id,
      { step: 'await_title', categoryKey: picked },
    );
    await ctx.reply(
      isId
        ? `📝 Kategori: ${picked}\nKirimkan judul pasal aturan baru:`
        : `📝 Category: ${picked}\nSend the title for the new rule:`,
      {
        reply_markup: new InlineKeyboard().text(
          isId ? '❌ Batal' : '❌ Cancel',
          'rules_editor:cancel',
        ),
      },
    );
  },
);

rulesComposer.callbackQuery(
  /^rules_editor:(edit_title|edit_body):(\d+)$/,
  async (ctx) => {
    const isId = ctx.locale === 'id-ID';
    const role = await getUserRole(
      ctx.supabase,
      ctx.from.id,
      ctx.appEnv.OWNER_ID,
    );
    if (!isAdminOrOwner(role)) {
      await ctx.answerCallbackQuery({
        text: t(ctx.locale, 'err.admin_only'),
        show_alert: true,
      });
      return;
    }

    const mode = ctx.match[1] as 'edit_title' | 'edit_body';
    const itemId = Number(ctx.match[2]);
    await setBotSession<RulesEditorSession>(
      ctx.appEnv,
      'rules_editor',
      ctx.from.id,
      { step: mode, itemId },
    );
    await ctx.answerCallbackQuery();
    await ctx.reply(
      mode === 'edit_title'
        ? isId
          ? '✏️ Kirimkan judul baru untuk pasal ini:'
          : '✏️ Send the new title for this rule:'
        : isId
          ? '📝 Kirimkan isi/penjelasan baru untuk pasal ini:'
          : '📝 Send the new body/description for this rule:',
      {
        reply_markup: new InlineKeyboard().text(
          isId ? '❌ Batal' : '❌ Cancel',
          'rules_editor:cancel',
        ),
      },
    );
  },
);

rulesComposer.callbackQuery('rules_editor:cancel', async (ctx) => {
  await clearBotSession(ctx.appEnv, 'rules_editor', ctx.from.id);
  const isId = ctx.locale === 'id-ID';
  await ctx.answerCallbackQuery({ text: isId ? 'Dibatalkan.' : 'Cancelled.' });
  await ctx
    .editMessageText(
      isId ? '❌ Editor aturan dibatalkan.' : '❌ Rules editor cancelled.',
      { reply_markup: new InlineKeyboard() },
    )
    .catch(() => {});
});

rulesComposer.on('message:text', async (ctx, next) => {
  if (!ctx.from || /^[/!.]/.test(ctx.message.text.trim())) {
    await next();
    return;
  }

  const session = await getBotSession<RulesEditorSession>(
    ctx.appEnv,
    'rules_editor',
    ctx.from.id,
  );
  if (!session) {
    await next();
    return;
  }

  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role)) {
    await clearBotSession(ctx.appEnv, 'rules_editor', ctx.from.id);
    await next();
    return;
  }

  const isId = ctx.locale === 'id-ID';
  const text = ctx.message.text.trim();

  if (session.step === 'await_category') {
    const categoryKey = slugifyCategory(text);
    await setBotSession<RulesEditorSession>(
      ctx.appEnv,
      'rules_editor',
      ctx.from.id,
      { step: 'await_title', categoryKey },
    );
    await ctx.reply(
      isId
        ? `📝 Kategori disetel ke ${categoryKey}. Sekarang kirimkan judul pasal aturan baru:`
        : `📝 Category set to ${categoryKey}. Now send the title for the new rule:`,
    );
    return;
  }

  if (session.step === 'await_title') {
    await setBotSession<RulesEditorSession>(
      ctx.appEnv,
      'rules_editor',
      ctx.from.id,
      {
        step: 'await_body',
        categoryKey: session.categoryKey,
        title: text.slice(0, 200),
      },
    );
    await ctx.reply(
      isId
        ? '📄 Sekarang kirimkan isi/penjelasan aturan tersebut:'
        : '📄 Now send the body/description for this rule:',
    );
    return;
  }

  await clearBotSession(ctx.appEnv, 'rules_editor', ctx.from.id);
  if (!ctx.supabase) {
    await ctx.reply(t(ctx.locale, 'err.db_unconfigured'));
    return;
  }

  if (session.step === 'edit_title' || session.step === 'edit_body') {
    const patch =
      session.step === 'edit_title'
        ? { title: text.slice(0, 200) }
        : { body: text.slice(0, 3500) };
    await ctx.supabase
      .from('rule_items')
      .update(patch)
      .eq('id', session.itemId);
    await invalidatePublishedRulesCache(ctx.appEnv);
    await recordAuditEvent(ctx.supabase, {
      eventKey:
        session.step === 'edit_title'
          ? 'rules.item_title_edited'
          : 'rules.item_body_edited',
      entityType: 'rule_item',
      entityId: String(session.itemId),
      actorUserId: ctx.from.id,
    });
    await ctx.reply(
      isId
        ? '✅ Pasal aturan diperbarui. Gunakan panel editor untuk menerbitkan versi baru jika Anda mengedit draf.'
        : '✅ Rule item updated. Use the editor panel to publish a new version if editing a draft.',
      {
        reply_markup: new InlineKeyboard().text(
          isId ? '📜 Buka Editor' : '📜 Open Editor',
          'rules_editor:panel',
        ),
      },
    );
    return;
  }

  const draft = await ensureDraftVersion(ctx);
  if (draft) {
    await ctx.supabase.from('rule_items').insert({
      rule_set_version_id: draft.versionId,
      rule_key: `rule-${Date.now()}`,
      category_key: session.categoryKey,
      category_title: defaultCategoryTitle(session.categoryKey, ctx.locale),
      title: session.title,
      body: text.slice(0, 3500),
      sort_order: 100,
    });
    await invalidatePublishedRulesCache(ctx.appEnv);
    await recordAuditEvent(ctx.supabase, {
      eventKey: 'rules.item_added',
      entityType: 'rule_set_version',
      entityId: String(draft.versionId),
      actorUserId: ctx.from.id,
      payload: {
        title: session.title,
        categoryKey: session.categoryKey,
      },
    });
  }

  await ctx.reply(
    isId
      ? '✅ Pasal baru ditambahkan ke draf. Tekan "Terbitkan Versi Baru" agar tampil ke publik.'
      : '✅ New rule added to draft. Press "Publish New Version" to make it live.',
    {
      reply_markup: new InlineKeyboard()
        .text(
          isId ? '🚀 Terbitkan Versi Baru' : '🚀 Publish New Version',
          'rules_editor:publish',
        )
        .text(
          isId ? '📜 Panel Editor' : '📜 Editor Panel',
          'rules_editor:panel',
        ),
    },
  );
});

rulesComposer.callbackQuery(/^rules_editor:del:(\d+)$/, async (ctx) => {
  const itemId = Number(ctx.match[1]);
  const isId = ctx.locale === 'id-ID';
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role) || !ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.admin_only'),
      show_alert: true,
    });
    return;
  }

  await ctx.supabase.from('rule_items').delete().eq('id', itemId);
  await invalidatePublishedRulesCache(ctx.appEnv);
  await recordAuditEvent(ctx.supabase, {
    eventKey: 'rules.item_deleted',
    entityType: 'rule_item',
    entityId: String(itemId),
    actorUserId: ctx.from.id,
  });

  await ctx.answerCallbackQuery({
    text: isId ? 'Aturan dihapus.' : 'Rule deleted.',
  });
  const { formatted, keyboard } = await buildEditorItemsList(ctx, 1);
  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});

rulesComposer.callbackQuery('rules_editor:publish', async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role) || !ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.admin_only'),
      show_alert: true,
    });
    return;
  }

  const draft = await ensureDraftVersion(ctx);
  if (!draft) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Gagal menyiapkan versi draf.'
        : 'Failed to prepare draft version.',
      show_alert: true,
    });
    return;
  }

  const { count } = await ctx.supabase
    .from('rule_items')
    .select('id', { count: 'exact', head: true })
    .eq('rule_set_version_id', draft.versionId);

  if (!count || count === 0) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Tidak ada pasal untuk diterbitkan. Tambahkan minimal 1 aturan.'
        : 'No rule items to publish. Add at least 1 rule first.',
      show_alert: true,
    });
    return;
  }

  await ctx.supabase
    .from('rule_set_versions')
    .update({ status: 'archived' })
    .eq('rule_set_id', draft.ruleSetId)
    .eq('status', 'published');

  await ctx.supabase
    .from('rule_set_versions')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      published_by_user_id: ctx.from.id,
    })
    .eq('id', draft.versionId);

  await invalidatePublishedRulesCache(ctx.appEnv);
  await recordAuditEvent(ctx.supabase, {
    eventKey: 'rules.version_published',
    entityType: 'rule_set_version',
    entityId: String(draft.versionId),
    actorUserId: ctx.from.id,
    payload: { versionNumber: draft.versionNumber },
  });

  const syncResult = await syncRulesToMainChannel(ctx, draft.versionId);
  await ctx.answerCallbackQuery({
    text: isId
      ? `Versi v${draft.versionNumber} diterbitkan!`
      : `Version v${draft.versionNumber} published!`,
  });

  const syncSummary = syncResult.skipped
    ? ''
    : isId
      ? `\nSinkronisasi channel: ${syncResult.synced} berhasil, ${syncResult.failed} gagal.`
      : `\nChannel sync: ${syncResult.synced} synced, ${syncResult.failed} failed.`;

  const formatted = fmt`${b}🚀 ${isId ? 'Versi Baru Diterbitkan' : 'New Version Published'}${b} (${code}v${String(draft.versionNumber)}${code})${syncSummary}`;
  const keyboard = new InlineKeyboard();
  if (syncResult.channelLink) {
    keyboard
      .url(
        isId ? '📢 Lihat di Channel' : '📢 View in Channel',
        syncResult.channelLink,
      )
      .row();
  }
  keyboard
    .text(isId ? '📜 Lihat Aturan' : '📜 View Rules', 'nav:rules')
    .text(isId ? '← Panel Editor' : '← Editor Panel', 'rules_editor:panel');

  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});

rulesComposer.callbackQuery('rules_editor:sync', async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  if (!isAdminOrOwner(role) || !ctx.supabase) {
    await ctx.answerCallbackQuery({
      text: t(ctx.locale, 'err.admin_only'),
      show_alert: true,
    });
    return;
  }

  const published = await loadPublishedRules(ctx, { bypassCache: true });
  if (!published.versionId) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'Belum ada versi aturan yang terbit.'
        : 'No published rules version yet.',
      show_alert: true,
    });
    return;
  }

  const syncResult = await syncRulesToMainChannel(ctx, published.versionId);
  if (syncResult.skipped) {
    await ctx.answerCallbackQuery({
      text: isId
        ? 'MAIN_CHANNEL belum dikonfigurasi.'
        : 'MAIN_CHANNEL is not configured.',
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({
    text: isId
      ? `Sync selesai: ${syncResult.synced} berhasil, ${syncResult.failed} gagal.`
      : `Sync done: ${syncResult.synced} synced, ${syncResult.failed} failed.`,
    show_alert: true,
  });
});

// ─────────────────────────── Greeting, Migration & Join Enforcement ─────────────────────────── #

function isPrimaryChat(
  env: Pick<CloudflareBindings, 'MAIN_GROUP'>,
  chatId: number,
): boolean {
  const mainGroup = Number(env.MAIN_GROUP || '0');
  return Number.isFinite(mainGroup) && mainGroup !== 0 && chatId === mainGroup;
}

async function isChatInFederation(
  ctx: BotContext,
  chatId: number,
): Promise<boolean | null> {
  if (isPrimaryChat(ctx.appEnv, chatId)) return true;
  if (!ctx.supabase) return true;
  const { data, error } = await ctx.supabase
    .from('connected_chats')
    .select('is_active')
    .eq('chat_id', chatId)
    .maybeSingle();
  if (error) return null;
  return Boolean(data?.is_active);
}

async function loadChatGreetingSettings(
  ctx: BotContext,
  chatId: number,
): Promise<ChatGreetingSettings> {
  const isPrimary = isPrimaryChat(ctx.appEnv, chatId);
  const hasMainGroup = Boolean(Number(ctx.appEnv.MAIN_GROUP || '0'));
  const defaults: ChatGreetingSettings = {
    locale: ctx.locale,
    welcomeEnabled: isPrimary || !hasMainGroup,
    goodbyeEnabled: isPrimary || !hasMainGroup,
    requireRulesAck: true,
    welcomeMessage: null,
    goodbyeMessage: null,
  };

  if (!ctx.supabase) return defaults;

  const { data } = await ctx.supabase
    .from('chat_settings')
    .select('locale, settings')
    .eq('chat_id', chatId)
    .maybeSingle();

  if (!data) return defaults;

  const raw =
    data.settings &&
    typeof data.settings === 'object' &&
    !Array.isArray(data.settings)
      ? (data.settings as Record<string, unknown>)
      : {};

  const welcomeFlag =
    typeof raw.welcome_enabled === 'boolean'
      ? raw.welcome_enabled
      : typeof raw.greeting_enabled === 'boolean'
        ? raw.greeting_enabled
        : defaults.welcomeEnabled;

  const goodbyeFlag =
    typeof raw.goodbye_enabled === 'boolean'
      ? raw.goodbye_enabled
      : typeof raw.left_enabled === 'boolean'
        ? raw.left_enabled
        : defaults.goodbyeEnabled;

  return {
    locale: data.locale ? normalizeLocale(data.locale) : defaults.locale,
    welcomeEnabled: welcomeFlag,
    goodbyeEnabled: goodbyeFlag,
    requireRulesAck:
      typeof raw.require_rules_ack === 'boolean'
        ? raw.require_rules_ack
        : defaults.requireRulesAck,
    welcomeMessage:
      typeof raw.welcome_message === 'string' && raw.welcome_message.trim()
        ? raw.welcome_message.trim()
        : null,
    goodbyeMessage:
      typeof raw.goodbye_message === 'string' && raw.goodbye_message.trim()
        ? raw.goodbye_message.trim()
        : null,
  };
}

function applyGreetingTemplate(
  template: string,
  vars: {
    user: string;
    name: string;
    id: number;
    community: string;
    chat: string;
  },
): string {
  return template
    .replace(/\{user\}/g, vars.user)
    .replace(/\{name\}/g, vars.name)
    .replace(/\{id\}/g, String(vars.id))
    .replace(/\{community\}/g, vars.community)
    .replace(/\{chat\}/g, vars.chat);
}

async function migrateGroupChatId(
  ctx: BotContext,
  oldChatId: number,
  newChatId: number,
): Promise<void> {
  if (!ctx.supabase || oldChatId === newChatId) return;
  const { data: oldConn } = await ctx.supabase
    .from('connected_chats')
    .select('added_by_user_id, is_active')
    .eq('chat_id', oldChatId)
    .maybeSingle();

  if (oldConn?.is_active) {
    await ctx.supabase.from('telegram_chats').upsert(
      {
        chat_id: newChatId,
        chat_type: 'supergroup',
        title:
          ctx.chat && 'title' in ctx.chat ? (ctx.chat.title ?? null) : null,
      },
      { onConflict: 'chat_id' },
    );
    await ctx.supabase.from('connected_chats').upsert(
      {
        chat_id: newChatId,
        added_by_user_id: oldConn.added_by_user_id,
        is_active: true,
      },
      { onConflict: 'chat_id' },
    );
    await ctx.supabase
      .from('connected_chats')
      .update({ is_active: false })
      .eq('chat_id', oldChatId);

    const { data: oldSettings } = await ctx.supabase
      .from('chat_settings')
      .select('locale, settings, timezone')
      .eq('chat_id', oldChatId)
      .maybeSingle();

    if (oldSettings) {
      await ctx.supabase.from('chat_settings').upsert(
        {
          chat_id: newChatId,
          locale: oldSettings.locale,
          settings: oldSettings.settings,
          timezone: oldSettings.timezone,
        },
        { onConflict: 'chat_id' },
      );
    }
  }
}

// Supergroup upgrade migration handlers (both old and new chat updates)
rulesComposer.on('message:migrate_to_chat_id', async (ctx) => {
  if (!ctx.chat) return;
  await migrateGroupChatId(ctx, ctx.chat.id, ctx.message.migrate_to_chat_id);
});

rulesComposer.on('message:migrate_from_chat_id', async (ctx) => {
  if (!ctx.chat) return;
  await migrateGroupChatId(ctx, ctx.message.migrate_from_chat_id, ctx.chat.id);
});

// Join request enforcement (auto-decline federation-banned users)
rulesComposer.on('chat_join_request', async (ctx) => {
  const req = ctx.chatJoinRequest;
  if (!req || req.from.is_bot || !ctx.supabase) return;

  const inFed = await isChatInFederation(ctx, req.chat.id);
  if (inFed === false) return;

  const ownerId = Number(ctx.appEnv.OWNER_ID || '0');
  if (Number.isFinite(ownerId) && ownerId > 0 && req.from.id === ownerId) {
    return;
  }

  const { data: activeBan, error } = await ctx.supabase
    .from('moderation_actions')
    .select('id')
    .eq('target_user_id', req.from.id)
    .eq('action_type', 'ban')
    .eq('status', 'active')
    .maybeSingle();

  if (error || activeBan) {
    await ctx.api
      .declineChatJoinRequest(req.chat.id, req.from.id)
      .catch(() => {});
    await ctx.supabase.from('join_requests').insert({
      chat_id: req.chat.id,
      owner_user_id: req.from.id,
      status: 'declined',
      resolved_at: new Date().toISOString(),
      decision_note: error
        ? 'Fail-closed decline due to ban lookup error'
        : 'Auto-declined due to active federation ban',
    });
    return;
  }

  await ctx.supabase.from('join_requests').insert({
    chat_id: req.chat.id,
    owner_user_id: req.from.id,
    status: 'pending',
  });
});

// Join enforcement and per-chat configurable greeting for newly added group members
rulesComposer.on('message:new_chat_members', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  const inFed = await isChatInFederation(ctx, ctx.chat.id);
  if (inFed === false) return;

  const greeting = await loadChatGreetingSettings(ctx, ctx.chat.id);
  const isId = greeting.locale === 'id-ID';
  const members = ctx.message.new_chat_members;
  const published = greeting.welcomeEnabled
    ? await loadPublishedRules(ctx)
    : null;

  for (const member of members) {
    if (member.is_bot) continue;

    if (ctx.supabase) {
      const { data: activeBan } = await ctx.supabase
        .from('moderation_actions')
        .select('external_ref, expires_at')
        .eq('target_user_id', member.id)
        .eq('action_type', 'ban')
        .eq('status', 'active')
        .maybeSingle();

      if (activeBan) {
        await ctx.api
          .banChatMember(ctx.chat.id, member.id, {
            until_date: activeBan.expires_at
              ? Math.floor(new Date(activeBan.expires_at).getTime() / 1000)
              : undefined,
          })
          .catch(() => {});
        continue;
      }

      const { data: activeMute } = await ctx.supabase
        .from('moderation_actions')
        .select('expires_at')
        .eq('target_user_id', member.id)
        .eq('action_type', 'mute')
        .eq('status', 'active')
        .maybeSingle();

      if (activeMute) {
        await ctx.api
          .restrictChatMember(
            ctx.chat.id,
            member.id,
            { can_send_messages: false },
            {
              until_date: activeMute.expires_at
                ? Math.floor(new Date(activeMute.expires_at).getTime() / 1000)
                : undefined,
            },
          )
          .catch(() => {});
      }
    }

    if (!greeting.welcomeEnabled) continue;

    const name = member.first_name || String(member.id);
    const userLabel = member.username ? `@${member.username}` : name;
    const chatTitle =
      'title' in ctx.chat && ctx.chat.title
        ? ctx.chat.title
        : String(ctx.chat.id);

    const formatted = greeting.welcomeMessage
      ? fmt`${applyGreetingTemplate(greeting.welcomeMessage, {
          user: userLabel,
          name,
          id: member.id,
          community: ctx.appEnv.COMMUNITY_NAME || 'Community',
          chat: chatTitle,
        })}`
      : fmt`${b}${isId ? `Selamat datang, ${name}!` : `Welcome, ${name}!`}${b}
ID: ${code}${String(member.id)}${code}`;

    const keyboard = new InlineKeyboard();
    if (
      published?.versionId &&
      published.requiresAcknowledgement &&
      greeting.requireRulesAck
    ) {
      let alreadyAcked = false;
      if (ctx.supabase) {
        const { data: ackRow } = await ctx.supabase
          .from('rule_acknowledgements')
          .select('id')
          .eq('rule_set_version_id', published.versionId)
          .eq('user_id', member.id)
          .maybeSingle();
        alreadyAcked = Boolean(ackRow);
      }
      if (!alreadyAcked) {
        keyboard.text(
          isId ? '✅ Saya Setuju' : '✅ I Acknowledge',
          `rules_ack:${published.versionId}:${member.id}`,
        );
      }
    }

    keyboard.text(isId ? '📜 Baca Aturan' : '📜 Read Rules', 'nav:rules');

    await ctx
      .reply(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  }
});

// Departure announcement for left group members (respects per-chat chat_settings)
rulesComposer.on('message:left_chat_member', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  const member = ctx.message.left_chat_member;
  if (!member || member.is_bot) return;

  const inFed = await isChatInFederation(ctx, ctx.chat.id);
  if (inFed === false) return;

  const greeting = await loadChatGreetingSettings(ctx, ctx.chat.id);
  if (!greeting.goodbyeEnabled) return;

  const isId = greeting.locale === 'id-ID';
  const name = member.first_name || String(member.id);
  const userLabel = member.username ? `@${member.username}` : name;
  const chatTitle =
    'title' in ctx.chat && ctx.chat.title
      ? ctx.chat.title
      : String(ctx.chat.id);

  const formatted = greeting.goodbyeMessage
    ? fmt`${applyGreetingTemplate(greeting.goodbyeMessage, {
        user: userLabel,
        name,
        id: member.id,
        community: ctx.appEnv.COMMUNITY_NAME || 'Community',
        chat: chatTitle,
      })}`
    : fmt`${isId ? `👋 ${name} telah meninggalkan grup.` : `👋 ${name} has left the group.`}`;

  await ctx
    .reply(formatted.text, {
      entities: formatted.entities,
    })
    .catch(() => {});
});
