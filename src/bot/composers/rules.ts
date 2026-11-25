import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';

export const rulesComposer = new Composer<BotContext>();

async function loadPublishedRules(ctx: BotContext) {
  if (!ctx.supabase)
    return {
      versionId: null as number | null,
      items: [] as Array<{ title: string; body: string }>,
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
    .select('title, body')
    .eq('rule_set_version_id', version.id)
    .order('sort_order', { ascending: true })
    .limit(10);

  return { versionId: version.id, items: items ?? [] };
}

async function sendRulesMessage(ctx: BotContext, edit = false) {
  const isId = ctx.locale === 'id-ID';
  const { versionId, items } = await loadPublishedRules(ctx);

  const formatted =
    items.length === 0
      ? fmt`${b}${isId ? 'Aturan Komunitas' : 'Community Rules'}${b}
${isId ? 'Belum ada aturan yang diterbitkan.' : 'No published rules yet.'}`
      : fmt`${b}${isId ? 'Aturan Komunitas' : 'Community Rules'}${b}\n\n${items
          .map((r, idx) => `${idx + 1}. ${r.title}\n   ${r.body}`)
          .join('\n\n')}`;

  const keyboard = new InlineKeyboard();
  if (versionId) {
    keyboard.text(
      isId ? '✅ Saya Setuju' : '✅ I Acknowledge',
      `rules:ack:${versionId}`,
    );
  }
  keyboard
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close');

  if (edit) {
    await ctx.editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    });
  }
}

rulesComposer.command('rules', async (ctx) => {
  await sendRulesMessage(ctx, false);
});

rulesComposer.callbackQuery('nav:rules', async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendRulesMessage(ctx, true);
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
