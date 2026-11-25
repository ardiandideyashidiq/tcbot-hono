import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

const clientCache = new Map<string, TypedSupabaseClient>();
const MAX_CACHED_CLIENTS = 8;

/**
 * Returns a memoized stateless server-side Supabase client per isolate,
 * keyed by URL and service key so isolates reuse connections and config.
 */
export function createSupabaseAdmin(
  env: Pick<CloudflareBindings, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
): TypedSupabaseClient {
  const key = `${env.SUPABASE_URL}\0${env.SUPABASE_SECRET_KEY}`;
  const cached = clientCache.get(key);
  if (cached) {
    return cached;
  }

  const client = createClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  if (clientCache.size >= MAX_CACHED_CLIENTS) {
    const oldestKey = clientCache.keys().next().value;
    if (oldestKey !== undefined) {
      clientCache.delete(oldestKey);
    }
  }
  clientCache.set(key, client);
  return client;
}
