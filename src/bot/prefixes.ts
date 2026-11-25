import type { Composer } from 'grammy';
import type { BotContext } from './context';

const DEFAULT_PREFIXES = ['/', '!', '.'];

export function parsePrefixes(raw?: string): string[] {
  if (!raw?.trim()) return DEFAULT_PREFIXES;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.length <= 3);
  return parts.length > 0 ? Array.from(new Set(parts)) : DEFAULT_PREFIXES;
}

export interface ParsedCommand {
  prefix: string;
  command: string;
  args: string;
}

/**
 * Parses a command message against configured prefixes (e.g. `/`, `!`, `.`).
 * Supports `@botusername` suffixes and preserves multiline arguments.
 */
export function parsePrefixedCommand(
  text: string | undefined,
  prefixesRaw?: string,
  botUsername?: string,
): ParsedCommand | null {
  if (!text) return null;
  const trimmed = text.trimStart();
  if (!trimmed) return null;

  const prefixes = parsePrefixes(prefixesRaw);
  // Match longest prefix first so multi-char prefixes don't get shadowed
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  const matchedPrefix = sorted.find((p) => trimmed.startsWith(p));
  if (!matchedPrefix) return null;

  const afterPrefix = trimmed.slice(matchedPrefix.length);
  const match = afterPrefix.match(
    /^([A-Za-z0-9_]{1,64})(?:@([A-Za-z0-9_]{3,64}))?(?:\s+([\s\S]*))?$/,
  );
  if (!match) return null;

  const command = match[1].toLowerCase();
  const mention = match[2];
  if (
    mention &&
    botUsername &&
    mention.toLowerCase() !== botUsername.toLowerCase()
  ) {
    return null;
  }

  return {
    prefix: matchedPrefix,
    command,
    args: (match[3] ?? '').trim(),
  };
}

/**
 * Registers a command handler supporting all configured PREFIXES (`env.PREFIXES`).
 * Populates `ctx.commandArgs` (and `ctx.match` for compatibility) before invoking handler.
 */
export function onCommand(
  composer: Composer<BotContext>,
  names: string | string[],
  handler: (ctx: BotContext) => Promise<void> | void,
): void {
  const nameSet = new Set(
    (Array.isArray(names) ? names : [names]).map((n) => n.toLowerCase()),
  );

  composer.on('message:text', async (ctx, next) => {
    const botUsername = ctx.me?.username;
    const parsed = parsePrefixedCommand(
      ctx.message.text,
      ctx.appEnv?.PREFIXES,
      botUsername,
    );
    if (!parsed || !nameSet.has(parsed.command)) {
      await next();
      return;
    }

    ctx.commandArgs = parsed.args;
    (ctx as { match?: string }).match = parsed.args;
    await handler(ctx);
  });
}

/**
 * Helper to extract command argument string from either `commandArgs` or `ctx.match`.
 */
export function getCommandArgs(ctx: BotContext): string {
  if (typeof ctx.commandArgs === 'string') return ctx.commandArgs;
  if (typeof ctx.match === 'string') return ctx.match;
  return '';
}
