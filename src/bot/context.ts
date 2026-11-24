import type { Context } from 'grammy';
import type { TypedSupabaseClient } from '../lib/supabase';
import type { Locale } from './i18n';

export interface BotContext extends Context {
  supabase: TypedSupabaseClient | null;
  appEnv: CloudflareBindings;
  locale: Locale;
}
