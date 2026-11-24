# Legacy Runtime & Architecture Specification

Source references (read-only):
- `tcbot/tcbot/__main__.py`
- `tcbot/tcbot/alive.py`
- `tcbot/tcbot/enforcement_worker.py`
- `tcbot/tcbot/notification_worker.py`
- `tcbot/tcbot/error_reporter.py`
- `tcbot/tcbot/utils/*` (`circuit_breaker.py`, `dispatch.py`, `i18n.py`, `logger.py`, `metrics.py`, `pagination.py`, `prefixes.py`, `secrets.py`, `tasks.py`, `time_and_date.py`, `transport.py`, `update_processor.py`)
- `tcbot/docs/architecture/overview.md`, `runtime.md`, `security.md`

---

## 1. Startup & Application Lifecycle (`__main__.py`)

The legacy bot is a single-process Python 3.14 asyncio application using **Kurigram** (`pyrogram` fork) native MTProto/Bot-API long polling.

### 1.1 Boot Sequence (`main()` → `_run_polling()`)

1. **Logging & Sentry (`main`)**:
   - Calls `setup_logging(level=cfg.log_level)` (`utils/logger.py`).
   - Calls `_init_sentry()`: if `cfg.sentry_dsn` is set and `sentry_sdk` (`observability` extra) is installed, initializes Sentry with `LoguruIntegration(event_level=ERROR_LEVEL)`, `traces_sample_rate=0.0`, `send_default_pii=False`, and `before_send=error_reporter.scrub_sentry_event`.
   - Verifies `cfg.mtproto_enabled` (`api_id > 0` and `bool(api_hash)`). Refuses to boot (`RuntimeError`) if missing.
2. **Keep-Alive HTTP Server (`start_keepalive()`)**:
   - Probes `cfg.bind_host:cfg.port` with a TCP socket (`SO_REUSEADDR`) to fail fast on port conflicts, then launches Flask in a daemon thread (`name="keepalive"`).
3. **Event Loop (`loop_factory()`)**:
   - Runs `asyncio.run(_run_polling(), loop_factory=loop_factory())`, using `uvloop.new_event_loop` on Linux if `uvloop` is installed.
4. **Client & Handler Registration (`_run_polling`)**:
   - Obtains the single Kurigram `Client` from `mtproto_mod.client()`.
   - Calls `register_handlers(client)`:
     - Registers `_on_any_update` at handler group `_HANDLER_GROUP_CACHE = 10` for `MessageHandler`, `CallbackQueryHandler`, `ChatMemberUpdatedHandler`, and `ChatJoinRequestHandler` to harvest acting user identities (`uid`, `username`, `first_name`, `last_name`), skipping bots and empty first names. Concurrency is capped by `_member_cache_tasks` (`_MEMBER_CACHE_MAX_CONCURRENT = 20`; drops are logged every `_MEMBER_CACHE_DROP_REPORT_EVERY = 100` drops).
     - Registers all discovered module handlers from `get_handlers()` at `handler_group(handler)`. (Module discovery in `tcbot/modules/__init__.py` sorts modules deterministically and validates `MODULES_LOAD` / `MODULES_NO_LOAD`.)
     - Registers `ErrorHandler(_error_handler)`.
   - Installs `_make_asyncio_exc_handler()` on the running event loop.
5. **Subsystem Initialization (`init_shared_subsystems(client)`)**:
   - Loads i18n catalogs (`_ensure_loaded()`).
   - Connects PostgreSQL (`connect()`), which also applies Alembic migrations at startup.
   - Runs in parallel (`asyncio.gather(..., return_exceptions=True)`):
     - `db.groups_db.ensure_destinations(...)` for `cfg.proofs`, `cfg.logs`, and `cfg.appeals` (recording chat ID and whether a forum thread ID is present).
     - `db.users_roles.ensure_initial_owner(cfg.initial_owner_id)`.
     - `db.groups_db.ensure_primary_group(cfg.main_group)`.
     - `redis_client.connect_if_configured()`.
     - `mtproto_mod.start()`.
   - Raises if `mtproto_r` is an exception or `False` (prevents silent exit-0 on duplicate/dead session).
   - Attaches `error_reporter.attach(client, lec, let, owner_id=cfg.initial_owner_id)`.
   - Caches the bot's own identity via `await bot_identity(client)`.
6. **Workers & Scheduler**:
   - Attaches the live `Client` to `enforcement_worker.configure(client)` and `notification_worker.configure(client)`.
   - Calls `pg_cron_active = await pg_cron.sync_schedules()`.
   - Starts APScheduler (`sched_mod.start(...)`) with `database_jobs_in_pg_cron=pg_cron_active`, `enforcement_job=run_enforcement_worker`, `notification_job=run_notification_worker`.
   - Spawns `_warm_hot_caches()` on `_startup_tasks` (pre-warms `get_owner_id()`, `active_groups()`, and `get_effective_role(owner_id)`).
7. **Polling & Shutdown (`idle()` → `_shutdown_subsystems()`)**:
   - Enters `await idle()` if `client.is_connected`.
   - On exit (`finally`), `_shutdown_subsystems()` runs in order:
     1. `shutdown_dispatcher()`
     2. `sched_mod.stop()`
     3. Drains `TaskTracker` instances: `_asyncio_report_tasks`, `identity_refresh.identity_refresh_tasks`, `connect_common.harvest_tasks`, `drain_proof_sessions()`, `error_reporter.drain_pending()`, `_member_cache_tasks`, `_startup_tasks`
     4. `drain_redis_mutations()`
     5. `asyncio.gather(redis_client.close(), mtproto_mod.stop(), return_exceptions=True)`
     6. `close_database()`

### 1.2 Fatal Startup Errors

`_print_fatal(stage, exc)` scrubs secrets via `error_reporter.scrub_text()` and prints a 70-char red-bordered traceback to `stderr`, exiting with `SystemExit(1)`.

---

## 2. Security & Authorization Architecture (`security.md`)

- **Tier Hierarchy** (`owner` rank 4 > `admin` rank 3 > `developer` rank 2 > `moderator` rank 1; unknown/missing = 0). Equal rank never grants permission over a peer (`outranks`).
- **Decorator Order**: `ratelimiter()` outermost → authorization guard (`owner_only`, `staff_only`, `mod_only`, `basic_mod_only`, `permission_only(key)`) → `log_execution` innermost.
- **Fail-Closed Policy**: Missing/expired roles, lookup failures, anonymous-admin placeholders (`ANONYMOUS_BOT_ID = 1087968824`), Telegram system account (`TELEGRAM_USER_ID = 777000`), and disconnected groups (`groups_db.is_connected(chat_id, fresh=True)`) all refuse the action.
- **Infrastructure Isolation**: `cfg.is_infrastructure_chat(chat_id)` prevents `main_group`, `main_channel`, `proofs`, `logs`, `logs_errors`, `appeals`, and `extra_infra_chats` from being connected as managed federation groups.

---

## 3. Update Processing (`utils/update_processor.py`)

`KeyedUpdateProcessor` prevents interleaved state transitions in multi-step flows (`per_chat=True, per_user=True` conversations):

- **`conversation_key(update) -> tuple[int, int] | None`**: Extracts `(chat.id, user.id)` from `effective_chat`/`chat` and `effective_user`/`from_user`. Updates without both IDs run without a per-key lock.
- **Locking Order**: Acquires the per-`(chat_id, user_id)` `asyncio.Lock` *before* acquiring the global `asyncio.Semaphore(max_concurrent_updates)` (default `_MAX_CONCURRENT_UPDATES = 64`). This ensures a burst in one conversation cannot fill all 64 global slots with waiting tasks and starve other chats.
- **Cleanup**: Tracks `waiters` on `_KeyLock` and pops the key from `self._locks` synchronously when `waiters == 0` (no `await` between decrement and `pop`).
- **Cancellation Safety**: If `asyncio.CancelledError` occurs before the coroutine starts, `coroutine.close()` is called to avoid `"coroutine was never awaited"` leaks.

---

## 4. Dispatch & Transport (`utils/dispatch.py`, `utils/transport.py`)

### 4.1 Transport Constants (`utils/transport.py`)

| Constant | Value | Purpose |
|---|---|---|
| `HTTP_READ_TIMEOUT` | `60` s | Kurigram HTTP read timeout (raised for slow initial `getMe()`) |
| `HTTP_WRITE_TIMEOUT` | `30` s | Kurigram HTTP write timeout |
| `HTTP_CONNECT_TIMEOUT` | `30` s | Kurigram HTTP connect timeout |
| `HTTP_POOL_TIMEOUT` | `15` s | Kurigram HTTP connection pool wait timeout |
| `TELEGRAM_LOOKUP_TIMEOUT` | `3.0` s | Budget for a single lookup (`get_chat`, `get_chat_member`) |
| `TELEGRAM_ACTION_TIMEOUT` | `20.0` s | Bound on a single state-changing call (ban, mute, edit) |
| `API_POOL_SIZE` | `16` | Shared `httpx` connection pool size (sized above `fan_out` cap of 10) |

### 4.2 Bounded Concurrency Dispatcher (`utils/dispatch.py`)

- **`fan_out(coros, max_concurrent=10, probe_reserved=False)`**:
  - Uses `asyncio.Semaphore(max_concurrent)` (default `_MAX_CONCURRENT = 10` to stay safely under Telegram's ~30 msg/s global limit).
  - Integrates `_cb.telegram` (`CircuitBreaker`):
    - If `try_acquire()` returns `False` (circuit `OPEN` or `HALF_OPEN` probe busy), closes the unawaited coroutine and returns `CircuitOpenError`.
    - `TimeoutError` and non-`BadRequest` `OSError` call `record_failure()` (trip the breaker).
    - `BadRequest` and other `Exception`s call `release_probe(reached_service=True)` — API refusals prove Telegram is reachable and never trip the breaker.
    - `asyncio.CancelledError` releases any `HALF_OPEN` probe and re-raises; `throw_if_cancelled(results)` ensures cancellation never degrades into per-group failure data.
    - Logs a single summary warning per `fan_out` call if any slots were skipped by an open circuit.
- **`gather_bounded(coros, max_concurrent=10)`**: Same semaphore, order-preserving return contract, and cancellation propagation as `fan_out`, but with **no** circuit breaker interaction (used for pure database bursts).
- **Error Classification Helpers**:
  - `is_benign_telegram_error(exc)`: Matches normalized alphanumeric upper-case substrings on `BadRequest`: `USER_NOT_PARTICIPANT`, `USER_ID_INVALID`, `CHAT_NOT_FOUND`, `PEER_ID_INVALID`, `USER_NOT_FOUND`, `USER_IS_A_BOT`, `USER_IS_ANONYMOUS`, `PARTICIPANT_ID_INVALID`.
  - `is_permanent_telegram_error(exc)`: Matches normalized substrings on `BadRequest` / `Forbidden`: `CHAT_ADMIN_REQUIRED`, `CHAT_WRITE_FORBIDDEN`, `NOT_ENOUGH_RIGHTS`, `BOT_WAS_KICKED`, `BOT_IS_NOT_A_MEMBER`.
  - `summarize_fanout(groups, results, action=..., target_id=...) -> FanoutOutcome`: Logs per-group warnings, emits one `log.error` via `log_fanout_error` with `first_transient_error(results)` as `exc_info`, and returns `FanoutOutcome(total, applied, transient)`.

---

## 5. Circuit Breaker (`utils/circuit_breaker.py`)

`CircuitBreaker` implements a 3-state async breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) with two module-level singletons:
- `telegram`: `failure_threshold = 5`, `recovery_timeout = 60.0` s
- `postgres`: `failure_threshold = 5`, `recovery_timeout = 60.0` s

Key mechanics:
- **`state` vs `peek_state()`**: Reading `state` auto-transitions `OPEN -> HALF_OPEN` once `monotonic() - _opened_at >= _recovery_timeout`. `peek_state()` reads `_state` without side effects (used by `/health` so monitoring polls cannot flip `OPEN -> HALF_OPEN`).
- **`admission_headroom`**: In `CLOSED` state, returns `max(0, _failure_threshold - _failure_count)`; otherwise `0`. Used by workers to cap batch claims.
- **Half-Open Probe**: `try_acquire()` allows only one in-flight `HALF_OPEN` probe (`_half_open_probe_in_flight`). `release_probe(reached_service=True)` closes the circuit if the downstream answered (even with an application error).
- **Success Decay in `CLOSED`**: Ordinary successes do not immediately reset `_failure_count` (so interleaved successes during a partial outage still trip the breaker). Instead, `_success_streak` resets `_failure_count = 0` only after `2 * _failure_threshold` (10) consecutive successes.
- **Double-Count Guard**: `_already_counted(exc)` attaches `_tcbot_counted_failures` set with the breaker's `_marker_id` onto the exception object so nested breaker calls do not count the same exception twice.

---

## 6. Cache Metrics (`utils/metrics.py`)

Tracks process-local counters in `_CacheStats` and optionally mirrors them to `prometheus_client` (when the `observability` extra is installed):

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `tcbot_cache_hits_total` | Counter | `layer` (`l1`/`l2`) | Cache reads served by a cache layer |
| `tcbot_cache_misses_total` | Counter | — | Cache reads that had to reach the source |
| `tcbot_cache_invalidations_total` | Counter | — | Cache invalidations requested |
| `tcbot_cache_invalidation_drops_total` | Counter | `prefix` | Cache mutations dropped by bounded Redis queue |
| `tcbot_cache_queue_evictions_total` | Counter | `prefix` | Droppable mutations evicted to queue a revocation |
| `tcbot_cache_queue_depth` | Gauge | `prefix` | Queued Redis mutations per cache prefix |
| `tcbot_redis_available` | Gauge | — | Whether Redis client is usable (`1` or `0`) |

Exposes `snapshot()` and `reset()` for diagnostics and tests.

---

## 7. Supervised Background Tasks (`utils/tasks.py`)

`TaskTracker(label)` owns fire-and-forget `asyncio.Task` lifecycles:
- `spawn(coro) -> bool`: Checks `asyncio.get_running_loop()`; if none, closes `coro` and returns `False`. Otherwise creates the task, keeps a strong reference in `self._tasks`, discards it on completion, and logs any unhandled task exception at `WARNING` via `_log_failure` (preventing root-logger `"Task exception was never retrieved"` loops).
- `drain(timeout=5.0, cancel=True)`: Awaits live tasks up to `timeout` via `asyncio.wait`. If `cancel=True` and tasks remain, cancels them and waits another `timeout`. Best-effort trackers drain with `cancel=True`; critical deliveries (like `error_reporter`) pass `cancel=False`.

---

## 8. Command Prefixes (`utils/prefixes.py`)

- Reads `cfg.prefixes` (default `["/", "!", "."]`), sorted longest-first.
- `_parse_prefixed_command(text, prefixes, bot_username)`:
  - Matches a leading prefix; rejects if followed immediately by whitespace (e.g., `"/ warn me"`).
  - Extracts the first whitespace-delimited token, splits on `@` into `(command, mention)`.
  - Validates `command` against `^[a-z][a-z0-9]*$` and `mention` against `^[A-Za-z0-9_]{5,32}$`.
  - If `@mention` is present, requires `bot_username` to match case-insensitively.
- `build_prefixed_filters(command)` builds a Kurigram `Filter`; `ALL_PREFIXES_CMD_FILTER` matches any valid prefixed command.
- `build_conversation_escape_filter(*own_commands)` builds an `OR`-combined filter over `_ALL_COMMANDS` (68 command/alias strings) excluding `own_commands` so conversation fallbacks do not swallow other commands.
- `parse_cmd_args(text)` splits off the command token and returns `parts[1].split()`.

---

## 9. Time, Date & Durations (`utils/time_and_date.py`)

- **UTC Helpers**: `utc_now()` (tz-aware UTC), `to_utc(dt)` (naive assumed UTC), `fmt_date(dt)` (`DD-MM-YYYY`), `fmt_time(dt)` (`HH:MM`), `fmt_dt_raw(dt)` (`DD-MM-YYYY | HH:MM`), `fmt_dt(dt)` (HTML-escaped).
- **Monotonic Clock**: `monotonic()` (`time.monotonic()`), `elapsed_ms(start)`.
- **Duration Parsing (`parse_duration(raw)`)**:
  - Regex `^(\d+)(ye|mo|[smhdw])$` (case-insensitive).
  - Unit seconds: `s=1`, `m=60`, `h=3600`, `d=86400`, `w=604800`, `mo=2592000` (30d), `ye=31536000` (365d).
  - Rejects `value <= 0`, `OverflowError`, and `result.days > _MAX_DURATION_DAYS` (`366` days — Telegram treats >366d as indefinite).
  - Floors durations `< 60` seconds up to `60` seconds (`_MIN_TELEGRAM_RESTRICTION_SECONDS`, since Telegram treats <30s as permanent).
- `fmt_duration(td, locale)` formats `timedelta` back to compact strings or localized `muting.duration.permanent`.

---

## 10. Pagination (`utils/pagination.py`)

Pure list/count math with 0-based page indices:
- `clamp_page(total, page, page_size) -> tuple[int, int]`: Returns `(total_pages, clamped_page)`. If `total <= 0` or `page_size <= 0`, returns `(1, 0)`. Otherwise `total_pages = max(1, (total + page_size - 1) // page_size)` and clamps `page` to `[0, total_pages - 1]`.
- `paginate(items, page, page_size) -> tuple[list[T], int, int]`: Returns `(chunk, total_pages, clamped_page)`.

---

## 11. Other Utilities (`utils/i18n.py`, `utils/secrets.py`)

- **`utils/i18n.py`**: Loads `i18n/<locale>/*.toml` catalogs into flattened dotted keys (`en-US` is `DEFAULT_LOCALE`; `"id"` aliases to `"id-ID"`). `t(key, locale, plain=False, **kwargs)` supports strict mini-markup (`` `code` ``, `*bold*`, `~italic~`), `Safe` pre-escaped fragments, and bare `{name}` placeholders. `resolve_locale()` resolves `explicit` → `user_locale` (private) / `group_locale` (group) → `community_locale` → `en-US`.
- **`utils/secrets.py`**: `secret_matches(provided, expected) -> bool` encodes both strings as UTF-8 bytes before calling `hmac.compare_digest` (avoiding `TypeError` on non-ASCII headers). Callers must reject empty `expected` values beforehand (fail-closed).

---

## 12. Keep-Alive & Healthcheck Server (`alive.py`)

Flask app running on `cfg.bind_host:cfg.port` (default `0.0.0.0:5000`) in a daemon thread. Never accepts Telegram updates.

- **`GET /`**: Returns `"OK"` (`200`).
- **`GET /metrics`**: Registered only if `prometheus_client` is installed; returns `generate_latest()` (`200`).
- **`GET /health`**: Serialized via `msgspec.Struct` (`_HealthPayload`):
  - Fields: `status`, `database`, `redis`, `scheduler`, `circuit_telegram`, `circuit_database`, `ts` (UTC ISO-8601 seconds).
  - Uses `peek_state()` on `_cb.postgres` and `_cb.telegram` (never triggers `OPEN -> HALF_OPEN`).
  - `database` is `"ok"` only if `db_engine.is_connected()` **and** `_cb.postgres.peek_state() is CircuitState.CLOSED`.
  - `redis` is `"disabled"` (when `cfg.redis_url` unset), `"ok"`, `"error"`, or `"unknown"` — **hint-only** (does not degrade overall status).
  - Returns `200` with `status: "ok"` when `database_ok`, `scheduler_ok`, and both circuits are `CLOSED`; otherwise `503` with `status: "degraded"`.

---

## 13. Background Workers & Scheduler

APScheduler 3.11.3 (`AsyncIOScheduler` + `SQLAlchemyJobStore` table `apscheduler_jobs`) runs 7 scheduled jobs (see `runtime.md`), optionally offloading pure-DB jobs to `pg_cron` when `PG_CRON_ENABLED=true`.

### 13.1 Enforcement Worker (`enforcement_worker.py`)

Delivers queued `apply`, `revoke`, and `reconcile` runs across managed groups:
- **Cadence**: Every 5 minutes (`tcbot.enforcement_worker`), plus immediate `deliver_queued_run(bot, run_id)` after commit.
- **Constants**: `_MAX_RUNS_PER_TICK = 10`, `_MAX_TARGETS_PER_RUN = 100`, `_DELIVERY_CHUNK = 10`, `_RETRY_DELAY = 5 minutes`, `_MAX_ATTEMPTS = db.enforcement_db.MAX_ATTEMPTS` (3).
- **Circuit Breaker Integration**:
  - `run_once()` calls `requeue_stale_runs()`, then checks `_cb.telegram.state`. If `OPEN`, pauses without claiming (preserves retry budgets).
  - If `HALF_OPEN`, reserves the single probe via `try_acquire()` before claiming (`1` run, `max_targets=1`, `probe_reserved=True`), releasing in `finally`.
  - In `CLOSED`, claims target chunks sized `min(_DELIVERY_CHUNK, max_targets - processed, _cb.telegram.admission_headroom)`.
- **Pre-Delivery Validation (`_process_run`)**:
  - Cancels runs with missing actions, unsupported `(operation, action_status, action_type)` combinations, superseded revokes (`newer_active`), superseded kick repairs (`active_ban`), expired `apply` decisions, `apply` mutes with `< 30s` remaining (Telegram treats <30s as permanent), or invalid `target_user_id <= 0`.
- **Delivery & Settlement (`_deliver`, `_record_target`)**:
  - Uses `fan_out` with `asyncio.timeout(TELEGRAM_ACTION_TIMEOUT)` (20s).
  - `apply`: `ban_chat_member` or `restrict_chat_member(can_send_messages=False, until_date=expiry)`.
  - `revoke` / `reconcile`: `unban_chat_member` (for `ban`/`kick`) or full `ChatPermissions` restore (for `mute`).
  - Records target outcomes: `succeeded`, `failed` (`error_kind="permanent"` with no retry for permanent errors), `skipped` (for benign errors), or `failed` with `retry_after=5m` if `attempts < _MAX_ATTEMPTS`.
  - For `reconcile`, marks the kick completed (`mark_kick_completed`) once all non-benign targets succeed.

### 13.2 Notification Worker (`notification_worker.py`)

Retries failed review-card edits from the durable notification outbox:
- **Cadence**: Every 5 minutes (`tcbot.notification_worker`).
- **Constants**: `_MAX_TASKS_PER_TICK = 10`, `_MAX_ATTEMPTS = 5`, `_RETRY_DELAY = 5 minutes`.
- **Circuit Breaker Integration**: Skips claiming when `OPEN`; claims `1` task when `HALF_OPEN` or `min(_MAX_TASKS_PER_TICK, max(1, admission_headroom))` when `CLOSED`. Also calls `_cb.telegram.try_acquire()` per task before `edit_message_text`.
- **Guarded Settlement**: Passes `expected_attempts` and `expected_message_id` to `complete_task()` so a stale worker cannot settle a re-queued card.
- **Skip / Terminal Conditions**:
  - Missing IDs or `attempts >= _MAX_ATTEMPTS` → `state="failed"`.
  - Missing action or `_card_is_still_decidable(action, message_id)` (active decision with pending appeal on that exact `review_message_id`) → `state="skipped"`.
  - `Forbidden` or `BadRequest` (`"not found"` / `"message_id_invalid"`) → `state="skipped"`.
  - `BadRequest` (`"not modified"`) → `state="sent"`.
  - Strips inline buttons with `InlineKeyboardMarkup([])` and updates text to `t("appeals.review.card_closed", locale, plain=True)`.

---

## 14. Logging & Error Reporting (`utils/logger.py`, `error_reporter.py`)

### 14.1 Logging (`utils/logger.py`)

- Loguru backend bridged (`_bridge_to_stdlib`) to Python `logging` so `caplog` and `TelegramErrorHandler` receive records.
- `_LoguruShim` preserves `%-style` formatting (`get_logger(name)`).
- `ContextVar` (`_ctx`) binds `u=<user_id> c=<chat_id> #<update_id>` via `bind_request_context()` / `clear_request_context()`.
- `BotLogFormatter` renders `[HH:MM] [DD/MM/YY] [LEVEL] [module:line] [ctx] → message` in UTC with ANSI colors.
- `TelegramErrorHandler` (level `ERROR`) suppresses `tcbot.error_reporter`, `httpcore`, and `httpx._client`, snapshots the `LogRecord`, and forwards it to the registered `_record_sink`.

### 14.2 Error Reporter (`error_reporter.py`)

- **Benign & Noise Filtering**: Ignores `CancelledError`, DB connection/pool-timeout errors, `CircuitOpenError`, benign Telegram patterns (`message is not modified`, `message to edit not found`, `message to delete not found`, `query is too old`, `message is too old`, `message can't be edited`), and `log_execution` duplicate tracer lines (`_LOG_NOISE_RE`).
- **Classification & Action Hints**: `_classify(exc)` tags exceptions (`[~] Rate Limit: Flood Wait`, `[~] Polling Conflict`, `[!] Telegram Bad Request`, `[DB] Database Error`, `[!] Code Bug`, etc.) and pairs them with operator `_ACTION_HINTS`.
- **Secret Scrubbing**: `scrub_text()` / `_scrub_secrets()` redacts exact configured values (`bot_token`, `database_url`, `api_hash`, `redis_url`, `sentry_dsn`) as `[REDACTED]`, Telegram token patterns as `[REDACTED_TOKEN]`, and URL credentials as `://[REDACTED]@`. Also used by `scrub_sentry_event` (`before_send`).
- **Deduplication & Rate Limiting**:
  - Fingerprints exceptions/records (normalizing `Task-\d+` and `0x[0-9a-fA-F]+`), deduping within `_DEDUPE_WINDOW = 30.0` s (`_RECENT_MAX = 1000` entries, protected by `_dedupe_lock`).
  - `_OWNER_ONLY_TYPES` (`PollingConflictError`, `Unauthorized`) route to Owner DM with an hourly budget (`_OWNER_BUDGET = 3` per `_OWNER_WINDOW = 3600.0` s, `_OWNER_MAX = 1000`).
  - `LOG_ERRORS` channel (or Owner DM fallback when `LOGS_ERRORS` is 0) is throttled to `_SEND_BUDGET = 20` reports per `_SEND_WINDOW = 60.0` s; overflow increments `_suppressed_in_window` and emits a summary on window rollover.
- **Cross-Thread & Shutdown**: Uses `asyncio.run_coroutine_threadsafe` when called from non-loop threads (e.g. Flask keep-alive), and drains `_report_tasks` (`cancel=False`) plus `_cross_thread` futures (10s timeout) on shutdown.

---

## 15. Hono & Cloudflare Workers Migration Notes

1. **Webhooks Replace Long Polling & Keep-Alive**:
   - Kurigram long polling (`idle()`), MTProto session management (`API_ID`/`API_HASH`), and the Flask keep-alive server (`alive.py`) are eliminated.
   - Telegram updates arrive via `POST` webhook routed through Hono + `webhookCallback(bot, 'hono', { secretToken: c.env.TELEGRAM_WEBHOOK_SECRET })`.
   - Healthcheck `GET /health` becomes a lightweight Hono route returning JSON (no `alive.py` thread).
2. **Stateless Edge Isolates vs. In-Memory State**:
   - Cloudflare Workers isolates are ephemeral and do not share memory across requests or regions:
     - `KeyedUpdateProcessor` (in-memory `asyncio.Lock` per `(chat, user)`): Cannot serialize across isolates in memory. Multi-step conversation state must live in Supabase/PostgreSQL (or Cloudflare Durable Objects if strict per-key locking is required).
     - `CircuitBreaker` (`telegram`, `postgres`): In-memory counters reset per isolate. For Telegram API rate limits/5xx, use `@grammyjs/auto-retry` on `bot.api.config` rather than a process-global breaker.
     - `TaskTracker` / `_member_cache_tasks` / `drain_*`: Replace with `c.executionCtx.waitUntil(...)` for non-blocking background work after returning `200 OK` to Telegram.
     - `error_reporter.py` in-memory dedupe/throttle maps (`_recent`, `_owner_sent`, `_sent_in_window`): Only apply within a single isolate lifetime; consider structured `console.error` / Workers Logs or an external sink if cross-isolate deduping is needed.
3. **Background Workers & Scheduling**:
   - APScheduler is incompatible with serverless Workers.
   - Pure-DB maintenance jobs (`expiry_daily`, `promotion_expiry_hourly`, `erasure_every_10m`, `retention_daily`, `stale_cleanup_daily`) should run via **Supabase `pg_cron`**.
   - Telegram-delivering workers (`enforcement_worker`, `notification_worker`) map to **Cloudflare Workers Cron Triggers** (`scheduled` handler in `wrangler.jsonc`) and/or **Cloudflare Queues**, still backed by the idempotent Supabase claim/settle RPCs/tables.
4. **Concurrency & Subrequest Limits**:
   - Cloudflare Workers have per-invocation subrequest and CPU time limits (especially on the Free tier). `fan_out` over large federations (e.g. 100 targets) should be chunked/queued or bounded carefully inside Cron/Queue consumers rather than executed inline during a webhook `POST`.
5. **Timeouts & Transport**:
   - `httpx` pool/timeout settings (`utils/transport.py`) are replaced by standard Web `fetch` (`AbortSignal.timeout(...)` if per-call bounds are needed) and grammY's `auto-retry`.
6. **i18n & Prefixes**:
   - `utils/i18n.py` TOML files cannot be read from the filesystem via `pathlib` at runtime in Workers; bundle locale catalogs as static TypeScript/JSON imports at build time.
   - `utils/prefixes.py` command matching (`["/", "!", "."]`, `@botname` validation, no space after prefix) and `utils/time_and_date.py` duration rules (`60s` floor, `366d` cap) translate directly to pure TypeScript helpers and grammY middleware/filters.
