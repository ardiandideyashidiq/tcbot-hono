import { describe, expect, it } from 'bun:test';
import type { Update } from 'grammy/types';
import { createBot } from '../src/bot';
import { parsePrefixedCommand } from '../src/bot/prefixes';
import {
  clearBotSession,
  getBotSession,
  setBotSession,
} from '../src/bot/session';
import {
  releaseStaleAppeals,
  retryPendingEnforcementTargets,
} from '../src/lib/telegram-sync';

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
          message_id: 99,
          date: FIXED_TIMESTAMP,
          chat: { id: 1001, type: 'private', first_name: 'Owner' },
          text: String((payload as Record<string, unknown>).text ?? ''),
        },
      } as never;
    }

    if (method === 'getMe') {
      return { ok: true, result: bot.botInfo } as never;
    }

    return { ok: true, result: true } as never;
  });

  const sentMessages = () => calls.filter((c) => c.method === 'sendMessage');
  const editedMessages = () =>
    calls.filter((c) => c.method === 'editMessageText');

  return { bot, calls, sentMessages, editedMessages };
}

let updateSeq = 5000;

function makeTextUpdate(
  text: string,
  opts?: {
    userId?: number;
    chatId?: number;
    chatType?: 'private' | 'supergroup';
  },
): Update {
  const userId = opts?.userId ?? 1001;
  const chatId = opts?.chatId ?? userId;
  const chatType = opts?.chatType ?? 'private';

  return {
    update_id: updateSeq++,
    message: {
      message_id: updateSeq++,
      date: FIXED_TIMESTAMP,
      chat:
        chatType === 'private'
          ? { id: chatId, type: 'private', first_name: 'User' }
          : { id: chatId, type: 'supergroup', title: 'Test Group' },
      from: {
        id: userId,
        is_bot: false,
        first_name: 'User',
        language_code: 'id',
      },
      text,
    },
  } as Update;
}

function makeCallbackUpdate(
  data: string,
  opts?: { userId?: number; chatId?: number },
): Update {
  const userId = opts?.userId ?? 1001;
  const chatId = opts?.chatId ?? userId;
  return {
    update_id: updateSeq++,
    callback_query: {
      id: `cb_${updateSeq++}`,
      from: { id: userId, is_bot: false, first_name: 'User' },
      chat_instance: 'ci',
      data,
      message: {
        message_id: 99,
        date: FIXED_TIMESTAMP,
        chat: { id: chatId, type: 'private', first_name: 'User' },
        text: 'msg',
      },
    },
  } as Update;
}

describe('Migrated Python -> Hono features & improved logic', () => {
  it('parsePrefixedCommand supports /, !, . prefixes and @bot mentions', () => {
    expect(parsePrefixedCommand('!tcban 123 spam', '/,!,.')).toEqual({
      prefix: '!',
      command: 'tcban',
      args: '123 spam',
    });
    expect(
      parsePrefixedCommand('.ping@tcbot_test_bot', '/,!,.', 'tcbot_test_bot'),
    ).toEqual({
      prefix: '.',
      command: 'ping',
      args: '',
    });
    expect(
      parsePrefixedCommand('/ping@other_bot', '/,!,.', 'tcbot_test_bot'),
    ).toBeNull();
  });

  it('KV/memory session store sets, gets, and clears scoped sessions', async () => {
    await setBotSession(testEnv, 'stats_search', 1001, { active: true });
    expect(
      await getBotSession<{ active: boolean }>(testEnv, 'stats_search', 1001),
    ).toEqual({ active: true });
    await clearBotSession(testEnv, 'stats_search', 1001);
    expect(
      await getBotSession<{ active: boolean }>(testEnv, 'stats_search', 1001),
    ).toBeNull();
  });

  it('handles custom-prefixed commands (!ping, .speedtest, !additional)', async () => {
    const { bot, sentMessages, editedMessages } = createHarness();

    await bot.handleUpdate(makeTextUpdate('!ping'));
    expect(sentMessages()[0]?.payload.text).toContain('Pong');
    expect(editedMessages()[0]?.payload.text).toContain('Latensi');

    await bot.handleUpdate(makeTextUpdate('.speedtest'));
    expect(sentMessages()[1]?.payload.text).toContain('Speedtest');

    await bot.handleUpdate(makeTextUpdate('!additional'));
    expect(sentMessages()[2]?.payload.text).toContain('Menu Tambahan');
  });

  it('handles help topics, privacy sections, and about sections callbacks', async () => {
    const { bot, editedMessages } = createHarness();

    await bot.handleUpdate(makeCallbackUpdate('help:topic:mod'));
    expect(editedMessages()[0]?.payload.text).toContain('/tcban');

    await bot.handleUpdate(makeCallbackUpdate('privacy:sec:rights'));
    expect(editedMessages()[1]?.payload.text).toContain('/tcforget');

    await bot.handleUpdate(makeCallbackUpdate('about:sec:appeals'));
    expect(editedMessages()[2]?.payload.text).toContain('/appeal');
  });

  it('enforces RBAC on /tcsetrole, /transferowner, /tcdemote confirmation, and /rmtc', async () => {
    const { bot, sentMessages } = createHarness();

    await bot.handleUpdate(
      makeTextUpdate('/tcsetrole 3003 moderator', { userId: 2002 }),
    );
    expect(sentMessages()[0]?.payload.text).toContain('admin atau owner');

    await bot.handleUpdate(
      makeTextUpdate('/transferowner 3003', { userId: 2002 }),
    );
    expect(sentMessages()[1]?.payload.text).toContain('owner');

    await bot.handleUpdate(
      makeTextUpdate('/transferowner 3003', { userId: 1001 }),
    );
    expect(sentMessages()[2]?.payload.text).toContain('Transfer Owner');

    await bot.handleUpdate(makeTextUpdate('/rmtc -100999', { userId: 1001 }));
    expect(sentMessages()[3]?.payload.text).toContain('-100999');
  });

  it('enforces guards on /cleanup, /leaveall, /tcrepair, /tcforget, /tcstats, and /tcrules', async () => {
    const { bot, sentMessages } = createHarness();

    await bot.handleUpdate(makeTextUpdate('/leaveall', { userId: 2002 }));
    expect(sentMessages()[0]?.payload.text).toContain('owner');

    await bot.handleUpdate(makeTextUpdate('/leaveall', { userId: 1001 }));
    expect(sentMessages()[1]?.payload.text).toContain('Leave All');

    await bot.handleUpdate(makeTextUpdate('/tcrepair', { userId: 1001 }));
    expect(sentMessages()[2]?.payload.text).toContain('Enforcement');

    await bot.handleUpdate(makeTextUpdate('/tcforget', { userId: 2002 }));
    expect(sentMessages()[3]?.payload.text).toContain('Penghapusan Data');

    await bot.handleUpdate(makeTextUpdate('/tcstats', { userId: 2002 }));
    expect(sentMessages()[4]?.payload.text).toContain('staf');

    await bot.handleUpdate(makeTextUpdate('/tcrules', { userId: 1001 }));
    expect(sentMessages()[5]?.payload.text).toContain('Rules Editor');
  });

  it('handles #appeal hashtag in groups', async () => {
    const { bot, sentMessages } = createHarness();
    await bot.handleUpdate(
      makeTextUpdate('Tolong cek #appeal saya', {
        userId: 2002,
        chatId: -10012345,
        chatType: 'supergroup',
      }),
    );
    expect(sentMessages()[0]?.payload.text).toContain('/appeal');
  });

  it('background cron helpers safely no-op when Supabase is unconfigured', async () => {
    expect(await retryPendingEnforcementTargets(testEnv)).toEqual({
      retried: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(await releaseStaleAppeals(testEnv)).toEqual({ unlocked: 0 });
  });
});
