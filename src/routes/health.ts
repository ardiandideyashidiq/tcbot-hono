import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, hasSupabaseConfig } from '../lib/env';
import { createSupabaseAdmin } from '../lib/supabase';

const healthQuerySchema = z.object({
  strict: z.enum(['true', 'false']).optional(),
});

const healthApp = new Hono<AppEnv>().get(
  '/',
  zValidator('query', healthQuerySchema),
  async (c) => {
    const { strict } = c.req.valid('query');
    let supabaseStatus: 'ok' | 'unconfigured' | 'error' = 'unconfigured';

    if (hasSupabaseConfig(c.env)) {
      try {
        const supabase = createSupabaseAdmin(c.env);
        const { error } = await supabase
          .from('community_settings')
          .select('singleton_key')
          .limit(1);
        supabaseStatus = error ? 'error' : 'ok';
      } catch {
        supabaseStatus = 'error';
      }
    }

    const ok = strict === 'true' ? supabaseStatus === 'ok' : true;
    return c.json(
      {
        ok,
        service: 'tcbot-hono',
        supabase: supabaseStatus,
        timestamp: new Date().toISOString(),
      },
      ok ? 200 : 503,
    );
  },
);

export default healthApp;
