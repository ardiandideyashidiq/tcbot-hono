# Hono Best Practices

Reference for **Hono v4** (`hono@^4.13.16`) in `tcbot-hono`.

## 1. Modular Routing & Type Inference (`app.route()`)

Split large applications into sub-routers and **always chain** route methods (`.get()`, `.post()`, `.route()`) directly on the `Hono` instance so TypeScript can infer `AppType` for RPC clients (`hc` from `hono/client`) and `testClient`.

```ts
// src/routes/users.ts
import { Hono } from 'hono'

const usersApp = new Hono<{ Bindings: CloudflareBindings }>()
  .get('/', (c) => c.json({ users: [] }))
  .post('/', (c) => c.json({ created: true }, 201))
  .get('/:id', (c) => c.json({ id: c.req.param('id') }))

export default usersApp
```

```ts
// src/index.tsx
import { Hono } from 'hono'
import usersApp from './routes/users'

const app = new Hono<{ Bindings: CloudflareBindings }>()

const routes = app.route('/api/users', usersApp)

export default app
export type AppType = typeof routes
```

## 2. Separating Handlers with `hono/factory`

If you want to extract handlers into separate controller-style functions without breaking Hono's TypeScript route inference, use `factory.createHandlers()` from `hono/factory`.

## 3. Input Validation (`@hono/zod-validator`)

Validate `json`, `query`, `param`, or `header` payloads with `zValidator` and read typed values via `c.req.valid(...)`:

```ts
import * as z from 'zod'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'

const schema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
})

const app = new Hono().post(
  '/users',
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid payload', issues: result.error.issues }, 400)
    }
  }),
  (c) => {
    const body = c.req.valid('json')
    return c.json(body, 201)
  }
)
```

## 4. Centralized Error Handling (`HTTPException` & `app.onError`)

Throw `HTTPException` from `hono/http-exception` for expected HTTP errors and handle all uncaught errors in `app.onError`:

```ts
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

const app = new Hono()

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // Note: getResponse() is not aware of Context headers already set on c.
    return err.getResponse()
  }
  console.error(err)
  return c.text('Internal Server Error', 500)
})
```

> **Note (future v5):** In Hono v5, `app.onError` changes to `(c) => ...` where the error is read from `c.error`.

## 5. Testing (`app.request()` & `testClient()`)

Run fast unit/integration tests without starting an HTTP server:

- **`app.request()`** for standard `Request` / path testing:
  ```ts
  const res = await app.request('/api/health')
  expect(res.status).toBe(200)
  ```
- **`testClient(app)`** from `hono/testing` for type-safe route calls (requires chained route definitions):
  ```ts
  import { testClient } from 'hono/testing'

  const client = testClient(app)
  const res = await client.api.users.$get()
  ```
