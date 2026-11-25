/**
 * Sync Telegram BotFather/client slash-command suggestions via setMyCommands.
 * Usage:
 *   bun run bot:commands
 */
import { createBot } from '../src/bot';
import { syncBotCommands } from '../src/bot/commands';

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error(
    'TELEGRAM_BOT_TOKEN is not set. Run via: bun --env-file=.dev.vars run scripts/sync-commands.ts',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  TELEGRAM_BOT_TOKEN: token,
} as unknown as CloudflareBindings;

const bot = createBot(env);
const count = await syncBotCommands(bot);
console.log(`Synced ${count} Telegram command scopes via setMyCommands.`);
