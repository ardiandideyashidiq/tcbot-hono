# Legacy Python `tcbot` Behavioral & Technical Specification

Complete reverse-engineered specification of the legacy Python Telegram bot (`/home/rd/Projects/bot/tcbot-rewrite/tcbot/`) for migration to **Hono + Cloudflare Workers + grammY + Supabase** (`tcbot-hono`).

## Specification Index

| # | Document | Scope |
|---|---|---|
| 01 | [01-runtime-and-architecture.md](./01-runtime-and-architecture.md) | Startup lifecycle, `KeyedUpdateProcessor`, `fan_out` & transport, `CircuitBreaker`, metrics, `TaskTracker`, prefixes, time/pagination, Flask healthcheck, enforcement/notification workers, error reporter, and Workers migration notes. |
| 02 | [02-configuration-and-secrets.md](./02-configuration-and-secrets.md) | All 29 environment variables, validation/parsing rules, `secret_matches` constant-time comparison, `pyproject.toml` dependencies, and `wrangler.jsonc` / Worker Secrets mapping. |
| 03 | [03-database-schema-and-sql.md](./03-database-schema-and-sql.md) | 48 PostgreSQL tables, 20 Alembic migrations, 8 `security_invoker` views, triggers, RLS deny-all policies, seed data (4 roles, 38 permissions, 48 retention policies, 6 scheduled jobs), and PL/pgSQL functions. |
| 04 | [04-caching-and-scheduler.md](./04-caching-and-scheduler.md) | `TwoLevelCache` (L1 `TTLCache` + L2 Redis `tcbot:<prefix>:v2:<key>`), 8 cache singletons, `pg_cron` vs APScheduler job ownership, queues/notifications outbox, and `mtproto_state` lease. |
| 05 | [05-moderation-ban-unban-kick-mute-warn.md](./05-moderation-ban-unban-kick-mute-warn.md) | `/tcban`, `/tcunban`, `/tckick`, `/tcmute`, `/tcunmute`, `/tcwarn`, `/tcunwarn`, `/warns`, `/resetwarns`, target resolution, duration parsing, re-ban confirmation, warn thresholds, and `demote_before_unban` / `demote_before_enforcement`. |
| 06 | [06-appeals-proof-and-check.md](./06-appeals-proof-and-check.md) | Appeals lifecycle (`/start appeal_<ban_id>`, `#appeal`, 72h stale release, 24h cooldown, 12h reviewer lock, dual review cards), `ProofSession` & gallery chunking, and `/check` / `/checkme` panels. |
| 07 | [07-roles-rbac-and-groups.md](./07-roles-rbac-and-groups.md) | 4-tier RBAC (`owner`, `admin`, `developer`, `moderator`), 38 permissions, `/tcpromote`, `/tcsetrole`, `/tcdemote`, `/transferowner`, `/tcgroups`, `/tcconnect` 6-step verification & bounded replay, and `/tcdisconnect`. |
| 08 | [08-rules-greeting-and-broadcast.md](./08-rules-greeting-and-broadcast.md) | Rules system (drafts, immutable publications, `/rules`, `/tcrules` editor, 17 bundled `.md` files, 4 violation tiers, `MAIN_CHANNEL` leased sync), greeting/join enforcement, and `/tcbroadcast`. |
| 09 | [09-general-commands-and-privacy.md](./09-general-commands-and-privacy.md) | `/start`, `/help`, `/about` (governance docs), `/additional`, `/language`, `/maintenance` (`/leaveall`, `/cleanup`, `/tcrepair`, `/tcforget`), `/netspeed` (`/ping`, `/speedtest`), `/privacy`, and `/tcstats`. |
| 10 | [10-helpers-rich-callbacks-and-i18n.md](./10-helpers-rich-callbacks-and-i18n.md) | `Ctx` state store, guards & decorators (auth, rate limits, tracing), target extraction & UTF-16 entities, `rich/*` builders, audit logs, complete `callback_data` registry, and 29 `en-US`/`id-ID` TOML i18n catalogs. |
