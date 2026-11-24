import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './lib/env';
import healthApp from './routes/health';
import ledgerApp from './routes/ledger';
import webhookApp from './routes/webhook';

const app = new Hono<AppEnv>()
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }

    console.error(err);
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/webhook/')) {
      return c.json({ ok: false, error: 'Internal Server Error' }, 500);
    }
    return c.text('Internal Server Error', 500);
  })
  .notFound((c) => {
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/webhook/')) {
      return c.json({ ok: false, error: 'Not Found' }, 404);
    }
    return c.text('Not Found', 404);
  })
  .route('/api/health', healthApp)
  .route('/api/ledger', ledgerApp)
  .route('/webhook', webhookApp);

export type AppType = typeof app;
export default app;
