import { b, code, expandableBlockquote, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner, setCachedUserLocale } from '../db';
import { t } from '../i18n';
import { onCommand } from '../prefixes';
import {
  appendDropdown,
  buildFormatShowcaseCard,
  buildHelpCard,
  buildLanguageCard,
  buildPingCard,
  buildStartCard,
} from '../ui';

export const generalComposer = new Composer<BotContext>();

onCommand(generalComposer, 'start', async (ctx) => {
  const role = await getUserRole(
    ctx.supabase,
    ctx.from?.id ?? 0,
    ctx.appEnv.OWNER_ID,
  );
  const { formatted, keyboard } = buildStartCard(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
    ctx.from?.first_name,
    isAdminOrOwner(role),
  );
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

function buildHelpTopicCard(
  locale: string,
  topic: string,
  dropdownOpen = false,
) {
  const isId = locale === 'id-ID';
  const titles: Record<string, { id: string; en: string }> = {
    general: { id: '📖 Bantuan: Perintah Umum', en: '📖 Help: General' },
    mod: { id: '🛡️ Bantuan: Moderasi', en: '🛡️ Help: Moderation' },
    rbac: { id: '👑 Bantuan: Staf & Grup', en: '👑 Help: Staff & Groups' },
    maint: { id: '🔧 Bantuan: Pemeliharaan', en: '🔧 Help: Maintenance' },
  };
  const bodies: Record<string, { id: string; en: string }> = {
    general: {
      id: '/start — Menu utama\n/help — Bantuan topik\n/ping — Cek latensi\n/speedtest — Ukur latensi Workers, DB & KV\n/language — Ubah bahasa\n/checkme — Status moderasi Anda\n/rules — Aturan komunitas\n/appeal — Ajukan banding (DM)\n/privacy — Kebijakan privasi\n/about — Tentang bot\n/additional — Info tambahan',
      en: '/start — Main menu\n/help — Topic help\n/ping — Check latency\n/speedtest — Measure Workers, DB & KV RTT\n/language — Switch language\n/checkme — Your moderation status\n/rules — Community rules\n/appeal — Submit an appeal (DM)\n/privacy — Privacy policy\n/about — About bot\n/additional — Additional info',
    },
    mod: {
      id: '/tcban <user> [durasi] [alasan] — Ban federasi\n/tcunban <user> — Cabut ban\n/tcmute <user> [durasi] [alasan] — Bisukan\n/tcunmute <user> — Buka bisu\n/tckick <user> [alasan] — Keluarkan\n/tcwarn <user> [alasan] — Beri peringatan\n/tcunwarn <user> — Cabut 1 peringatan\n/warns <user> — Lihat peringatan\n/resetwarns <user> — Reset peringatan\n/check <user> — Periksa riwayat',
      en: '/tcban <user> [duration] [reason] — Federation ban\n/tcunban <user> — Lift ban\n/tcmute <user> [duration] [reason] — Mute user\n/tcunmute <user> — Unmute user\n/tckick <user> [reason] — Kick user\n/tcwarn <user> [reason] — Warn user\n/tcunwarn <user> — Remove 1 warning\n/warns <user> — Inspect warnings\n/resetwarns <user> — Clear warnings\n/check <user> — Inspect history',
    },
    rbac: {
      id: '/tcconnect — Hubungkan grup\n/tcdisconnect — Putuskan grup ini\n/rmtc <chat_id> — Putuskan grup via ID\n/tcgroups — Daftar grup terhubung\n/tcbroadcast <pesan> — Pengumuman federasi\n/tcrules — Editor aturan komunitas\n/admins — Daftar staf\n/tcpromote <user> [role] — Promosi / ajukan promosi\n/tcsetrole <user> <role> — Atur role langsung\n/tcdemote <user> — Turunkan staf\n/transferowner <user> — Transfer owner',
      en: '/tcconnect — Connect group\n/tcdisconnect — Disconnect current group\n/rmtc <chat_id> — Disconnect by ID\n/tcgroups — List connected groups\n/tcbroadcast <msg> — Federation broadcast\n/tcrules — Community rules editor\n/admins — Staff list\n/tcpromote <user> [role] — Promote / request\n/tcsetrole <user> <role> — Set role directly\n/tcdemote <user> — Demote staff\n/transferowner <user> — Transfer owner',
    },
    maint: {
      id: '/tcstats — Statistik federasi & cari ban\n/cleanup — Nonaktifkan grup ghost\n/leaveall — Keluar dari grup non-primer\n/tcrepair — Retry enforcement yang gagal\n/tcforget — Hapus/anonimkan data pribadi',
      en: '/tcstats — Federation stats & ban search\n/cleanup — Deactivate ghost groups\n/leaveall — Leave non-primary groups\n/tcrepair — Retry failed enforcements\n/tcforget — Anonymize personal data',
    },
  };

  const tEntry = titles[topic] ?? titles.general;
  const bEntry = bodies[topic] ?? bodies.general;
  const formatted = fmt`${b}${isId ? tEntry.id : tEntry.en}${b}

${expandableBlockquote}${isId ? bEntry.id : bEntry.en}${expandableBlockquote}`;
  const keyboard = new InlineKeyboard();
  appendDropdown(keyboard, {
    prefix: 'dd:help',
    placeholder: isId ? 'Pilih Topik Bantuan' : 'Select Help Topic',
    selectedValue: topic,
    isOpen: dropdownOpen,
    closeLabel: isId ? 'Tutup Topik' : 'Close Topics',
    options: [
      { value: 'general', label: isId ? 'Umum' : 'General' },
      { value: 'mod', label: isId ? 'Moderasi' : 'Moderation' },
      { value: 'rbac', label: isId ? 'Staf & Grup' : 'Staff & Groups' },
      { value: 'maint', label: isId ? 'Pemeliharaan' : 'Maintenance' },
    ],
  });
  keyboard
    .row()
    .text(isId ? '← Kembali' : '← Back', 'nav:start')
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  return { formatted, keyboard };
}

onCommand(generalComposer, 'help', async (ctx) => {
  const { formatted, keyboard } = buildHelpCard(ctx.locale);
  keyboard
    .row()
    .text(
      ctx.locale === 'id-ID' ? '▾ Pilih Topik Lengkap' : '▾ Select Topic',
      'dd:help:open:general',
    )
    .primary();
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery(
  /^help:topic:(general|mod|rbac|maint)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const { formatted, keyboard } = buildHelpTopicCard(
      ctx.locale,
      ctx.match[1],
      false,
    );
    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  },
);

generalComposer.callbackQuery(
  /^dd:help:(open|close|pick):(general|mod|rbac|maint|_)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const action = ctx.match[1];
    const value = ctx.match[2] === '_' ? 'general' : ctx.match[2];
    const { formatted, keyboard } = buildHelpTopicCard(
      ctx.locale,
      value,
      action === 'open',
    );
    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  },
);

onCommand(generalComposer, ['ping', 'p'], async (ctx) => {
  const started = Date.now();
  const initial = buildPingCard(ctx.locale);
  const msg = await ctx.reply(initial.formatted.text, {
    entities: initial.formatted.entities,
  });
  const elapsed = Date.now() - started;
  const updated = buildPingCard(ctx.locale, elapsed);
  if (ctx.chat) {
    await ctx.api
      .editMessageText(ctx.chat.id, msg.message_id, updated.formatted.text, {
        entities: updated.formatted.entities,
        reply_markup: updated.keyboard,
      })
      .catch(() => {});
  }
});

onCommand(generalComposer, ['speedtest', 'st'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const apiStart = Date.now();
  await ctx.api.getMe().catch(() => null);
  const apiMs = Date.now() - apiStart;

  let dbMs: number | null = null;
  if (ctx.supabase) {
    const dbStart = Date.now();
    await ctx.supabase.from('role_definitions').select('role_key').limit(1);
    dbMs = Date.now() - dbStart;
  }

  let kvMs: number | null = null;
  if (ctx.appEnv.BOT_CACHE) {
    const kvStart = Date.now();
    await ctx.appEnv.BOT_CACHE.get('__speedtest_probe__').catch(() => null);
    kvMs = Date.now() - kvStart;
  }

  const formatted = fmt`${b}⚡ ${isId ? 'Hasil Speedtest Edge' : 'Edge Speedtest Results'}${b}
• ${b}Telegram API:${b} ${code}${String(apiMs)}ms${code}
• ${b}Supabase DB:${b} ${code}${dbMs !== null ? `${dbMs}ms` : 'N/A'}${code}
• ${b}Workers KV:${b} ${code}${kvMs !== null ? `${kvMs}ms` : 'N/A'}${code}`;

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: new InlineKeyboard().text(
      isId ? '✖ Tutup' : '✖ Close',
      'nav:close',
    ),
  });
});

onCommand(generalComposer, ['language', 'lang', 'langs'], async (ctx) => {
  const { formatted, keyboard } = buildLanguageCard(ctx.locale);
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

function buildPrivacyContent(locale: string, section = 'collect') {
  const isId = locale === 'id-ID';
  const sections: Record<
    string,
    { titleId: string; titleEn: string; bodyId: string; bodyEn: string }
  > = {
    collect: {
      titleId: '1. Data yang Dikumpulkan',
      titleEn: '1. Data Collected',
      bodyId:
        'ID Telegram, username, nama tampilan, bahasa pilihan, riwayat sanksi/peringatan, persetujuan aturan, dan banding yang Anda kirimkan.',
      bodyEn:
        'Telegram user ID, username, display name, language preference, moderation/warning history, rule acknowledgements, and submitted appeals.',
    },
    why: {
      titleId: '2. Tujuan Penggunaan',
      titleEn: '2. Purpose of Processing',
      bodyId:
        'Menegakkan tata tertib lintas grup terhubung, memproses banding, serta menjaga jejak audit moderasi.',
      bodyEn:
        'Enforcing rules across connected groups, processing appeals, and maintaining a moderation audit trail.',
    },
    access: {
      titleId: '3. Akses Data',
      titleEn: '3. Data Access',
      bodyId:
        'Hanya staf federasi terotorisasi (moderator, developer, admin, owner) yang dapat melihat catatan moderasi melalui bot atau konsol.',
      bodyEn:
        'Only authorized federation staff (moderators, developers, admins, owner) can inspect moderation records via the bot or console.',
    },
    retention: {
      titleId: '4. Retensi Data',
      titleEn: '4. Data Retention',
      bodyId:
        'Data profil aktif disimpan selama akun berinteraksi dengan federasi. Catatan audit dipertahankan demi integritas keamanan.',
      bodyEn:
        'Active profile data is retained while interacting with the federation. Audit records are preserved for security integrity.',
    },
    rights: {
      titleId: '5. Hak Pengguna (/tcforget)',
      titleEn: '5. Your Rights (/tcforget)',
      bodyId:
        'Anda dapat menggunakan perintah /tcforget untuk menganonimkan nama, username, dan preferensi bahasa Anda kapan saja.',
      bodyEn:
        'You can run /tcforget at any time to anonymize your display name, username, and language preferences.',
    },
    contact: {
      titleId: '6. Kontak & Banding',
      titleEn: '6. Contact & Appeals',
      bodyId:
        'Untuk pertanyaan atau banding sanksi, gunakan /appeal melalui pesan pribadi ke bot.',
      bodyEn:
        'For inquiries or sanction appeals, use /appeal via direct message to the bot.',
    },
  };

  const s = sections[section] ?? sections.collect;
  const formatted = fmt`${b}${isId ? '🔒 Kebijakan Privasi Bot' : '🔒 Bot Privacy Policy'}${b}
${b}${isId ? s.titleId : s.titleEn}${b}

${isId ? s.bodyId : s.bodyEn}`;

  const keyboard = new InlineKeyboard().text(
    isId ? '1. Data' : '1. Data',
    'privacy:sec:collect',
  );
  if (section === 'collect') keyboard.success();
  else keyboard.primary();
  keyboard.text(isId ? '2. Tujuan' : '2. Purpose', 'privacy:sec:why');
  if (section === 'why') keyboard.success();
  else keyboard.primary();
  keyboard.text(isId ? '3. Akses' : '3. Access', 'privacy:sec:access');
  if (section === 'access') keyboard.success();
  else keyboard.primary();
  keyboard
    .row()
    .text(isId ? '4. Retensi' : '4. Retention', 'privacy:sec:retention');
  if (section === 'retention') keyboard.success();
  else keyboard.primary();
  keyboard.text(isId ? '5. Hak' : '5. Rights', 'privacy:sec:rights');
  if (section === 'rights') keyboard.success();
  else keyboard.primary();
  keyboard.text(isId ? '6. Kontak' : '6. Contact', 'privacy:sec:contact');
  if (section === 'contact') keyboard.success();
  else keyboard.primary();
  keyboard
    .row()
    .text(isId ? '🏠 Menu Utama' : '🏠 Main Menu', 'nav:start')
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  return { formatted, keyboard };
}

function buildAboutContent(
  locale: string,
  communityName: string,
  section = 'overview',
) {
  const isId = locale === 'id-ID';
  const bodies: Record<string, { id: string; en: string }> = {
    overview: {
      id: `${communityName} adalah bot moderasi federasi berbasis Cloudflare Workers, Hono, grammY, dan Supabase.`,
      en: `${communityName} is a federation moderation bot built on Cloudflare Workers, Hono, grammY, and Supabase.`,
    },
    federation: {
      id: 'Setiap grup yang terhubung melalui /tcconnect berbagi status ban, mute, dan aturan komunitas secara sinkron.',
      en: 'Groups connected via /tcconnect share synchronized federation bans, mutes, and community rules.',
    },
    appeals: {
      id: 'Pengguna yang terkena ban dapat mengajukan banding lewat /appeal di DM; staf meninjau secara transparan dengan sistem kunci 12 jam.',
      en: 'Banned users can submit appeals via /appeal in DM; staff review transparently with a 12-hour claim lock.',
    },
  };
  const entry = bodies[section] ?? bodies.overview;

  const formatted = fmt`${b}${isId ? `ℹ️ Tentang ${communityName}` : `ℹ️ About ${communityName}`}${b}

${isId ? entry.id : entry.en}`;

  const keyboard = new InlineKeyboard().text(
    isId ? 'Ringkasan' : 'Overview',
    'about:sec:overview',
  );
  if (section === 'overview') keyboard.success();
  else keyboard.primary();
  keyboard.text(isId ? 'Federasi' : 'Federation', 'about:sec:federation');
  if (section === 'federation') keyboard.success();
  else keyboard.primary();
  keyboard.text(isId ? 'Banding' : 'Appeals', 'about:sec:appeals');
  if (section === 'appeals') keyboard.success();
  else keyboard.primary();
  keyboard
    .row()
    .text(isId ? '📜 Aturan' : '📜 Rules', 'nav:rules')
    .primary()
    .text(isId ? '🔒 Privasi' : '🔒 Privacy', 'nav:privacy')
    .primary()
    .row()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();
  return { formatted, keyboard };
}

onCommand(generalComposer, 'privacy', async (ctx) => {
  const { formatted, keyboard } = buildPrivacyContent(ctx.locale, 'collect');
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(generalComposer, 'about', async (ctx) => {
  const { formatted, keyboard } = buildAboutContent(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
    'overview',
  );
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(generalComposer, 'additional', async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const formatted = fmt`${b}🧩 ${isId ? 'Menu Tambahan' : 'Additional Resources'}${b}
${isId ? 'Akses cepat ke kebijakan privasi, statistik, dan informasi federasi.' : 'Quick access to privacy policy, statistics, and federation info.'}`;
  const kb = new InlineKeyboard()
    .text(isId ? 'ℹ️ Tentang' : 'ℹ️ About', 'nav:about')
    .primary()
    .text(isId ? '🔒 Privasi' : '🔒 Privacy', 'nav:privacy')
    .primary()
    .row()
    .text(isId ? '📜 Aturan' : '📜 Rules', 'nav:rules')
    .primary()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: kb,
  });
});

onCommand(generalComposer, 'formattest', async (ctx) => {
  const { formatted, keyboard } = buildFormatShowcaseCard({
    locale: ctx.locale,
    userId: ctx.from?.id ?? 0,
    userName: ctx.from?.first_name ?? 'User',
    dropdownOpen: false,
    selectedPreset: 'entities',
  });
  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery(
  /^dd:fmt:(open|close|pick):(entities|buttons|dropdown|_)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const action = ctx.match[1];
    const preset = ctx.match[2] === '_' ? 'entities' : ctx.match[2];
    const { formatted, keyboard } = buildFormatShowcaseCard({
      locale: ctx.locale,
      userId: ctx.from.id,
      userName: ctx.from.first_name,
      dropdownOpen: action === 'open',
      selectedPreset: preset,
    });
    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  },
);

generalComposer.callbackQuery(
  /^fmt:demo:(success|primary|danger)$/,
  async (ctx) => {
    const kind = ctx.match[1];
    await ctx.answerCallbackQuery({
      text:
        ctx.locale === 'id-ID'
          ? `Tombol ${kind} diklik!`
          : `${kind} button clicked!`,
    });
  },
);

generalComposer.callbackQuery('nav:privacy', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildPrivacyContent(ctx.locale, 'collect');
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery(
  /^privacy:sec:(collect|why|access|retention|rights|contact)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const { formatted, keyboard } = buildPrivacyContent(
      ctx.locale,
      ctx.match[1],
    );
    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  },
);

generalComposer.callbackQuery('nav:about', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildAboutContent(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
    'overview',
  );
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery(
  /^about:sec:(overview|federation|appeals)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const { formatted, keyboard } = buildAboutContent(
      ctx.locale,
      ctx.appEnv.COMMUNITY_NAME || 'tcbot',
      ctx.match[1],
    );
    await ctx
      .editMessageText(formatted.text, {
        entities: formatted.entities,
        reply_markup: keyboard,
      })
      .catch(() => {});
  },
);

generalComposer.callbackQuery('nav:start', async (ctx) => {
  await ctx.answerCallbackQuery();
  const role = await getUserRole(
    ctx.supabase,
    ctx.from.id,
    ctx.appEnv.OWNER_ID,
  );
  const { formatted, keyboard } = buildStartCard(
    ctx.locale,
    ctx.appEnv.COMMUNITY_NAME || 'tcbot',
    ctx.from.first_name,
    isAdminOrOwner(role),
  );
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:help', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildHelpCard(ctx.locale);
  keyboard
    .row()
    .text(
      ctx.locale === 'id-ID' ? '▾ Pilih Topik Lengkap' : '▾ Select Topic',
      'dd:help:open:general',
    )
    .primary();
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:ping', async (ctx) => {
  const started = Date.now();
  await ctx.answerCallbackQuery();
  const elapsed = Math.max(1, Date.now() - started);
  const { formatted, keyboard } = buildPingCard(ctx.locale, elapsed);
  await ctx
    .editMessageText(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    })
    .catch(() => {});
});

generalComposer.callbackQuery('nav:lang', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { formatted, keyboard } = buildLanguageCard(ctx.locale);
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

generalComposer.callbackQuery('nav:close', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.deleteMessage().catch(() => {});
});

generalComposer.callbackQuery(/^lang:set:(en-US|id-ID)$/, async (ctx) => {
  const nextLocale = ctx.match[1] as 'en-US' | 'id-ID';
  await ctx.answerCallbackQuery({
    text: t(nextLocale, 'lang.updated', { locale: nextLocale }),
  });

  if (ctx.supabase && ctx.from) {
    setCachedUserLocale(ctx.from.id, nextLocale);
    if (ctx.appEnv.BOT_CACHE) {
      void ctx.appEnv.BOT_CACHE.put(`locale:${ctx.from.id}`, nextLocale, {
        expirationTtl: 3600,
      }).catch(() => {});
    }
    await ctx.supabase.from('user_settings').upsert(
      {
        user_id: ctx.from.id,
        locale: nextLocale,
      },
      { onConflict: 'user_id' },
    );
  }

  const { formatted, keyboard } = buildLanguageCard(nextLocale);
  await ctx.editMessageText(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});
