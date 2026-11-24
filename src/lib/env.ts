export type AppEnv = {
  Bindings: CloudflareBindings;
};

export function hasSupabaseConfig(
  env: Pick<CloudflareBindings, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
): boolean {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SECRET_KEY?.trim());
}
