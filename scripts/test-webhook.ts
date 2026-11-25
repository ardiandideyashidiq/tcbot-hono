/**
 * Local Telegram webhook smoke test script.
 * Usage:
 *   bun run test:webhook
 *   WEBHOOK_URL=https://tcbot-hono.tcbot.workers.dev bun run test:webhook
 */

const baseUrl = (process.env.WEBHOOK_URL ?? 'http://localhost:5173').replace(
  /\/+$/,
  '',
);
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

if (!secretToken) {
  console.error(
    'TELEGRAM_WEBHOOK_SECRET is not set. Run via: bun --env-file=.dev.vars run scripts/test-webhook.ts',
  );
  process.exit(1);
}

async function run() {
  const infoRes = await fetch(`${baseUrl}/webhook/info`);
  console.log('GET /webhook/info ->', infoRes.status, await infoRes.json());
  if (!infoRes.ok) {
    process.exit(1);
  }

  const badSecretRes = await fetch(`${baseUrl}/webhook/telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': 'invalid-secret',
    },
    body: JSON.stringify({ update_id: 1 }),
  });
  console.log(
    'POST /webhook/telegram (bad secret) ->',
    badSecretRes.status,
    badSecretRes.status === 401 ? 'OK' : 'UNEXPECTED',
  );
  if (badSecretRes.status !== 401) {
    process.exit(1);
  }

  const ownerId = Number(process.env.OWNER_ID ?? '1001') || 1001;
  const sampleUpdate = {
    update_id: Math.floor(Date.now() / 1000),
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: ownerId, type: 'private', first_name: 'Owner' },
      from: {
        id: ownerId,
        is_bot: false,
        first_name: 'Owner',
        language_code: 'id',
      },
      text: '/ping',
      entities: [{ offset: 0, length: 5, type: 'bot_command' }],
    },
  };

  const validRes = await fetch(`${baseUrl}/webhook/telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secretToken,
    },
    body: JSON.stringify(sampleUpdate),
  });

  console.log(
    'POST /webhook/telegram (/ping) ->',
    validRes.status,
    await validRes.text(),
  );
  if (!validRes.ok) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Webhook test failed:', err);
  process.exit(1);
});
