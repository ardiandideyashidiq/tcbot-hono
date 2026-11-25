const DEFAULT_TTL_SECONDS = 900;
const MEMORY_SESSION_MAX = 2048;

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const memorySessions = new Map<string, MemoryEntry>();

function sessionKey(scope: string, userId: number): string {
  return `session:${scope}:${userId}`;
}

export async function getBotSession<T>(
  env: Pick<CloudflareBindings, 'BOT_CACHE'>,
  scope: string,
  userId: number,
): Promise<T | null> {
  const key = sessionKey(scope, userId);

  if (env.BOT_CACHE) {
    const raw = await env.BOT_CACHE.get(key).catch(() => null);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const mem = memorySessions.get(key);
  if (!mem) return null;
  if (mem.expiresAt <= Date.now()) {
    memorySessions.delete(key);
    return null;
  }
  try {
    return JSON.parse(mem.value) as T;
  } catch {
    return null;
  }
}

export async function setBotSession<T>(
  env: Pick<CloudflareBindings, 'BOT_CACHE'>,
  scope: string,
  userId: number,
  value: T,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const key = sessionKey(scope, userId);
  const serialized = JSON.stringify(value);

  if (env.BOT_CACHE) {
    await env.BOT_CACHE.put(key, serialized, {
      expirationTtl: Math.max(60, ttlSeconds),
    }).catch(() => {});
    return;
  }

  if (memorySessions.size >= MEMORY_SESSION_MAX) {
    const oldest = memorySessions.keys().next().value;
    if (oldest !== undefined) memorySessions.delete(oldest);
  }
  memorySessions.set(key, {
    value: serialized,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function clearBotSession(
  env: Pick<CloudflareBindings, 'BOT_CACHE'>,
  scope: string,
  userId: number,
): Promise<void> {
  const key = sessionKey(scope, userId);
  if (env.BOT_CACHE) {
    await env.BOT_CACHE.delete(key).catch(() => {});
    return;
  }
  memorySessions.delete(key);
}
