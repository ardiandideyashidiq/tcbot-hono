# Legacy Configuration, Secrets & Dependencies Specification

Source references (read-only):
- `tcbot/config.env.example`
- `tcbot/tcbot/__init__.py`
- `tcbot/tcbot/utils/secrets.py`
- `tcbot/pyproject.toml`

Target references:
- `tcbot-hono/wrangler.jsonc`
- `tcbot-hono/package.json`

---

## 1. Environment Configuration (`tcbot/__init__.py` & `config.env.example`)

Legacy configuration is loaded lazily on first access to `tcbot.cfg` (PEP 562 `__getattr__` guarded by `_cfg_lock`) via `Configs.load(env_file="config.env")`, which calls `load_dotenv(find_dotenv("config.env") or find_dotenv(".env"))`. All fields are stored on a frozen `@dataclass Configs`.

### 1.1 Parsing & Validation Helpers (`tcbot/__init__.py`)

- `parse_list(raw)`: Evaluates Python list literals via `ast.literal_eval`, falling back to CSV splitting (`raw.strip("[]").split(",")`), stripping whitespace/quotes and dropping blank entries.
- `parse_port(port_str)`: `"auto"` or empty resolves to `5000`; invalid or outside `1..65535` logs a warning and resolves to `5000`.
- `parse_chat_id(raw)`: Parses `CHAT_ID` or `CHAT_ID/THREAD_ID` into `tuple[int, int | None]`. Unset/invalid returns `(0, None)`. Non-positive or non-integer `THREAD_ID` is dropped (`None`) with a warning.
- `_bool_from_env(key, default=False)`: Accepts `1/true/yes/on` and `0/false/no/off` (case-insensitive); invalid values warn and return `default`.
- `_int_from_env(key, default, minimum=None)`: Parses integer; invalid or `< minimum` warns and returns `default`.

### 1.2 Complete Environment Variable Reference

#### Core Credentials & Database

| Env Var | `Configs` Field | Type | Required | Default | Validation / Behavior | Purpose |
|---|---|---|---|---|---|---|
| `BOT_TOKEN` | `bot_token` | `str` | **Yes** | — | Non-empty (`RuntimeError` if missing); warns if not matching `\d+:[A-Za-z0-9_-]{35}` | Telegram Bot API token from `@BotFather`. |
| `OWNER_ID` | `initial_owner_id` | `int` | **Yes** | — | Must be a positive integer (`> 0`); `RuntimeError` if missing/invalid | Initial federation Owner Telegram user ID. |
| `DATABASE_URL` | `database_url` | `str` | **Yes** | — | Non-empty (`RuntimeError` if missing); warns if not starting with `postgresql://`, `postgresql+psycopg://`, or `postgres://` | PostgreSQL connection string (Alembic runs migrations at startup). |
| `DB_SCHEMA` | `db_schema` | `str` | No | `"public"` | Must be in `{"public", "test", "development"}`; any other value warns and falls back to `"public"` | PostgreSQL schema used by the bot. |
| `DB_POOL_SIZE` | `db_pool_size` | `int` | No | `5` | Integer `>= 1` | SQLAlchemy connection pool size. |
| `DB_MAX_OVERFLOW` | `db_max_overflow` | `int` | No | `5` | Integer `>= 0` | Extra SQLAlchemy connections allowed under burst load. |
| `REDIS_URL` | `redis_url` | `str \| None` | No | `None` | Empty string becomes `None` | Optional Redis L2 cache URL (`redis://...`). |
| `PG_CRON_ENABLED` | `pg_cron_enabled` | `bool` | No | `False` | Boolean | Offload pure-DB maintenance jobs to PostgreSQL `pg_cron` extension when available. |

#### MTProto Client (Required by Kurigram Runtime)

| Env Var | `Configs` Field | Type | Required | Default | Validation / Behavior | Purpose |
|---|---|---|---|---|---|---|
| `API_ID` | `api_id` | `int` | **Yes** (boot check) | `0` | Integer `>= 0`; `__main__.py` refuses to boot if `cfg.mtproto_enabled` (`api_id > 0` and `api_hash` non-empty) is `False` | Telegram API ID from `my.telegram.org` for Kurigram/MTProto. |
| `API_HASH` | `api_hash` | `str` | **Yes** (boot check) | `""` | Non-empty string required for `mtproto_enabled` | Telegram API hash matching `API_ID`. |
| `MTPROTO_SESSION` | `mtproto_session` | `str` | No | `"tcbot_mtproto"` | Blank falls back to `"tcbot_mtproto"` | Namespace for the shared MTProto session in PostgreSQL. |

#### Telegram Chats & Destinations

| Env Var | `Configs` Field | Type | Required | Default | Validation / Behavior | Purpose |
|---|---|---|---|---|---|---|
| `PROOFS` | `proofs` | `tuple[int, int \| None]` | **Yes** | — | Non-empty and `chat_id < 0` (`RuntimeError` if missing or `>= 0`); supports `chat_id/thread_id` | Group/channel/forum topic where `/tcban` proof media is uploaded. |
| `MAIN_GROUP` | `main_group` | `int` | No | `0` | Must be `< 0`; positive values warn and are treated as `0` (unset) | Main community group/supergroup ID. |
| `MAIN_CHANNEL` | `main_channel` | `int` | No | `0` | Must be `< 0`; positive values warn and are treated as `0` (unset) | Main community channel ID (rules publication target). |
| `LOGS` | `logs` | `tuple[int, int \| None]` | No | `(0, None)` | `parse_chat_id` (`chat_id` or `chat_id/thread_id`) | Destination for moderation/admin audit log messages. |
| `LOGS_ERRORS` | `logs_errors` | `tuple[int, int \| None]` | No | `(0, None)` | `parse_chat_id`; when `chat_id == 0`, `error_reporter` falls back to Owner DM | Destination for error-level log reports. |
| `APPEALS` | `appeals` | `tuple[int, int \| None]` | No | `(0, None)` | `parse_chat_id` | Destination for submitted appeal forwards and review card copies. |
| `INFRA_CHAT_IDS` | `extra_infra_chats` | `tuple[int, ...]` | No | `()` | `parse_list` of ints; only negative IDs kept (positive/non-numeric warn and are skipped), deduplicated | Extra deployment-owned chat IDs excluded from federation connection. |

#### Bot Behavior & Moderation Tuning

| Env Var | `Configs` Field | Type | Required | Default | Validation / Behavior | Purpose |
|---|---|---|---|---|---|---|
| `COMMUNITY_NAME` | `community_name` | `str` | No | `"Bot"` | Stripped; blank falls back to `"Bot"` | Display name of the federation/community. |
| `PREFIXES` | `prefixes` | `tuple[str, ...]` | No | `("/", "!", ".")` | `parse_list`; empty falls back to `("/", "!", ".")` | Recognized command prefixes. |
| `ALBUM_DEBOUNCE_SECONDS` | `album_debounce` | `int` | No | `4` | Integer `>= 1` (60s hard collection cap enforced in code) | Silence window before collected `/tcban` proof media executes. |
| `PROMOTION_REQUEST_TTL_DAYS` | `promotion_request_ttl_days` | `int` | No | `7` | Integer `>= 0` (`0` disables expiry) | Days before a pending promotion request expires. |
| `WARN_LIMIT` | `warn_limit` | `int` | No | `3` | Integer `>= 1` | Per-group warning count that triggers automatic federation ban. |
| `FED_WARN_LIMIT` | `fed_warn_limit` | `int` | No | `0` | Integer `>= 0` (`0` disables cross-group threshold) | Federation-wide warning count across all groups triggering auto-ban. |
| `WARN_EXPIRY_DAYS` | `warn_expiry_days` | `int` | No | `0` | Integer `>= 0` (`0` disables expiry) | Days after which a warning stops counting toward auto-ban thresholds. |
| `MODULES_LOAD` | `modules_load` | `tuple[str, ...]` | No | `()` | `parse_list` of module filenames | Optional allowlist of modules to load exclusively. |
| `MODULES_NO_LOAD` | `modules_no_load` | `tuple[str, ...]` | No | `()` | `parse_list` of module filenames | Optional denylist of modules to skip. |

#### Server, Logging & Observability

| Env Var | `Configs` Field | Type | Required | Default | Validation / Behavior | Purpose |
|---|---|---|---|---|---|---|
| `PORT` | `port` | `int` | No | `5000` | `parse_port` (`1..65535`, `"auto"` → `5000`) | Port for the Flask keep-alive/health server. |
| `BIND_HOST` | `bind_host` | `str` | No | `"0.0.0.0"` | Blank falls back to `"0.0.0.0"` | Bind interface for the Flask keep-alive/health server. |
| `LOG_LEVEL` | `log_level` | `int` | No | `20` (`INFO`) | `NOTSET`(0), `DEBUG`(10), `INFO`(20), `WARNING`/`WARN`(30), `ERROR`(40), `CRITICAL`/`FATAL`(50); invalid → `INFO` | Bot logger verbosity level. |
| `SENTRY_DSN` | `sentry_dsn` | `str` | No | `""` | Stripped string; empty disables Sentry | Optional Sentry DSN (`observability` extra). |

---

## 2. Constant-Time Secret Comparison (`tcbot/utils/secrets.py`)

`secret_matches(provided: str, expected: str) -> bool`:
- Encodes both `provided` and `expected` to UTF-8 bytes before calling `hmac.compare_digest`.
- Prevents `TypeError` on non-ASCII credential headers (turning malformed headers into clean mismatches instead of 500s).
- **Fail-closed contract**: Callers must reject an empty `expected` secret before invoking `secret_matches`.

---

## 3. Legacy Python Dependencies (`tcbot/pyproject.toml`)

- **Package**: `tcbot` v`7.1.0`, `requires-python = ">=3.14"`, `setuptools>=84.2.1`.
- **Runtime `dependencies`**:
  - `kurigram[fast]>=2.2.27,<3` (Telegram client & polling)
  - `sqlalchemy[asyncio]>=2.1.8,<2.2`, `psycopg[binary]>=3.3.8,<4`, `alembic>=1.20.1,<2` (PostgreSQL + migrations)
  - `redis[hiredis]>=8.1,<9`, `apscheduler[sqlalchemy]>=3.11.3,<4`, `cachetools>=8.0,<9` (caching & scheduling)
  - `flask>=3.1.3,<4`, `certifi>=2026.10.23` (keep-alive HTTP & TLS certs)
  - `msgspec>=0.22,<0.23`, `python-dotenv>=1.2.4,<2` (JSON serialization & env loading)
  - `loguru>=0.7.3,<1` (logging)
  - `uvloop>=0.23,<0.24; sys_platform == 'linux'` (event loop)
- **Optional `[project.optional-dependencies].observability`**:
  - `prometheus-client>=0.26,<0.27`, `sentry-sdk[loguru]>=2.74,<3`
- **`[dependency-groups].dev`**:
  - `ruff>=0.17.4,<1`, `pyright>=1.1.414,<2`, `pytest>=9.2,<10`, `pytest-asyncio>=1.4.1.post1,<2`, `pytest-xdist>=3.8,<4`, `pytest-cov>=7.1,<8`, `hypothesis>=6.170.15,<7`, `pre-commit>=4.7,<5`, `py-spy>=0.4.3,<1`
  - Pytest markers: `postgres` (`TCBOT_TEST_DATABASE_URL`), `redis` (`TCBOT_TEST_REDIS_URL`).

---

## 4. Cloudflare Workers & `tcbot-hono` Mapping

### 4.1 Secrets vs. `wrangler.jsonc` `vars`

Never place tokens or credentials in `wrangler.jsonc` `vars` (they are committed in plaintext). Store secrets via `wrangler secret put` (and `.dev.vars` locally), typed in `CloudflareBindings` via `bun run cf-typegen`:

| Legacy Env Var | Target (`tcbot-hono`) | Storage | Notes |
|---|---|---|---|
| `BOT_TOKEN` | `TELEGRAM_BOT_TOKEN` | **Worker Secret** | Used by grammY `Bot` and Mini App `initData` HMAC-SHA256 verification. |
| *(New — webhook auth)* | `TELEGRAM_WEBHOOK_SECRET` | **Worker Secret** | Verified via `webhookCallback(bot, 'hono', { secretToken })` (constant-time comparison). |
| `DATABASE_URL` | `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (and/or `SUPABASE_PUBLISHABLE_KEY` if needed) | `vars` (`SUPABASE_URL`) + **Worker Secret** (`SUPABASE_SECRET_KEY`) | Replaces raw `psycopg`/`SQLAlchemy` connection string and `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`. |
| `SENTRY_DSN` | `SENTRY_DSN` (if used) | **Worker Secret** | Optional error monitoring. |
| `OWNER_ID`, `PROOFS`, `MAIN_GROUP`, `MAIN_CHANNEL`, `LOGS`, `LOGS_ERRORS`, `APPEALS`, `INFRA_CHAT_IDS` | Same or structured `vars` / DB config | `wrangler.jsonc` `vars` (or Worker Secrets if chat IDs are considered sensitive) | Preserve `chat_id/thread_id` parsing and `chat_id < 0` validation for `PROOFS`/`MAIN_GROUP`/`MAIN_CHANNEL`. |
| `COMMUNITY_NAME`, `PREFIXES`, `ALBUM_DEBOUNCE_SECONDS`, `PROMOTION_REQUEST_TTL_DAYS`, `WARN_LIMIT`, `FED_WARN_LIMIT`, `WARN_EXPIRY_DAYS`, `LOG_LEVEL`, `DB_SCHEMA` | `wrangler.jsonc` `vars` | `wrangler.jsonc` `vars` | Non-secret runtime configuration. |
| `API_ID`, `API_HASH`, `MTPROTO_SESSION` | **Removed** | — | Not needed: grammY uses Bot API HTTP webhooks, not MTProto. |
| `PORT`, `BIND_HOST` | **Removed** | — | Managed by Cloudflare Workers / Vite dev server. |
| `REDIS_URL` | **Removed** (or Cloudflare KV / Upstash if L2 cache needed) | — | No TCP Redis client in Workers without `nodejs_compat`/Hyperdrive. |
| `PG_CRON_ENABLED` | **Removed** (always Supabase `pg_cron` + Worker Cron Triggers) | — | `wrangler.jsonc` `triggers.crons` handles Worker-side scheduled tasks. |
| `MODULES_LOAD`, `MODULES_NO_LOAD` | **Removed** (or feature flags in `vars`) | — | Hono routes and grammY composers are statically imported and bundled by Vite. |

### 4.2 Dependency Mapping (`pyproject.toml` → `tcbot-hono/package.json`)

| Legacy Python Package | `tcbot-hono` Equivalent | Notes |
|---|---|---|
| `kurigram` | `grammy` (`^1.48.0`) + `@grammyjs/auto-retry` (`^2.0.2`) | Webhook-based Bot API via `webhookCallback(bot, 'hono')`. |
| `flask` | `hono` (`^4.13.16`) + `@hono/zod-validator` (`^0.9.1`) + `zod` (`^4.6.7`) | Edge HTTP framework + schema validation. |
| `sqlalchemy`, `psycopg`, `alembic` | `@supabase/supabase-js` (`^2.119.2`) + Supabase CLI migrations | Typed `Database` client with `persistSession: false`. |
| `apscheduler` | Cloudflare Cron Triggers + Supabase `pg_cron` | Serverless scheduling. |
| `ruff`, `pyright` | `@biomejs/biome` (`2.6.9`) + `tsc` | Linting, formatting, and typechecking. |
| `python-dotenv`, `uvloop`, `msgspec`, `loguru`, `cachetools`, `redis` | Native Workers `env` bindings, `workerd` runtime, native `JSON`, `console`, Web Crypto `crypto.subtle` | Built into Cloudflare Workers / Web Standards. |
