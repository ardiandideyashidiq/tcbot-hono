import { hasSupabaseConfig } from './env';
import { createSupabaseAdmin } from './supabase';

const SESSION_COOKIE_NAME = 'tcbot_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const PBKDF2_ITERATIONS = 100_000;
const ADMIN_VER_CACHE_TTL_MS = 60_000;
const ADMIN_VER_CACHE_MAX = 512;

export type AdminRole = 'superadmin' | 'admin';

export interface AdminSession {
  id: number;
  username: string;
  role: AdminRole;
  ver: number;
}

const adminVersionCache = new Map<
  number,
  { isActive: boolean; ver: number; role: AdminRole; expiresAt: number }
>();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Uint8Array | null {
  try {
    const padded =
      input.replace(/-/g, '+').replace(/_/g, '/') +
      '==='.slice((input.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    return false;
  }
  const iterations = Number(parts[1]);
  const salt = fromBase64Url(parts[2] ?? '');
  const expected = parts[3] ?? '';
  if (
    !Number.isInteger(iterations) ||
    iterations < 10_000 ||
    !salt ||
    !expected
  ) {
    return false;
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  const actual = toBase64Url(new Uint8Array(bits));
  return constantTimeEqual(actual, expected);
}

export function getSessionSecret(
  env: Partial<
    Pick<CloudflareBindings, 'ADMIN_SESSION_SECRET' | 'TELEGRAM_WEBHOOK_SECRET'>
  >,
): string | null {
  const secret =
    env.ADMIN_SESSION_SECRET?.trim() || env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

interface SessionPayload {
  id: number;
  sub: string;
  role: AdminRole;
  ver: number;
  iat: number;
  exp: number;
}

export async function signAdminSession(
  identity: AdminSession | string,
  secret: string,
  ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
  const resolved: AdminSession =
    typeof identity === 'string'
      ? { id: 0, username: identity, role: 'superadmin', ver: 1 }
      : identity;
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    id: resolved.id,
    sub: resolved.username,
    role: resolved.role,
    ver: resolved.ver,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const key = await importHmacKey(secret);
  const sigBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedPayload),
  );
  const encodedSig = toBase64Url(new Uint8Array(sigBuffer));
  return `${encodedPayload}.${encodedSig}`;
}

export async function verifyAdminSessionToken(
  token: string,
  secret: string,
): Promise<AdminSession | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSig] = parts;
  if (!encodedPayload || !encodedSig) return null;

  const sigBytes = fromBase64Url(encodedSig);
  if (!sigBytes) return null;

  const key = await importHmacKey(secret);
  const validSig = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes.buffer as ArrayBuffer,
    new TextEncoder().encode(encodedPayload),
  );
  if (!validSig) return null;

  const payloadBytes = fromBase64Url(encodedPayload);
  if (!payloadBytes) return null;

  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.sub || typeof parsed.exp !== 'number' || parsed.exp <= now) {
      return null;
    }
    const role: AdminRole =
      parsed.role === 'superadmin' || parsed.role === 'admin'
        ? parsed.role
        : 'admin';
    return {
      id: typeof parsed.id === 'number' ? parsed.id : 0,
      username: parsed.sub,
      role,
      ver: typeof parsed.ver === 'number' ? parsed.ver : 1,
    };
  } catch {
    return null;
  }
}

export function extractSessionCookie(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const part of cookies) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const name = part.slice(0, eqIndex).trim();
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(eqIndex + 1).trim());
    }
  }
  return null;
}

export async function invalidateAdminSessionCache(
  adminId: number,
  kv?: KVNamespace,
): Promise<void> {
  adminVersionCache.delete(adminId);
  if (kv) {
    await kv.delete(`admin_ver:${adminId}`).catch(() => {});
  }
}

export async function verifyAdminRequest(
  cookieHeader: string | undefined,
  env: Partial<CloudflareBindings>,
): Promise<AdminSession | null> {
  const secret = getSessionSecret(env);
  if (!secret) return null;
  const token = extractSessionCookie(cookieHeader);
  if (!token) return null;
  const session = await verifyAdminSessionToken(token, secret);
  if (!session) return null;

  if (session.id > 0 && hasSupabaseConfig(env as CloudflareBindings)) {
    const now = Date.now();
    let state = adminVersionCache.get(session.id);
    if (!state || state.expiresAt <= now) {
      if (env.BOT_CACHE) {
        const kvRaw = await env.BOT_CACHE.get(`admin_ver:${session.id}`).catch(
          () => null,
        );
        if (kvRaw) {
          try {
            const parsed = JSON.parse(kvRaw) as {
              isActive: boolean;
              ver: number;
              role: AdminRole;
            };
            state = { ...parsed, expiresAt: now + ADMIN_VER_CACHE_TTL_MS };
          } catch {
            state = undefined;
          }
        }
      }
      if (!state) {
        const supabase = createSupabaseAdmin(env as CloudflareBindings);
        const { data } = await supabase
          .from('admin_accounts')
          .select('is_active, token_version, role')
          .eq('id', session.id)
          .maybeSingle();
        if (!data) return null;
        state = {
          isActive: data.is_active,
          ver: data.token_version,
          role: data.role === 'superadmin' ? 'superadmin' : 'admin',
          expiresAt: now + ADMIN_VER_CACHE_TTL_MS,
        };
        if (env.BOT_CACHE) {
          void env.BOT_CACHE.put(
            `admin_ver:${session.id}`,
            JSON.stringify({
              isActive: state.isActive,
              ver: state.ver,
              role: state.role,
            }),
            { expirationTtl: 60 },
          ).catch(() => {});
        }
      }
      if (adminVersionCache.size >= ADMIN_VER_CACHE_MAX) {
        const oldest = adminVersionCache.keys().next().value;
        if (oldest !== undefined) adminVersionCache.delete(oldest);
      }
      adminVersionCache.set(session.id, state);
    }
    if (!state.isActive || state.ver !== session.ver) {
      return null;
    }
    return { ...session, role: state.role };
  }

  return session;
}

/**
 * Blocks cross-site browser CSRF attempts on cookie-authenticated mutations
 * using Origin and Fetch Metadata (`Sec-Fetch-Site`) headers.
 */
export function isTrustedSameOriginMutation(
  requestUrl: string,
  originHeader?: string,
  secFetchSiteHeader?: string,
): boolean {
  if (secFetchSiteHeader === 'cross-site') {
    return false;
  }
  if (originHeader) {
    try {
      return new URL(originHeader).origin === new URL(requestUrl).origin;
    } catch {
      return false;
    }
  }
  return true;
}

export function buildSessionCookie(
  token: string,
  isSecure: boolean,
  maxAgeSeconds = SESSION_TTL_SECONDS,
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookie(isSecure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}
