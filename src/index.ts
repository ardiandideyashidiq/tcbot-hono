import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './lib/env';
import {
  expireDueModerationActions,
  releaseStaleAppeals,
  retryPendingEnforcementTargets,
} from './lib/telegram-sync';
import adminUsersApp from './routes/admin-users';
import authApp from './routes/auth';
import healthApp from './routes/health';
import ledgerApp from './routes/ledger';
import publicApp from './routes/public';
import webhookApp from './routes/webhook';

const app = new Hono<AppEnv>()
  .use('/api/*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    if (
      c.req.path.startsWith('/api/auth/') ||
      c.req.path.startsWith('/api/ledger/') ||
      c.req.path.startsWith('/api/admin/')
    ) {
      c.header('Cache-Control', 'no-store');
    }
  })
  .use('/webhook/*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
  })
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
  .route('/api/auth', authApp)
  .route('/api/admin/users', adminUsersApp)
  .route('/api/public', publicApp)
  .route('/api/health', healthApp)
  .route('/api/ledger', ledgerApp)
  .route('/webhook', webhookApp);

export type AppType = typeof app;
export { app };

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: CloudflareBindings,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      Promise.allSettled([
        expireDueModerationActions(env),
        retryPendingEnforcementTargets(env),
        releaseStaleAppeals(env),
      ]),
    );
  },
};
