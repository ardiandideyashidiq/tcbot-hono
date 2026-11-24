# Supabase Best Practices

Reference for using **Supabase** (`@supabase/supabase-js` and Postgres RLS) with `tcbot-hono`.

## 1. End-to-End Type Safety (`createClient<Database>`)

Generate `database.types.ts` via the Supabase CLI and pass `Database` as a generic to `createClient`:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabase = createClient<Database>(url, key)
```

### Mutations in `supabase-js` v2
In v2, `.insert()`, `.update()`, and `.upsert()` do **not** return rows unless `.select()` is chained explicitly:

```ts
const { data, error } = await supabase
  .from('messages')
  .insert({ chat_id: 123, text: 'Hello' })
  .select()
```

## 2. Server-Side / Cloudflare Worker Client

For backend routes and Telegram webhooks that never run in a browser:
- Use `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) stored as a **Worker Secret**. Never expose it to the Vite client bundle.
- Disable browser session persistence in stateless Worker environments:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export function createSupabaseAdmin(env: CloudflareBindings) {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
```

### Authenticated User Routes in Hono (`@supabase/server`)
When Hono routes serve authenticated browser users via JWT, Supabase provides `@supabase/server` (`withRequiredClaims()`, `withSupabaseClient()`) with a `toHono(...)` bridge so `c.var.supabase` and `c.var.jwtClaims` are injected into Hono context.

## 3. Row Level Security (RLS) & Performance

For any table accessed from the frontend with a publishable/anon key:

1. **Enable RLS** on the table.
2. **Wrap `auth.uid()` in `(select auth.uid())`** so Postgres evaluates it once per query instead of per row.
3. **Index every column filtered by RLS policies**:
   ```sql
   alter table todos enable row level security;

   create policy "Users can only access their own todos"
   on todos for all
   to authenticated
   using ((select auth.uid()) = user_id);

   create index todos_user_id_idx on todos using btree (user_id);
   ```
4. **Avoid joins inside RLS policies:** Use `IN (SELECT ...)` subqueries instead of joins to prevent cascading RLS checks on joined tables.
5. **Audit with `EXPLAIN ANALYZE`:** Watch `Rows Removed by Filter` to spot missing indexes or slow policies.
