import { describe, expect, it } from 'bun:test';
import type { Update } from 'grammy/types';
import { createBot } from '../src/bot';

const testEnv = {
  COMMUNITY_NAME: 'Bot',
  PREFIXES: '/,!,.',
  DB_SCHEMA: 'public',
  ALBUM_DEBOUNCE_SECONDS: '4',
  PROMOTION_REQUEST_TTL_DAYS: '7',
  WARN_LIMIT: '3',
  FED_WARN_LIMIT: '0',
  WARN_EXPIRY_DAYS: '0',
  LOG_LEVEL: 'INFO',
  TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN',
  TELEGRAM_WEBHOOK_SECRET: 'test_secret',
  SUPABASE_URL: '',
  SUPABASE_SECRET_KEY: '',
  SUPABASE_PUBLISHABLE_KEY: '',
  SUPABASE_JWKS_URL: '',
  OWNER_ID: '1001',
  PROOFS: '',
  MAIN_GROUP: '',
  MAIN_CHANNEL: '',
  LOGS: '',
  LOGS_ERRORS: '',
  APPEALS: '',
  INFRA_CHAT_IDS: '',
  SENTRY_DSN: '',
} as unknown as CloudflareBindings;

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

const FIXED_TIMESTAMP = 1_700_000_000;

function createHarness() {
  const bot = createBot(testEnv);
  const calls: ApiCall[] = [];

  bot.botInfo = {
    id: 999999,
    is_bot: true,
    first_name: 'tcbot',
    username: 'tcbot_test_bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    supports_guest_queries: false,
    needs_inline_query_location: false,
    has_topic_sidebar: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
  };

  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({
      method,
      payload: payload as unknown as Record<string, unknown>,
    });

    if (method === 'sendMessage' || method === 'editMessageText') {
      return {
        ok: true,
        result: {
          message_id: 42,
          date: FIXED_TIMESTAMP,
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: String((payload as Record<string, unknown>).text ?? ''),
        },
      } as never;
    }

    return { ok: true, result: true } as never;
  });

  return { bot, calls };
}

let nextUpdateId = 100;

function makeMessageUpdate(
  text: string,
  opts?: {
    userId?: number;
    chatId?: number;
    chatType?: 'private' | 'supergroup';
    languageCode?: string;
    replyToUserId?: number;
  },
): Update {
  const userId = opts?.userId ?? 1001;
  const chatId = opts?.chatId ?? userId;
  const chatType = opts?.chatType ?? 'private';
  nextUpdateId += 1;

  return {
    update_id: nextUpdateId,
    message: {
      message_id: 10,
      date: FIXED_TIMESTAMP,
      chat:
        chatType === 'private'
          ? { id: chatId, type: 'private', first_name: 'User' }
          : { id: chatId, type: 'supergroup', title: 'Test Supergroup' },
      from: {
        id: userId,
        is_bot: false,
        first_name: 'User',
        language_code: opts?.languageCode ?? 'id',
      },
      text,
      entities: [
        {
          offset: 0,
          length: text.split(' ')[0]?.length ?? text.length,
          type: 'bot_command',
        },
      ],
      ...(opts?.replyToUserId
        ? {
            reply_to_message: {
              message_id: 9,
              date: FIXED_TIMESTAMP,
              chat:
                chatType === 'private'
                  ? { id: chatId, type: 'private', first_name: 'Target' }
                  : {
                      id: chatId,
                      type: 'supergroup',
                      title: 'Test Supergroup',
                    },
              from: {
                id: opts.replyToUserId,
                is_bot: false,
                first_name: 'Target',
                username: 'target_user',
              },
              text: 'offending message',
              reply_to_message: undefined,
            },
          }
        : {}),
    },
  };
}

describe('Telegram Bot MVP end-to-end command handlers', () => {
  it('/start and /help reply in resolved user locale with entities and inline buttons', async () => {
    const { bot, calls } = createHarness();
    await bot.handleUpdate(makeMessageUpdate('/start', { languageCode: 'id' }));
    await bot.handleUpdate(makeMessageUpdate('/help', { languageCode: 'en' }));

    expect(calls[0]?.method).toBe('sendMessage');
    expect(String(calls[0]?.payload.text)).toContain('Cloudflare Workers');
    expect(calls[0]?.payload.entities).toBeDefined();
    expect(calls[0]?.payload.reply_markup).toBeDefined();

    expect(calls[1]?.method).toBe('sendMessage');
    expect(String(calls[1]?.payload.text)).toContain('Available commands:');
    expect(calls[1]?.payload.entities).toBeDefined();
    expect(calls[1]?.payload.reply_markup).toBeDefined();
  });

  it('/ping replies and edits with latency and inline keyboard', async () => {
    const { bot, calls } = createHarness();
    await bot.handleUpdate(makeMessageUpdate('/ping'));

    expect(calls[0]?.method).toBe('sendMessage');
    expect(String(calls[0]?.payload.text)).toContain('🏓 Pong');
    expect(calls[1]?.method).toBe('editMessageText');
    expect(String(calls[1]?.payload.text)).toMatch(/Latensi|Latency/);
    expect(calls[1]?.payload.reply_markup).toBeDefined();
  });

  it('/language sends inline keyboard and callback updates locale', async () => {
    const { bot, calls } = createHarness();
    await bot.handleUpdate(makeMessageUpdate('/language'));

    expect(calls[0]?.method).toBe('sendMessage');
    expect(calls[0]?.payload.reply_markup).toBeDefined();

    await bot.handleUpdate({
      update_id: 999,
      callback_query: {
        id: 'cb_1',
        from: { id: 1001, is_bot: false, first_name: 'Owner' },
        chat_instance: 'ci_1',
        data: 'lang:set:en-US',
        message: {
          message_id: 42,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: 'Select language',
        },
      },
    });

    const cbAck = calls.find((c) => c.method === 'answerCallbackQuery');
    const cbEdit = calls.find((c) => c.method === 'editMessageText');
    expect(cbAck).toBeDefined();
    expect(String(cbEdit?.payload.text)).toContain('en-US');
    expect(cbEdit?.payload.entities).toBeDefined();
  });

  it('/tcconnect rejects non-staff and private chats, allows owner in supergroup', async () => {
    const { bot, calls } = createHarness();

    await bot.handleUpdate(
      makeMessageUpdate('/tcconnect', {
        userId: 1001,
        chatId: 1001,
        chatType: 'private',
      }),
    );
    expect(String(calls[0]?.payload.text)).toContain('di dalam grup');

    await bot.handleUpdate(
      makeMessageUpdate('/tcconnect', {
        userId: 2002,
        chatId: -10012345,
        chatType: 'supergroup',
      }),
    );
    expect(String(calls[1]?.payload.text)).toContain('admin atau owner');

    await bot.handleUpdate(
      makeMessageUpdate('/tcconnect', {
        userId: 1001,
        chatId: -10012345,
        chatType: 'supergroup',
      }),
    );
    const sent = calls.filter((c) => c.method === 'sendMessage');
    expect(String(sent[2]?.payload.text)).toContain('Test Supergroup');
  });

  it('/tcban, /tcmute, /tcwarn reject non-staff and self-targeting', async () => {
    const { bot, calls } = createHarness();

    await bot.handleUpdate(
      makeMessageUpdate('/tcban 555', {
        userId: 2002,
        chatId: -10012345,
        chatType: 'supergroup',
      }),
    );
    expect(String(calls[0]?.payload.text)).toContain('staf federasi');

    await bot.handleUpdate(
      makeMessageUpdate('/tcban 1001', {
        userId: 1001,
        chatId: -10012345,
        chatType: 'supergroup',
      }),
    );
    expect(String(calls[1]?.payload.text)).toContain('diri sendiri');

    await bot.handleUpdate(
      makeMessageUpdate('/tcwarn', {
        userId: 1001,
        chatId: -10012345,
        chatType: 'supergroup',
        replyToUserId: 555111,
      }),
    );
    expect(String(calls[2]?.payload.text)).toContain('@target_user (1/3)');
    expect(calls[2]?.payload.entities).toBeDefined();
    expect(calls[2]?.payload.reply_markup).toBeDefined();
  });

  it('navigation and moderation inline callbacks edit messages and answer queries', async () => {
    const { bot, calls } = createHarness();
    await bot.handleUpdate({
      update_id: 1001,
      callback_query: {
        id: 'cb_nav_help',
        from: { id: 1001, is_bot: false, first_name: 'Owner' },
        chat_instance: 'ci_nav',
        data: 'nav:help',
        message: {
          message_id: 42,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: 'Start',
        },
      },
    });

    expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    const editHelp = calls.find((c) => c.method === 'editMessageText');
    expect(String(editHelp?.payload.text)).toContain('Daftar Perintah');

    await bot.handleUpdate({
      update_id: 1002,
      callback_query: {
        id: 'cb_mod_check',
        from: { id: 1001, is_bot: false, first_name: 'Owner' },
        chat_instance: 'ci_mod',
        data: 'mod:check:555111',
        message: {
          message_id: 43,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: 'Warn',
        },
      },
    });

    const editCheck = calls.filter((c) => c.method === 'editMessageText')[1];
    expect(String(editCheck?.payload.text)).toContain('555111');
  });

  it('/tckick, /admins, /tcpromote, /rules, and /appeal respond cleanly with guards', async () => {
    const { bot, calls } = createHarness();
    const sentMessages = () => calls.filter((c) => c.method === 'sendMessage');

    await bot.handleUpdate(
      makeMessageUpdate('/tckick', {
        userId: 1001,
        chatId: -10012345,
        chatType: 'supergroup',
        replyToUserId: 555111,
      }),
    );
    expect(String(sentMessages()[0]?.payload.text)).toContain('555111');

    await bot.handleUpdate(makeMessageUpdate('/admins'));
    expect(String(sentMessages()[1]?.payload.text)).toContain('1001');

    await bot.handleUpdate(
      makeMessageUpdate('/tcpromote 555111 moderator', {
        userId: 2002,
        chatId: -10012345,
        chatType: 'supergroup',
      }),
    );
    expect(String(sentMessages()[2]?.payload.text)).toContain(
      'admin atau owner',
    );

    await bot.handleUpdate(makeMessageUpdate('/rules'));
    expect(String(sentMessages()[3]?.payload.text)).toContain(
      'Aturan Komunitas',
    );

    await bot.handleUpdate(makeMessageUpdate('/appeal'));
    expect(String(sentMessages()[4]?.payload.text)).toContain(
      'Cara Mengajukan Banding',
    );

    await bot.handleUpdate(makeMessageUpdate('/privacy'));
    expect(String(sentMessages()[5]?.payload.text)).toContain('Privasi');

    await bot.handleUpdate(makeMessageUpdate('/about'));
    expect(String(sentMessages()[6]?.payload.text)).toContain('Tentang');

    await bot.handleUpdate(
      makeMessageUpdate('/broadcast Halo semua', {
        userId: 2002,
        chatId: -10012345,
        chatType: 'supergroup',
      }),
    );
    expect(String(sentMessages()[7]?.payload.text)).toContain(
      'admin atau owner',
    );
  });

  it('styles every inline button and supports rich formatting + clickable dropdowns', async () => {
    const { bot, calls } = createHarness();
    const getButtons = (call?: { payload: Record<string, unknown> }) => {
      const markup = call?.payload.reply_markup as
        | {
            inline_keyboard?: Array<
              Array<{ text: string; callback_data?: string; style?: string }>
            >;
          }
        | undefined;
      return (markup?.inline_keyboard ?? []).flat();
    };

    await bot.handleUpdate(makeMessageUpdate('/start'));
    const startSend = calls.find((c) => c.method === 'sendMessage');
    const startButtons = getButtons(startSend);
    expect(startButtons.length).toBeGreaterThan(0);
    for (const btn of startButtons) {
      expect(['primary', 'success', 'danger']).toContain(btn.style ?? '');
    }

    await bot.handleUpdate(makeMessageUpdate('/formattest'));
    const fmtSend = calls.filter((c) => c.method === 'sendMessage').at(-1);
    const entities = (fmtSend?.payload.entities ?? []) as Array<{
      type: string;
    }>;
    const entityTypes = new Set(entities.map((e) => e.type));
    for (const expectedType of [
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'code',
      'spoiler',
      'text_link',
      'blockquote',
      'expandable_blockquote',
      'pre',
    ]) {
      expect(entityTypes.has(expectedType)).toBe(true);
    }

    const fmtTrigger = getButtons(fmtSend).find(
      (b) => b.callback_data === 'dd:fmt:open:entities',
    );
    expect(fmtTrigger).toBeDefined();
    expect(fmtTrigger?.style).toBe('primary');

    // Open dropdown
    await bot.handleUpdate({
      update_id: 2001,
      callback_query: {
        id: 'cb_dd_open',
        from: { id: 1001, is_bot: false, first_name: 'Owner' },
        chat_instance: 'ci_dd',
        data: 'dd:fmt:open:entities',
        message: {
          message_id: 90,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: 'Format',
        },
      },
    });
    const openedEdit = calls
      .filter((c) => c.method === 'editMessageText')
      .at(-1);
    const openedButtons = getButtons(openedEdit);
    expect(
      openedButtons.some(
        (b) =>
          b.callback_data === 'dd:fmt:close:entities' && b.style === 'danger',
      ),
    ).toBe(true);
    expect(
      openedButtons.some(
        (b) =>
          b.callback_data === 'dd:fmt:pick:entities' &&
          b.text.startsWith('✓') &&
          b.style === 'success',
      ),
    ).toBe(true);
    expect(
      openedButtons.some(
        (b) =>
          b.callback_data === 'dd:fmt:pick:buttons' && b.style === 'primary',
      ),
    ).toBe(true);

    // Pick another option -> collapses dropdown with new selection
    await bot.handleUpdate({
      update_id: 2002,
      callback_query: {
        id: 'cb_dd_pick',
        from: { id: 1001, is_bot: false, first_name: 'Owner' },
        chat_instance: 'ci_dd',
        data: 'dd:fmt:pick:buttons',
        message: {
          message_id: 90,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: 'Format',
        },
      },
    });
    const pickedEdit = calls
      .filter((c) => c.method === 'editMessageText')
      .at(-1);
    const pickedButtons = getButtons(pickedEdit);
    expect(
      pickedButtons.some(
        (b) =>
          b.callback_data === 'dd:fmt:open:buttons' && b.style === 'primary',
      ),
    ).toBe(true);

    // Help topic dropdown
    await bot.handleUpdate({
      update_id: 2003,
      callback_query: {
        id: 'cb_help_dd',
        from: { id: 1001, is_bot: false, first_name: 'Owner' },
        chat_instance: 'ci_dd',
        data: 'dd:help:open:general',
        message: {
          message_id: 91,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: 'Help',
        },
      },
    });
    const helpOpened = calls
      .filter((c) => c.method === 'editMessageText')
      .at(-1);
    const helpButtons = getButtons(helpOpened);
    expect(
      helpButtons.some((b) => b.callback_data === 'dd:help:pick:mod'),
    ).toBe(true);
  });
});
