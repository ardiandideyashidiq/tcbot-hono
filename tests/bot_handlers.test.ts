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
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: String((payload as Record<string, unknown>).text ?? ''),
        },
      } as never;
    }

    return { ok: true, result: true } as never;
  });

  return { bot, calls };
}

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

  return {
    update_id: Math.floor(Math.random() * 100000),
    message: {
      message_id: 10,
      date: Math.floor(Date.now() / 1000),
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
              date: Math.floor(Date.now() / 1000),
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
  it('/start and /help reply in resolved user locale', async () => {
    const { bot, calls } = createHarness();
    await bot.handleUpdate(makeMessageUpdate('/start', { languageCode: 'id' }));
    await bot.handleUpdate(makeMessageUpdate('/help', { languageCode: 'en' }));

    expect(calls[0]?.method).toBe('sendMessage');
    expect(String(calls[0]?.payload.text)).toContain('tcbot aktif');

    expect(calls[1]?.method).toBe('sendMessage');
    expect(String(calls[1]?.payload.text)).toContain('Available commands:');
  });

  it('/ping replies and edits with latency', async () => {
    const { bot, calls } = createHarness();
    await bot.handleUpdate(makeMessageUpdate('/ping'));

    expect(calls[0]?.method).toBe('sendMessage');
    expect(calls[0]?.payload.text).toBe('pong');
    expect(calls[1]?.method).toBe('editMessageText');
    expect(String(calls[1]?.payload.text)).toMatch(/^pong \(\d+ms\)$/);
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
    expect(String(cbEdit?.payload.text)).toBe('Language updated to en-US.');
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
    expect(String(calls[2]?.payload.text)).toContain('Test Supergroup');
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
  });
});
