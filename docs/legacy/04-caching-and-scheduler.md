# Legacy Caching, Scheduler, Queues, and MTProto Session Architecture

> Source specification derived from `/home/rd/Projects/bot/tcbot-rewrite/tcbot/tcbot/database/cache/`, `redis_client.py`, `users_cache.py`, `scheduler/`, `pg_cron.py`, `queues_db.py`, `notifications_db.py`, `mtproto.py`, and `mtproto_store.py`.

## 1. Two-Level Cache (`tcbot/database/cache/`)

### 1.1 Architecture Overview
The legacy bot uses a two-level cache (`TwoLevelCache[T]` in `cache/twolevel.py`):
- **L1 (In-Process):** `TTLCache` (`cache/memory.py`) wrapping `cachetools.TTLCache(maxsize, ttl)` for sub-microsecond reads and LRU eviction. Uses a sentinel `CACHE_MISS = object()` so `None` is a valid cached value.
- **L2 (Distributed, Optional):** Async Redis (`redis_client.py` + `cache/redis_io.py`) using `redis.asyncio` + `hiredis`.
  - Redis is **never** on the critical path: if `REDIS_URL` is unset or Redis fails, `TwoLevelCache` degrades transparently to L1-only.
  - A failed L2 read is treated as a cache miss; a failed L2 write/delete is logged and updates `_liveness` via `mark_op(ok=...)` (exposed to `/health`).
  - Socket timeouts: `_SOCKET_CONNECT_TIMEOUT_S = 5.0`, `_SOCKET_TIMEOUT_S = 2.0`, `_MAX_CONNECTIONS = 20`, `_HEALTH_CHECK_INTERVAL_S = 30`, `_RECONNECT_BACKOFF_S = 30.0`.

### 1.2 Key Format & Wire Codec (`cache/codec.py`, `cache/twolevel.py`)
- **Key format:** `tcbot:<prefix>:v2:<key>`
- **Tombstone key format:** `tcbot:<prefix>:v2:tombstone:<key>` (TTL `_TOMBSTONE_TTL_S = 10` seconds)
- **Wire codec (`cache/codec.py`):** JSON via `msgspec.json` with tagged `datetime` objects (`{"__tcbot_type__": "datetime", "value": "<iso8601>"}`) so datetimes survive Redis round-trips. Unknown scalars fall back to `str(obj)`.

### 1.3 Cache Singletons & TTLs (`cache/singletons.py`)

| Singleton | Prefix | L1 TTL | L2 TTL | Maxsize | Key | Critical Delete? | Revocation Prefix? |
|---|---|---|---|---|---|---|---|
| `effective_role_cache` | `role` | 60 s | 90 s | 2048 | `user_id` | Yes | Yes |
| `connected_cache` | `conn` | 120 s | 180 s | 512 | `chat_id` | Yes | Yes |
| `active_groups_cache` | `groups` | 30 s | 45 s | 4 | `"__all__"` | Yes | Yes |
| `owner_id_cache` | `owner` | 300 s | 360 s | 4 | `"__owner__"` | Yes | Yes |
| `user_mention_cache` | `umention` | 300 s | 600 s | 4096 | `user_id` | No | No |
| `user_locale_cache` | `ulocale` | 300 s | 600 s | 4096 | `user_id` | Yes (delete only) | No (fill droppable) |
| `group_locale_cache` | `glocale` | 300 s | 600 s | 512 | `chat_id` | Yes (delete only) | No (fill droppable) |
| `community_locale_cache` | `clocale` | 300 s | 600 s | 4 | `"__community__"` | Yes (delete only) | No (fill droppable) |

### 1.4 Stampede Protection, Invalidation Guards, & FIFO Mutation Queue
- **Single-flight per-key lock (`_KeyState`):** `get_or_fetch()` and `refresh()` serialize concurrent misses for the same key on an `asyncio.Lock` so only one DB query runs.
- **Generation & Epoch Counters:**
  - Every `put()`, `put_local()`, `invalidate()`, `clear()`, and `clear_all()` increments the key's `generation` (and `self._revision`).
  - `clear_all()` bumps `self._epoch` before and after scanning/unlinking `tcbot:<prefix>:v2:*` in batches of 100 (`_CLEAR_ALL_TIMEOUT_S = 10.0`).
  - In-flight DB fetches or L2 reads check `state.generation`, `self._epoch`, `_pending_invalidations`, and `_pending_writes` before promoting a value into L1, preventing stale reads from resurrecting revoked roles or disconnected chats.
- **Cross-Process Tombstones:** For `_critical_delete` prefixes (`role`, `conn`, `groups`, `owner`, `ulocale`, `glocale`, `clocale`), `invalidate()` enqueues a 10-second tombstone key in Redis before the delete. Concurrent readers/refreshes in other processes check `_tombstoned()` before publishing to L1/L2, and `_redis_set_guarded()` skips L2 writes if a tombstone exists.
- **FIFO Mutation Queue (`cache/redis_io.py`):**
  - Mutations per `(prefix, event_loop)` are chained via `asyncio.Task`s so a slow `SET` cannot complete after a newer `DEL` or `clear_all`.
  - Queue bounds: `_REDIS_MAX_PENDING = 200` (drops `droppable=True` ops), `_REDIS_HARD_MAX_PENDING = 1000` (non-droppable ops evict oldest unstarted droppable op), `_REDIS_ABSOLUTE_MAX_PENDING = 2000` (backstop).
  - `drain_redis_mutations(timeout=5.0)` awaits pending tasks on shutdown.
- **Batch Reads (`peek_many` & `users_cache.py`):**
  - `peek_many(keys)` checks L1 first, then issues chunked `MGET` (`_MGET_CHUNK_SIZE = 500`).
  - `users_cache.get_mention_data_batch()` / `get_first_names_batch()` use `peek_many` + single `IN` query for misses, caching `[None, None, None]` (`_NOT_FOUND_SENTINEL`) for absent users.
  - Enforcement paths pass `fresh=True` (e.g., `groups_db.is_connected(chat_id, fresh=True)`), which calls `refresh()` to bypass L1/L2.

---

## 2. Scheduler & `pg_cron` (`tcbot/database/scheduler/`, `pg_cron.py`)

### 2.1 Dual-Owner Design
The legacy bot supports two scheduling backends:
1. **APScheduler (`scheduler/__init__.py`):** `AsyncIOScheduler` backed by `SQLAlchemyJobStore` (`apscheduler_jobs` table, `pool_size=2`, UTC timezone) running in a dedicated background task and single-thread executor (`tcbot-scheduler`).
2. **`pg_cron` (`pg_cron.py`):** Optional (`PG_CRON_ENABLED`) in-database execution via `cron.schedule(...)`. When enabled and `pg_cron` extension is present, `pg_cron` owns the pure-DB jobs and APScheduler removes its duplicates (`database_jobs_in_pg_cron=True`) so they never run concurrently.

### 2.2 Registered Jobs Catalog

| Job / Schedule ID | Owner (when `pg_cron` on) | Cadence | Timeout / Misfire Grace | Responsibility |
|---|---|---|---|---|
| `tcbot.expiry_daily` / `moderation.expire` | `pg_cron` (`*/5 * * * *`) or APScheduler (24h) | 5m (`pg_cron`) / 24h (app) | 60–120 s / 86400 s | Calls `expire_due_moderation_actions_and_queue_revokes()` + `expire_due_role_assignments_and_audit()` under `pg_try_advisory_xact_lock('tcbot:expiry')` |
| `role.expire` | `pg_cron` (`*/10 * * * *`) | 10m | 60 s | Expires due `role_assignments` and logs `role.expired` audit event |
| `enforcement.reconcile` | `pg_cron` (`*/5 * * * *`) | 5m | 60 s | Calls `reconcile_stuck_enforcement_targets()` (`15m` stale window, `MAX_ATTEMPTS = 3`) |
| `scheduler.drift` | `pg_cron` (`*/15 * * * *`) | 15m | 60 s | Compares `scheduled_jobs` (`job_owner = 'pg_cron'`) against `cron.job` via `audit_scheduler_drift()` |
| `tcbot.stale_cleanup_daily` | APScheduler | 24h | 120 s / 86400 s | Concurrently deletes `chat_members` older than 90 days (`tcbot:cleanup:members` lock) and runs `_run_erasure_sweep()` |
| `tcbot.retention_daily` / `retention.sweep` | APScheduler | 24h (`17 3 * * *`) | 300 s / 86400 s | Calls `run_scheduled_job('retention.sweep', 'retention.sweep:YYYYMMDD')` |
| `tcbot.promotion_expiry_hourly` | APScheduler | 1h | 3600 s | Calls `queues_db.expire_stale_requests()` |
| `tcbot.erasure_every_10m` / `user.erasure` | APScheduler | 10m (`*/10 * * * *`) | 120 s / 600 s | Processes up to 25 pending `telegram_user_erasures` (`tcbot:cleanup:erasures` lock), then invalidates `user_mention_cache`, `effective_role_cache`, and `user_locale_cache` after commit |
| `tcbot.enforcement_worker` | APScheduler (app-injected) | 5m | 300 s | Drains queued/due `moderation_enforcement_runs` & targets (`MAX_ATTEMPTS = 3`) |
| `tcbot.notification_worker` | APScheduler (app-injected) | 5m | 300 s | Retries failed review-card edits in `moderation_notification_tasks` |

---

## 3. Queues & Outboxes (`queues_db.py`, `notifications_db.py`, `enforcement_db.py`)

### 3.1 Promotion Request Queue (`queues_db.py`)
- Natural key `request_id` (`make_short_id(10)`, unique `uq_promotion_requests_request_id`); partial unique index `uq_promotion_requests_pending_target` enforces at most one pending request per `target_user_id`.
- `enqueue()` expires stale requests first, ensures both user rows exist, and inserts with `expires_at = now + promotion_request_ttl_days` (default role `admin`). Distinguishes `AlreadyPendingError` from `request_id` collision (retries once).
- `all_pending()` caps results at `_PENDING_PAGE_SIZE = 200` (oldest first).
- `resolve()` atomically transitions `pending -> approved|rejected` while `_pending_in_force()` holds.

### 3.2 Review-Card Notification Outbox (`notifications_db.py`)
- Table: `moderation_notification_tasks` (`uq_moderation_notification_action_kind` on `(action_id, kind)`).
- `queue_review_card_edit()` upserts a pending `review_card` task (resetting `attempts=0`, `next_retry_at=NULL`).
- `claim_due_tasks(limit=10, retry_after=...)` uses `FOR UPDATE SKIP LOCKED` to claim due `pending` rows, incrementing `attempts` and reserving `next_retry_at`.
- `complete_task()` uses optimistic concurrency (`expected_attempts` and `expected_message_id`) so a stale worker cannot overwrite a re-queued card edit.

### 3.3 Durable Enforcement Queue (`enforcement_db.py`)
- Three-tier model: `moderation_enforcement_runs` → `moderation_enforcement_targets` → `moderation_enforcement_attempts` (`MAX_ATTEMPTS = 3`).
- `claim_due_runs` uses `FOR UPDATE SKIP LOCKED`; `requeue_stale_and_due_runs` recovers runs stuck in `running` past `stale_seconds` and re-queues runs that have failed targets with `next_retry_at <= now()` (explicitly including `primary_chat_id`).

---

## 4. MTProto Client & Session Store (`mtproto.py`, `mtproto_store.py`)

- **Purpose:** Bot-token Kurigram/Pyrogram MTProto session used for identity lookups beyond Bot API (`resolve_user`, `resolve_username`, `is_bot_user`) and resumable member harvesting (`harvest_group_members_result`, `_HARVEST_BUDGET_S = 25.0`, `_HARVEST_BATCH = 50`).
- **Storage (`PostgresStorage` in `mtproto_store.py`):** Persists Kurigram state in `mtproto_state` under namespace `<ns>`:
  - `<ns>:kv:<name>`: msgpack-encoded scalars (`dc_id`, `api_id`, `server_address`, `port`, `test_mode`, `auth_key`, `date`, `user_id`, `is_bot`).
  - `<ns>:peer:<peer_id>`: `access_hash`, `type`, `usernames[]`, `phone_number`, `updated_on` (8h `USERNAME_TTL`).
  - `<ns>:ustate:<id>`: `pts`, `qts`, `date`, `seq` merged via `COALESCE`.
  - `<ns>:harvest:<chat_id>`: JSON `{offset, complete}` cursor for resumable member harvesting.
  - `<ns>:lock:mtproto_owner`: Single-owner lease (`_LEASE_TTL_S = 90.0`, `_HEARTBEAT_S = 30.0`) preventing `406 AUTH_KEY_DUPLICATED`.
- **Resilience:** `_retry_write()` retries transient SQLSTATEs (`40001`, `40P01`, `InterfaceError`) up to 3 times (`0.5s * 2^attempt`) and degrades cleanly on `CircuitOpenError` or connectivity failures. Fatal auth errors (`406 AUTH_KEY_DUPLICATED`, `404 AUTH_KEY_NOT_FOUND`, `401 SESSION_REVOKED`) park the client (`_auth_dead = True`) at runtime or clear/re-login once at startup.

---

## 5. Mapping to Cloudflare Workers (`tcbot-hono`)

| Legacy Component | `tcbot-hono` Target Equivalent | Notes & Constraints |
|---|---|---|
| L1 `TTLCache` + L2 Redis (`TwoLevelCache`) | **Cloudflare KV** (or **Workers Cache API** / isolate-local memory + KV) | Workers are stateless across isolates and short-lived; isolate-local `Map` can act as a best-effort L1 within a single request/burst, while **Cloudflare KV** (with `expirationTtl`) serves as the distributed L2. Note KV is eventually consistent (~60 s propagation); for `fresh=True` or strict revocation checks (`role`, `conn`, `owner`), query **Supabase** directly. |
| Redis FIFO Mutation Queue & Tombstones | Direct `KV.put(..., { expirationTtl })` / `KV.delete(...)` | No persistent event loop or background `asyncio.Task` queue; use `c.executionCtx.waitUntil(...)` for non-blocking cache writes/invalidations after returning `200 OK` to Telegram. |
| `APScheduler` (`apscheduler_jobs`) | **Cloudflare Cron Triggers** (`wrangler.jsonc` `triggers.crons`) | Replace `tcbot.erasure_every_10m`, `tcbot.promotion_expiry_hourly`, `tcbot.enforcement_worker`, `tcbot.notification_worker`, `tcbot.retention_daily`, and `tcbot.stale_cleanup_daily` with Worker `scheduled()` handlers (or Cloudflare Queues for fan-out). |
| `pg_cron` (`pg_cron.py`) | **Supabase `pg_cron`** | Keep pure-DB maintenance jobs (`moderation.expire`, `role.expire`, `enforcement.reconcile`, `scheduler.drift`) in Supabase `pg_cron` calling `run_scheduled_job(...)` directly inside Postgres. |
| `enforcement_db` & `notifications_db` | **Supabase Tables + Cron Trigger / Cloudflare Queues** | Keep the durable Postgres tables (`moderation_enforcement_*`, `moderation_notification_tasks`) as source of truth; process due rows in a `scheduled()` Cron handler or push claimed target IDs onto a **Cloudflare Queue** for bounded parallel Telegram Bot API delivery. |
| `mtproto.py` / `mtproto_store.py` | **Omitted from Worker / External Service** | Cloudflare Workers cannot maintain persistent MTProto TCP sockets (`Kurigram`/`Pyrogram`). Rely on Bot API + Supabase `telegram_users` harvesting on incoming updates; if MTProto username resolution or member harvesting is required, host it as a separate stateful sidecar service reading/writing the same `mtproto_state` table. |
