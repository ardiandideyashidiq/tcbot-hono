const SESSION_COOKIE_NAME = 'tcbot_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

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

export function getSessionSecret(
  env: Partial<
    Pick<CloudflareBindings, 'ADMIN_SESSION_SECRET' | 'TELEGRAM_WEBHOOK_SECRET'>
  >,
): string {
  return (
    env.ADMIN_SESSION_SECRET?.trim() ||
    env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    'tcbot-dev-session-secret'
  );
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
  sub: string;
  iat: number;
  exp: number;
}

export async function signAdminSession(
  username: string,
  secret: string,
  ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: username,
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
): Promise<{ username: string } | null> {
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
    return { username: parsed.sub };
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

export async function verifyAdminRequest(
  cookieHeader: string | undefined,
  env: Partial<
    Pick<CloudflareBindings, 'ADMIN_SESSION_SECRET' | 'TELEGRAM_WEBHOOK_SECRET'>
  >,
): Promise<{ username: string } | null> {
  const token = extractSessionCookie(cookieHeader);
  if (!token) return null;
  return verifyAdminSessionToken(token, getSessionSecret(env));
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
