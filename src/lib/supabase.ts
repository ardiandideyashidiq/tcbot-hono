import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Creates a stateless server-side Supabase client for Cloudflare Workers.
 * Uses `SUPABASE_SECRET_KEY` (service_role) and disables browser session persistence.
 */
export function createSupabaseAdmin(
  env: Pick<CloudflareBindings, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
): TypedSupabaseClient {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
