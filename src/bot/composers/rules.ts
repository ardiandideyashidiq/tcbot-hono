import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner, recordAuditEvent } from '../db';
import { t } from '../i18n';
import { onCommand } from '../prefixes';
import { clearBotSession, getBotSession, setBotSession } from '../session';

export const rulesComposer = new Composer<BotContext>();

interface RulesEditorSession {
  step: 'await_title' | 'await_body';
  title?: string;
}

async function loadPublishedRules(ctx: BotContext) {
  if (!ctx.supabase)
    return {
      versionId: null as number | null,
      items: [] as Array<{ id: number; title: string; body: string }>,
    };

  const { data: version } = await ctx.supabase
    .from('rule_set_versions')
    .select('id')
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!version) return { versionId: null, items: [] };

  const { data: items } = await ctx.supabase
    .from('rule_items')
    .select('id, title, body')
    .eq('rule_set_version_id', version.id)
    .order('sort_order', { ascending: true })
    .limit(20);

  return { versionId: version.id, items: items ?? [] };
}

async function sendRulesMessage(ctx: BotContext, edit = false, page = 1) {
  const isId = ctx.locale === 'id-ID';
  const { versionId, items } = await loadPublishedRules(ctx);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  const formatted =
    items.length === 0
      ? fmt`${b}${isId ? 'Aturan Komunitas' : 'Community Rules'}${b}
${isId ? 'Belum ada aturan yang diterbitkan.' : 'No published rules yet.'}`
      : fmt`${b}${isId ? 'Aturan Komunitas' : 'Community Rules'}${b} (${safePage}/${totalPages})\n\n${slice
          .map(
            (r, idx) =>
              `${(safePage - 1) * pageSize + idx + 1}. ${r.title}\n   ${r.body}`,
          )
          .join('\n\n')}`;

  const keyboard = new InlineKeyboard();
  if (totalPages > 1) {
    if (safePage > 1) keyboard.text('◀️', `rules:page:${safePage - 1}`);
    if (safePage < totalPages) keyboard.text('▶️', `rules:page:${safePage + 1}`);
    keyboard.row();
  }
  if (versionId) {
    keyboard
      .text(
        isId ? '✅ Saya Setuju' : '✅ I Acknowledge',
        `rules:ack:${versionId}`,
      )
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

onCommand(rulesComposer, 'rules', async (ctx) => {
  await sendRulesMessage(ctx, false, 1);
});

rulesComposer.callbackQuery('nav:rules', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendRulesMessage(ctx, true, 1);
});

rulesComposer.callbackQuery(/^rules:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendRulesMessage(ctx, true, Number(ctx.match[1]));
});

rulesComposer.callbackQuery(/^rules:ack:(\d+)$/, async (ctx) => {
  const versionId = Number(ctx.match[1]);
  const isId = ctx.locale === 'id-ID';

  if (ctx.supabase && ctx.from) {
    await ctx.supabase.from('rule_acknowledgements').upsert(
      {
        rule_set_version_id: versionId,
        user_id: ctx.from.id,
        context_chat_id: ctx.chat?.id ?? null,
        acknowledgement_method: 'inline_button',
      },
      { onConflict: 'rule_set_version_id,user_id' },
    );
  }

  await ctx.answerCallbackQuery({
    text: isId
      ? 'Terima kasih, persetujuan aturan Anda tercatat.'
      : 'Thank you, your acknowledgement has been recorded.',
    show_alert: true,
  });
});

// Staff Rules Editor (/tcrules)
async function buildRulesEditorPanel(ctx: BotContext) {
  const isId = ctx.locale === 'id-ID';
  if (!ctx.supabase) {
    return {
      formatted: fmt`${b}📜 Rules Editor${b}\n${t(ctx.locale, 'err.db_unconfigured')}`,
      keyboard: new InlineKeyboard().text('✖', 'nav:close'),
    };
  }

  const { items } = await loadPublishedRules(ctx);
  const list =
    items.length === 0
      ? isId
        ? 'Belum ada pasal aturan.'
        : 'No rule items yet.'
      : items
          .slice(0, 10)
          .map((r, i) => `${i + 1}. ${r.title}`)
          .join('\n');

  const formatted = fmt`${b}📜 ${isId ? 'Editor Aturan Komunitas' : 'Community Rules Editor'}${b}\n\n${list}`;
  const keyboard = new InlineKeyboard()
    .text(isId ? '➕ Tambah Aturan' : '➕ Add Rule', 'rules_editor:add')
    .text(isId ? '👁️ Pratinjau' : '👁️ Preview', 'nav:rules')
    .row()
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

  await setBotSession<RulesEditorSession>(
    ctx.appEnv,
    'rules_editor',
    ctx.from.id,
    { step: 'await_title' },
  );
  await ctx.answerCallbackQuery();
  await ctx.reply(
    isId
      ? '📝 Kirimkan judul pasal aturan baru:'
      : '📝 Send the title for the new rule:',
    {
      reply_markup: new InlineKeyboard().text(
        isId ? '❌ Batal' : '❌ Cancel',
        'rules_editor:cancel',
      ),
    },
  );
});

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

  const isId = ctx.locale === 'id-ID';
  const text = ctx.message.text.trim();

  if (session.step === 'await_title') {
    await setBotSession<RulesEditorSession>(
      ctx.appEnv,
      'rules_editor',
      ctx.from.id,
      { step: 'await_body', title: text.slice(0, 120) },
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

  let { data: version } = await ctx.supabase
    .from('rule_set_versions')
    .select('id')
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!version) {
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
        })
        .select('id')
        .single();
      ruleSet = createdSet;
    }

    if (ruleSet) {
      const { data: createdVer } = await ctx.supabase
        .from('rule_set_versions')
        .insert({
          rule_set_id: ruleSet.id,
          version_number: 1,
          status: 'published',
          published_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      version = createdVer;
    }
  }

  if (version) {
    await ctx.supabase.from('rule_items').insert({
      rule_set_version_id: version.id,
      rule_key: `rule-${Date.now()}`,
      category_key: 'general',
      title: session.title ?? 'Rule',
      body: text.slice(0, 1000),
      sort_order: 100,
    });
    await recordAuditEvent(ctx.supabase, {
      eventKey: 'rules.item_added',
      entityType: 'rule_set_version',
      entityId: String(version.id),
      actorUserId: ctx.from.id,
      payload: { title: session.title },
    });
  }

  await ctx.reply(
    isId
      ? '✅ Aturan baru berhasil ditambahkan dan langsung diterbitkan.'
      : '✅ New rule added and published.',
    {
      reply_markup: new InlineKeyboard().text(
        isId ? '📜 Lihat Aturan' : '📜 View Rules',
        'nav:rules',
      ),
    },
  );
});

// Join request enforcement (auto-decline federation-banned users)
rulesComposer.on('chat_join_request', async (ctx) => {
  const req = ctx.chatJoinRequest;
  if (!req || !ctx.supabase) return;

  const { data: activeBan } = await ctx.supabase
    .from('moderation_actions')
    .select('id')
    .eq('target_user_id', req.from.id)
    .eq('action_type', 'ban')
    .eq('status', 'active')
    .maybeSingle();

  if (activeBan) {
    await ctx.api
      .declineChatJoinRequest(req.chat.id, req.from.id)
      .catch(() => {});
    await ctx.supabase.from('join_requests').insert({
      chat_id: req.chat.id,
      owner_user_id: req.from.id,
      status: 'declined',
      resolved_at: new Date().toISOString(),
      decision_note: 'Auto-declined due to active federation ban',
    });
    return;
  }

  await ctx.supabase.from('join_requests').insert({
    chat_id: req.chat.id,
    owner_user_id: req.from.id,
    status: 'pending',
  });
});

// Join enforcement for newly added group members
rulesComposer.on('message:new_chat_members', async (ctx) => {
  if (!ctx.chat || ctx.chat.type === 'private') return;
  const members = ctx.message.new_chat_members;
  const isId = ctx.locale === 'id-ID';

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

    const name = member.first_name || String(member.id);
    const formatted = fmt`${b}${isId ? `Selamat datang, ${name}!` : `Welcome, ${name}!`}${b}
ID: ${code}${String(member.id)}${code}`;

    const keyboard = new InlineKeyboard().text(
      isId ? '📜 Baca Aturan' : '📜 Read Rules',
      'nav:rules',
    );

    await ctx
      .reply(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  }
});
