# Legacy Database Schema, SQL Objects, and Domain Helpers

> Source specification derived from `/home/rd/Projects/bot/tcbot-rewrite/tcbot/tcbot/database/`, `/home/rd/Projects/bot/tcbot-rewrite/tcbot/alembic/versions/`, and `/home/rd/Projects/bot/tcbot-rewrite/tcbot/docs/architecture/database.md`.

## 1. Engine, Schemas, and Migration Architecture

### 1.1 PostgreSQL Schemas
The legacy PostgreSQL layer uses three schemas (`tcbot/docs/architecture/database.md`, `tcbot/database/migrations.py`):
- `public`: Default deployment schema (`DB_SCHEMA` defaults to `public`).
- `test`: Integration test schema (managed by `tests/postgres_support.py`).
- `development`: Developer/operator script schema (`DB_SCHEMA=development`).

`connection_options.schema_options(schema, primary_chat_id=...)` sets `-c search_path=<schema> -c timezone=UTC` (and `-c tcbot.primary_chat_id=<id>` when non-zero) on every connection, including the async engine, Alembic migrations, and the APScheduler job store. `normalize_database_url()` rewrites `postgres://` and `postgresql://` to `postgresql+psycopg://`.

### 1.2 Engine & Session Boundary (`tcbot/database/engine.py`)
- `_DB_CALL_TIMEOUT_S = 20.0`, `_POOL_TIMEOUT_S = 10.0`, `_POOL_RECYCLE_S = 1800.0`, `_CONNECT_TIMEOUT_S = 10.0`.
- `create_async_engine(..., hide_parameters=True, pool_pre_ping=True)` prevents leaking bound parameters (such as MTProto `auth_key` bytes) into logs.
- `db_call(op, timeout=20.0)` wraps every read/write in the `postgres` circuit breaker and `asyncio.timeout`.
- Non-connection SQLSTATEs (`40001` serialization failure, `40P01` deadlock, `55P03` lock not available, `57014` query canceled, `3D000` invalid catalog, `28000`/`28P01` auth failures) do **not** trip the circuit breaker.
- `run_transaction(op)` executes a callback inside a single `AsyncSession` commit/rollback boundary (already wrapped in `db_call`).
- `read_connection()` uses `isolation_level="AUTOCOMMIT"` for single-statement reads.

### 1.3 Alembic Migrations (`tcbot/alembic/versions/*`, `tcbot/database/migrations.py`)
- Startup calls `migrations.ensure_schema()` then `migrations.upgrade_head()` under a session-scoped PostgreSQL advisory lock (`_MIGRATION_LOCK_KEY = 7313919265517002`).
- `stamp_bootstrap_schema()` stamps `head` if all tables in `metadata.tables` already exist without an `alembic_version` row.
- **20 numbered revisions (`0001_initial` through `0020_erased_identity_guard`)**:
  - `0001_initial` – `0004_reapply_schema_objects`: Initial tables, member cache sort indexes (`0002`), community schema (`0003`), schema object reapply (`0004`).
  - `0005_promotion_request_expiry`: Adds `expires_at` and expiry index/constraint to `promotion_requests`.
  - `0006_notification_tasks`: Adds `moderation_notification_tasks` outbox table.
  - `0007_scheduled_job_owner`: Adds `job_owner` (`application` vs `pg_cron`) to `scheduled_jobs`.
  - `0008_kick_failed_status`: Adds `failed` status for `kick` actions in `moderation_actions`.
  - `0009` – `0011_erasure_cleanup`: Reconcile window (`0009`), schema hardening (`0010`), erasure cleanup (`0011`).
  - `0012_rules_publication`: Adds `rule_categories`, `rule_publication_runs`, `rule_publications`, category snapshot columns on `rule_items`, and `uq_rule_set_versions_draft`.
  - `0013_role_vocabulary`: One-way normalization of legacy `founder`/`tester` roles into `owner`, `admin`, `developer`, `moderator`.
  - `0014_primary_group_enforcement`: Allows inactive `MAIN_GROUP` as enforcement target via `tcbot.primary_chat_id` GUC.
  - `0015_rule_category_description` & `0016_rule_category_content`: Adds `rule_categories.description` and `rule_category_content` localized table.
  - `0017_primary_chat_predicate` & `0018_community_primary_chat`: Adds `community_settings.primary_chat_id` fallback for triggers when GUC is absent.
  - `0019_schema_hardening_reapply`: Fixes `promotion_requests_reject` audit `entity_id` (numeric `id`), `SECURITY DEFINER` search paths, and RLS/retention coverage for `rule_category_content`.
  - `0020_erased_identity_guard`: Installs `guard_erased_user_identity()` trigger on `telegram_users` and permits repeat erasure requests.

---

## 2. Database Tables (`tcbot/database/base/`)

`SCHEMA_TABLES` in `tcbot/database/base/__init__.py` declares **48 tables** in dependency order. All timestamps are `TIMESTAMPTZ` in UTC (`server_default=now()`). Empty JSONB objects default to `'{}'::jsonb`. Enums are implemented as `TEXT` columns with `CHECK` constraints (`enum_check`).

### 2.1 Community & Settings (`base/community.py`, `base/settings.py`)

| Table | Primary Key | Columns & Types | Constraints & Indexes |
|---|---|---|---|
| `community_settings` | `singleton_key` | `singleton_key TEXT DEFAULT 'global'`, `community TEXT`, `description TEXT`, `primary_chat_id BIGINT`, `default_locale TEXT`, `timezone TEXT`, `settings JSONB DEFAULT '{}'`, `updated_at TIMESTAMPTZ` | `ck_community_settings_singleton` (`singleton_key = 'global'`), `ck_community_settings_community`, `ck_community_settings_description` |
| `user_settings` | `user_id` | `user_id BIGINT`, `locale TEXT`, `timezone TEXT`, `preferences JSONB DEFAULT '{}'`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ` | FK `user_id -> telegram_users.user_id` |
| `chat_settings` | `chat_id` | `chat_id BIGINT`, `locale TEXT`, `timezone TEXT`, `settings JSONB DEFAULT '{}'`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ` | FK `chat_id -> telegram_chats.chat_id` |

### 2.2 Identity & Group Registry (`base/identity.py`)

| Table | Primary Key | Key Columns | Constraints & Indexes |
|---|---|---|---|
| `telegram_users` | `user_id` (`BIGINT`) | `username TEXT`, `first_name TEXT`, `last_name TEXT`, `language_code TEXT`, `is_bot BOOLEAN DEFAULT false`, `is_premium BOOLEAN DEFAULT false`, `first_seen_at`, `last_seen_at`, `created_at`, `updated_at`, `erased_at TIMESTAMPTZ`, `erasure_reason TEXT` | Indexes: `ix_telegram_users_username`, `ix_telegram_users_first_name`, `ix_telegram_users_last_seen`, `ix_telegram_users_first_name_lower` (`text_pattern_ops`), `ix_telegram_users_first_name_lower_sort`, `ix_telegram_users_username_lower` (`text_pattern_ops`), `ix_telegram_users_username_lower_sort` |
| `telegram_chats` | `chat_id` (`BIGINT`) | `chat_type TEXT DEFAULT 'unknown'`, `title TEXT`, `username TEXT`, `description TEXT`, `is_forum BOOLEAN DEFAULT false`, `linked_chat_id BIGINT`, `created_at`, `updated_at` | `ck_telegram_chats_chat_type` (`private`, `group`, `supergroup`, `channel`, `unknown`), self-FK `linked_chat_id -> telegram_chats.chat_id`. Indexes: `ix_telegram_chats_username`, `ix_telegram_chats_chat_type` |
| `connected_chats` | `chat_id` (`BIGINT`) | `added_by_user_id BIGINT`, `added_at TIMESTAMPTZ`, `is_active BOOLEAN DEFAULT true` | FKs: `chat_id -> telegram_chats.chat_id`, `added_by_user_id -> telegram_users.user_id`. Indexes: `ix_connected_chats_active`, `ix_connected_chats_added_by` |
| `join_requests` | `id` (`BIGINT IDENTITY`) | `chat_id BIGINT`, `owner_user_id BIGINT`, `request_message_id BIGINT`, `status TEXT DEFAULT 'pending'`, `requested_at`, `resolved_at`, `resolved_by_user_id BIGINT`, `decision_note TEXT`, `metadata JSONB` | `ck_join_requests_status` (`pending`, `approved`, `rejected`, `cancelled`). Partial unique: `uq_join_requests_pending_chat` on `(chat_id)` `WHERE status = 'pending'`. Indexes: `ix_join_requests_status`, `ix_join_requests_chat` |
| `chat_members` | `(chat_id, user_id)` | `status TEXT DEFAULT 'member'`, `custom_title TEXT`, `joined_at`, `until_date`, `last_seen_at`, `updated_at` | `ck_chat_members_status` (`creator`, `administrator`, `member`, `restricted`, `left`, `kicked`). FKs to `telegram_chats`, `telegram_users`. Indexes: `ix_chat_members_user`, `ix_chat_members_last_seen` |

### 2.3 Roles & RBAC (`base/rbac.py`)

| Table | Primary Key | Key Columns | Constraints & Indexes |
|---|---|---|---|
| `role_definitions` | `role_key` (`TEXT`) | `display_name TEXT`, `description TEXT`, `priority SMALLINT DEFAULT 0`, `is_system BOOLEAN DEFAULT false`, `created_at` | `ck_role_definitions_key` (`^[a-z][a-z0-9_]*$`) |
| `permission_definitions` | `permission_key` (`TEXT`) | `resource TEXT`, `description TEXT`, `created_at` | `ck_permission_definitions_key` (`^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`), `ck_permission_definitions_description`. Index: `ix_permission_definitions_resource` |
| `role_permissions` | `(role_key, permission_key)` | — | FKs to `role_definitions`, `permission_definitions`. Index: `ix_role_permissions_permission` |
| `role_assignments` | `id` (`BIGINT IDENTITY`) | `user_id BIGINT`, `role_key TEXT`, `assigned_by_user_id BIGINT`, `assigned_at`, `status TEXT DEFAULT 'active'`, `expires_at`, `revoked_at`, `revoked_by_user_id BIGINT` | `ck_role_assignments_status` (`active`, `revoked`, `expired`). Partial uniques: `uq_role_assignments_active_user` on `(user_id) WHERE status = 'active'`; `uq_role_assignments_active_owner` on `(role_key) WHERE status = 'active' AND role_key = 'owner'`. Indexes: `user`, `role`, `status`, `expires` |
| `promotion_requests` | `id` (`BIGINT IDENTITY`) | `request_id TEXT` (unique), `target_user_id BIGINT`, `requested_role_key TEXT`, `requested_by_user_id BIGINT`, `status TEXT DEFAULT 'pending'`, `requested_at`, `expires_at`, `resolved_at`, `resolved_by_user_id BIGINT`, `decision_note TEXT`, `metadata JSONB` | `ck_promotion_requests_status` (`pending`, `approved`, `rejected`, `cancelled`, `expired`), `ck_promotion_requests_expiry`. Partial unique: `uq_promotion_requests_pending_target` on `(target_user_id) WHERE status = 'pending'`. Indexes: `status`, `target`, `(status, expires_at)` |

### 2.4 Rules & Publications (`base/rules.py`)

| Table | Primary Key | Key Columns | Constraints & Indexes |
|---|---|---|---|
| `rule_sets` | `id` (`BIGINT IDENTITY`) | `scope_type TEXT`, `chat_id BIGINT`, `rule_set_key TEXT`, `name TEXT`, `description TEXT`, `is_active BOOLEAN DEFAULT true`, `requires_acknowledgement BOOLEAN DEFAULT false`, `created_by_user_id BIGINT`, `created_at`, `updated_at` | `ck_rule_sets_scope` (`community`, `chat`), `ck_rule_sets_key`, `ck_rule_sets_scope_chat` (community has NULL `chat_id`; chat has non-NULL `chat_id`). FK `chat_id -> connected_chats.chat_id` |
| `rule_set_versions` | `id` (`BIGINT IDENTITY`) | `rule_set_id BIGINT`, `version_number INTEGER`, `locale TEXT DEFAULT 'en-US'`, `status TEXT DEFAULT 'draft'`, `change_summary TEXT`, `created_by_user_id`, `published_by_user_id`, `published_at`, `created_at`, `updated_at` | `uq_rule_set_versions_number` `(rule_set_id, locale, version_number)`, `ck_rule_set_versions_status` (`draft`, `published`, `superseded`, `archived`). Partial uniques: `uq_rule_set_versions_published` `(rule_set_id, locale) WHERE status = 'published'`; `uq_rule_set_versions_draft` `(rule_set_id, locale) WHERE status = 'draft'` |
| `rule_items` | `id` (`BIGINT IDENTITY`) | `rule_set_version_id BIGINT`, `rule_key TEXT`, `category_key TEXT`, `title TEXT`, `body TEXT`, `content_format TEXT DEFAULT 'plain_text'`, `category_title TEXT`, `category_sort_order INTEGER`, `sort_order INTEGER DEFAULT 100`, `is_mandatory BOOLEAN DEFAULT true`, `reference_url TEXT`, `metadata JSONB`, `created_at`, `search_vector TSVECTOR` (generated `to_tsvector('simple', title || ' ' || body)`) | `uq_rule_items_version_key` `(rule_set_version_id, rule_key)`, `ck_rule_items_content_format` (`plain_text`, `markdown`). GIN index `ix_rule_items_search` on `search_vector` |
| `rule_categories` | `id` (`BIGINT IDENTITY`) | `rule_set_id BIGINT`, `category_key TEXT`, `title TEXT`, `description TEXT`, `sort_order INTEGER DEFAULT 100`, `is_active BOOLEAN DEFAULT true`, `created_at`, `updated_at` | `uq_rule_categories_set_key` `(rule_set_id, category_key)` |
| `rule_category_content` | `id` (`BIGINT IDENTITY`) | `rule_set_id BIGINT`, `category_key TEXT`, `locale TEXT`, `label TEXT`, `description TEXT`, `created_at`, `updated_at` | `uq_rule_category_content` `(rule_set_id, category_key, locale)` |
| `rule_publication_runs` | `id` (`BIGINT IDENTITY`) | `rule_set_id BIGINT`, `rule_set_version_id BIGINT`, `chat_id BIGINT`, `status TEXT DEFAULT 'running'`, `started_at`, `finished_at`, `lease_expires_at`, `error TEXT`, `created_at` | `ck_rule_publication_runs_status` (`running`, `completed`, `partial`, `failed`). Partial unique: `uq_rule_publication_runs_active` `(rule_set_id, chat_id) WHERE status = 'running'` |
| `rule_publications` | `id` (`BIGINT IDENTITY`) | `rule_set_id BIGINT`, `rule_set_version_id BIGINT`, `locale TEXT DEFAULT 'en-US'`, `chat_id BIGINT`, `message_thread_id BIGINT`, `category_key TEXT`, `part_index INTEGER DEFAULT 0`, `message_id BIGINT`, `content_hash TEXT`, `run_id BIGINT`, `status TEXT DEFAULT 'pending'`, `last_error TEXT`, `last_synced_at`, `created_at`, `updated_at` | `ck_rule_publications_status` (`pending`, `synced`, `failed`, `missing`, `retired`, `deleted`). Unique: `uq_rule_publications_slot` `(rule_set_id, locale, chat_id, coalesce(message_thread_id, 0), category_key, part_index)`. Partial unique: `uq_rule_publications_message` `(chat_id, message_id) WHERE message_id IS NOT NULL` |
| `rule_acknowledgements` | `id` (`BIGINT IDENTITY`) | `rule_set_version_id BIGINT`, `user_id BIGINT`, `context_chat_id BIGINT`, `acknowledgement_method TEXT DEFAULT 'inline_button'`, `telegram_message_id BIGINT`, `acknowledged_at`, `metadata JSONB` | `uq_rule_acknowledgements_version_user` `(rule_set_version_id, user_id)`, `ck_rule_acknowledgements_method` (`inline_button`, `command`, `join_gate`, `admin_recorded`, `api`) |

### 2.5 Moderation, Evidence, Appeals, Notifications, and Audit (`base/moderation.py`)

| Table | Primary Key | Key Columns | Constraints & Indexes |
|---|---|---|---|
| `moderation_cases` | `id` (`BIGINT IDENTITY`) | `public_id TEXT DEFAULT gen_random_uuid()::text`, `subject_user_id BIGINT`, `case_type TEXT DEFAULT 'rule_violation'`, `title TEXT`, `summary TEXT`, `severity TEXT DEFAULT 'unknown'`, `status TEXT DEFAULT 'open'`, `source TEXT DEFAULT 'manual'`, `opened_by_user_id`, `assigned_to_user_id`, `closed_by_user_id`, `created_at`, `updated_at`, `resolved_at`, `metadata JSONB`, `requires_evidence BOOLEAN DEFAULT false` | `uq_moderation_cases_public_id`, `uq_moderation_cases_id_subject` `(id, subject_user_id)`. Severity: `unknown`, `low`, `medium`, `high`, `critical`. Status: `open`, `collecting_evidence`, `evidence_failed`, `under_review`, `escalated`, `resolved`, `dismissed`, `cancelled`. Source: `manual`, `system`, `automated`, `ai` |
| `moderation_case_rules` | `(case_id, rule_item_id)` | `linked_by_user_id BIGINT`, `attribution_source TEXT DEFAULT 'moderator'`, `note TEXT`, `created_at`, `context_chat_id BIGINT` | `ck_moderation_case_rules_attribution` (`moderator`, `system`, `automated`, `ai`) |
| `moderation_evidence_uploads` | `id` (`BIGINT IDENTITY`) | `case_id BIGINT`, `uploaded_by_user_id BIGINT`, `destination_chat_id BIGINT`, `destination_thread_id BIGINT`, `is_required BOOLEAN DEFAULT false`, `expected_item_count INTEGER`, `status TEXT DEFAULT 'queued'`, `idempotency_key TEXT`, `primary_message_id BIGINT`, `started_at`, `finished_at`, `failure_code`, `failure_detail`, `metadata JSONB`, `created_at`, `updated_at` | Composite uniques `(id, case_id)` and `(id, destination_chat_id)`. Status: `queued`, `uploading`, `completed`, `partial`, `failed`, `cancelled` |
| `moderation_evidence_items` | `id` (`BIGINT IDENTITY`) | `upload_id BIGINT`, `destination_chat_id BIGINT`, `archive_message_id BIGINT`, `source_chat_id`, `source_message_id`, `media_group_id`, `media_type TEXT`, `file_unique_id`, `mime_type`, `file_size_bytes`, `item_order INTEGER`, `sha256_hex TEXT`, `archive_message_url`, `metadata JSONB`, `created_at`, `file_name`, `caption_text`, `duration_seconds`, `width`, `height` | `uq_moderation_evidence_items_message` `(upload_id, archive_message_id)`. `media_type`: `photo`, `video`, `animation`, `document`, `audio`, `voice`, `video_note`, `sticker`. Deferrable FK `(upload_id, destination_chat_id) -> moderation_evidence_uploads` |
| `moderation_actions` | `id` (`BIGINT IDENTITY`) | `chat_id BIGINT`, `action_type TEXT`, `target_user_id BIGINT`, `actor_user_id BIGINT`, `reason TEXT`, `duration_seconds BIGINT`, `created_at`, `expires_at`, `status TEXT`, `revoked_at`, `revoked_by_user_id`, `external_ref TEXT` (16-char hex default), `metadata JSONB`, `case_id BIGINT`, `supersedes_action_id BIGINT`, `action_origin TEXT DEFAULT 'manual'`, `evidence_upload_id BIGINT`, `scope_type TEXT`, `origin_chat_id BIGINT` | `action_type`: `warn`, `mute`, `ban`, `kick`. `status`: `active`, `completed`, `revoked`, `expired`, `superseded`, `failed`. `action_origin`: `manual`, `system`, `automated`, `ai`. `scope_type`: `community`, `chat`. Partial uniques: `uq_moderation_actions_active_ban` `(target_user_id) WHERE action_type='ban' AND status='active'`; `uq_moderation_actions_active_mute` `(target_user_id) WHERE action_type='mute' AND status='active'`. Composite FKs enforce same-subject case/supersession and same-case evidence |
| `moderation_appeals` | `id` (`BIGINT IDENTITY`) | `action_id BIGINT`, `appellant_user_id BIGINT`, `appeal_text TEXT`, `status TEXT DEFAULT 'pending'`, `submitted_at`, `resolved_at`, `reviewed_by_user_id`, `decision_note TEXT`, `metadata JSONB` | Composite FK `(action_id, appellant_user_id) -> moderation_actions(id, target_user_id)`. Status: `pending`, `accepted`, `rejected`, `withdrawn`. Partial unique: `uq_moderation_appeals_pending` `(action_id, appellant_user_id) WHERE status = 'pending'` |
| `moderation_messages` | `id` (`BIGINT IDENTITY`) | `action_id BIGINT`, `chat_id BIGINT`, `message_id BIGINT`, `message_kind TEXT`, `recorded_by_user_id BIGINT`, `created_at` | `message_kind`: `log`, `review`, `appeal_log`, `notice` |
| `moderation_notification_tasks` | `id` (`BIGINT IDENTITY`) | `action_id BIGINT`, `chat_id BIGINT`, `message_id BIGINT`, `kind TEXT DEFAULT 'review_card'`, `state TEXT DEFAULT 'pending'`, `attempts INTEGER DEFAULT 0`, `next_retry_at TIMESTAMPTZ`, `last_error TEXT`, `created_at`, `updated_at` | `uq_moderation_notification_action_kind` `(action_id, kind)`. `kind`: `review_card`. `state`: `pending`, `sent`, `failed`, `skipped`. Index: `ix_moderation_notification_due` `(state, next_retry_at)` |
| `audit_events` | `id` (`BIGINT IDENTITY`) | `actor_user_id`, `subject_user_id`, `event_key TEXT`, `entity_type TEXT`, `entity_id TEXT`, `payload JSONB`, `occurred_at TIMESTAMPTZ`, `case_id`, `action_id`, `correlation_id`, `operation_id` | 21 allowed `entity_type` values checked by `ck_audit_events_entity_type`. Indexes on `occurred_at DESC`, `(entity_type, entity_id)`, `actor`, `subject`, `case`, `action`, `correlation_id` |

### 2.6 Durable Enforcement (`base/enforcement.py`)

| Table | Primary Key | Key Columns | Constraints & Indexes |
|---|---|---|---|
| `moderation_enforcement_runs` | `id` (`BIGINT IDENTITY`) | `action_id BIGINT`, `operation TEXT`, `idempotency_key TEXT` (unique), `requested_by_user_id BIGINT`, `status TEXT DEFAULT 'queued'`, `target_count`, `succeeded_count`, `failed_count`, `skipped_count`, `started_at`, `finished_at`, `metadata JSONB`, `created_at`, `updated_at`, `scheduled_job_run_id BIGINT` | `operation`: `apply`, `revoke`, `reconcile`. `status`: `queued`, `running`, `completed`, `partial`, `failed`, `cancelled` |
| `moderation_enforcement_targets` | `id` (`BIGINT IDENTITY`) | `run_id BIGINT`, `chat_id BIGINT`, `status TEXT DEFAULT 'pending'`, `attempt_count INTEGER DEFAULT 0`, `last_error_kind`, `last_error_code`, `last_error_detail`, `next_retry_at`, `first_attempt_at`, `last_attempt_at`, `completed_at`, `response_metadata JSONB`, `created_at`, `updated_at` | `uq_moderation_enforcement_targets_run_chat` `(run_id, chat_id)`. `status`: `pending`, `in_progress`, `succeeded`, `skipped`, `failed`. Index `ix_moderation_enforcement_targets_retry` `(status, next_retry_at)` |
| `moderation_enforcement_attempts` | `id` (`BIGINT IDENTITY`) | `target_id BIGINT`, `attempt_number INTEGER`, `outcome TEXT`, `error_kind`, `error_code`, `error_detail`, `attempted_at`, `response_metadata JSONB` | `outcome`: `succeeded`, `skipped`, `failed` |

### 2.7 Automation & Broadcast (`base/automation.py`, `base/broadcast.py`)

| Table | Primary Key | Key Columns | Constraints & Indexes |
|---|---|---|---|
| `automation_policies` | `id` (`BIGINT IDENTITY`) | `policy_key TEXT` (unique), `scope_type TEXT`, `chat_id BIGINT`, `name`, `description`, `is_enabled BOOLEAN DEFAULT true`, `priority INTEGER DEFAULT 100`, `cooldown_seconds INTEGER DEFAULT 0`, `max_actions_per_user_per_window`, `max_actions_window_seconds`, `created_by_user_id`, `created_at`, `updated_at` | `scope_type`: `community`, `chat` |
| `automation_policy_versions` | `id` (`BIGINT IDENTITY`) | `policy_id BIGINT`, `version_number INTEGER`, `trigger_definition JSONB`, `conditions JSONB`, `steps_definition JSONB`, `status TEXT DEFAULT 'draft'`, `change_summary`, `created_by_user_id`, `published_by_user_id`, `published_at`, `created_at`, `updated_at`, `definition_schema_version INTEGER DEFAULT 1` | `uq_automation_policy_versions_number` `(policy_id, version_number)`. Partial unique: `uq_automation_policy_versions_published` `(policy_id) WHERE status = 'published'` |
| `automation_events` | `id` (`BIGINT IDENTITY`) | `event_type TEXT`, `source TEXT`, `idempotency_key TEXT` (unique), `subject_user_id`, `context_chat_id`, `occurred_at`, `received_at`, `payload JSONB` | `source`: `telegram`, `manual`, `system`, `scheduler`, `ai` |
| `automation_runs` | `id` (`BIGINT IDENTITY`) | `public_id TEXT` (unique), `policy_version_id BIGINT`, `event_id BIGINT`, `subject_user_id`, `context_chat_id`, `idempotency_key TEXT` (unique), `status TEXT DEFAULT 'queued'`, `outcome TEXT`, `case_id BIGINT`, `started_at`, `finished_at`, `error_code`, `error_detail`, `result JSONB`, `created_at`, `updated_at` | `status`: `queued`, `running`, `completed`, `partial`, `failed`, `skipped`, `cancelled` |
| `automation_run_steps` | `id` (`BIGINT IDENTITY`) | `run_id BIGINT`, `step_key TEXT`, `step_order INTEGER`, `step_type TEXT`, `config_snapshot JSONB`, `status TEXT DEFAULT 'pending'`, `attempt_count INTEGER DEFAULT 0`, `next_retry_at`, `moderation_action_id`, `enforcement_run_id`, `error_code`, `error_detail`, `output JSONB`, `started_at`, `finished_at`, `created_at`, `updated_at` | `uq_automation_run_steps_run_key` `(run_id, step_key)`. `step_type`: `create_case`, `collect_evidence`, `warn`, `mute`, `ban`, `kick`, `notify`, `request_review`, `enforce`, `custom` |
| `automation_run_step_attempts` | `id` (`BIGINT IDENTITY`) | `step_id BIGINT`, `attempt_number INTEGER`, `outcome TEXT`, `attempted_at`, `error_code`, `error_detail`, `result JSONB` | `outcome`: `completed`, `failed`, `skipped` |
| `broadcast_campaigns` | `id` (`BIGINT IDENTITY`) | `public_id TEXT` (unique), `title TEXT`, `message_text TEXT`, `parse_mode TEXT`, `message_payload JSONB`, `audience_filter JSONB DEFAULT '{"mode": "all_active"}'`, `idempotency_key TEXT` (unique), `requested_by_user_id`, `status TEXT DEFAULT 'draft'`, `scheduled_at`, `target_count`, `succeeded_count`, `failed_count`, `skipped_count`, `started_at`, `finished_at`, `metadata JSONB`, `created_at`, `updated_at` | `parse_mode`: `HTML`, `Markdown`, `MarkdownV2`. `status`: `draft`, `scheduled`, `queued`, `running`, `completed`, `partial`, `failed`, `cancelled` |
| `broadcast_targets` | `id` (`BIGINT IDENTITY`) | `campaign_id BIGINT`, `chat_id BIGINT`, `status TEXT DEFAULT 'pending'`, `attempt_count INTEGER DEFAULT 0`, `next_retry_at`, `telegram_message_id`, `last_error_kind`, `last_error_code`, `last_error_detail`, `response_metadata JSONB`, `first_attempt_at`, `last_attempt_at`, `completed_at`, `created_at`, `updated_at` | `uq_broadcast_targets_campaign_chat` `(campaign_id, chat_id)`. `status`: `pending`, `in_progress`, `succeeded`, `failed`, `skipped` |
| `broadcast_attempts` | `id` (`BIGINT IDENTITY`) | `target_id BIGINT`, `attempt_number INTEGER`, `outcome TEXT`, `telegram_message_id`, `error_kind`, `error_code`, `error_detail`, `attempted_at`, `response_metadata JSONB` | `outcome`: `succeeded`, `failed`, `skipped` |

### 2.8 Jobs, Erasure, Retention, and Runtime (`base/jobs.py`, `base/runtime.py`)

| Table | Primary Key | Key Columns | Constraints & Indexes |
|---|---|---|---|
| `scheduled_jobs` | `job_key` (`TEXT`) | `job_kind TEXT DEFAULT 'maintenance'`, `description`, `job_owner TEXT DEFAULT 'application'`, `schedule_spec TEXT`, `is_enabled BOOLEAN DEFAULT true`, `timeout_seconds INTEGER DEFAULT 60`, `idempotency_scope`, `last_started_at`, `last_success_at`, `last_status TEXT DEFAULT 'pending'`, `last_error`, `consecutive_failures INTEGER DEFAULT 0`, `last_duration_ms`, `updated_by_user_id`, `created_at`, `updated_at` | `job_kind`: `maintenance`, `dispatch`. `job_owner`: `application`, `pg_cron`. `last_status`: `pending`, `running`, `success`, `failed`, `skipped` |
| `scheduled_job_runs` | `id` (`BIGINT IDENTITY`) | `job_key TEXT`, `run_key TEXT` (unique), `triggered_by TEXT DEFAULT 'cron'`, `status TEXT DEFAULT 'running'`, `started_at`, `finished_at`, `affected_count`, `error_kind`, `error_detail`, `duration_ms`, `payload JSONB` | `triggered_by`: `cron`, `manual`, `app`. `status`: `running`, `success`, `failed`, `skipped` |
| `telegram_user_erasures` | `id` (`BIGINT IDENTITY`) | `user_id BIGINT`, `reason TEXT`, `source TEXT DEFAULT 'operator'`, `status TEXT DEFAULT 'pending'`, `requested_at`, `processed_at`, `processed_by_user_id`, `affected JSONB`, `notes TEXT` | `source`: `telegram_report`, `user_request`, `operator`, `sweep`. `status`: `pending`, `processing`, `completed`, `retained`. Partial unique: `uq_telegram_user_erasures_open` `(user_id) WHERE status IN ('pending', 'processing')` |
| `retention_policies` | `target_table` (`TEXT`) | `data_class TEXT DEFAULT 'reference'`, `retention_days INTEGER`, `time_column TEXT`, `is_enabled BOOLEAN DEFAULT true`, `rationale`, `last_run_at`, `last_removed INTEGER DEFAULT 0`, `created_at`, `updated_at` | `data_class`: `history`, `telemetry`, `identity_cache`, `runtime_state`, `reference` |
| `mtproto_state` | `id` (`TEXT`) | `value BYTEA`, `access_hash BIGINT`, `type TEXT`, `usernames TEXT[]`, `phone_number TEXT`, `updated_on BIGINT`, `pts INTEGER`, `qts INTEGER`, `date INTEGER`, `seq INTEGER`, `owner TEXT`, `expires_at BIGINT` | Indexes: `ix_mtproto_state_date`, `ix_mtproto_state_usernames` (GIN), `ix_mtproto_state_id_pattern` (`text_pattern_ops`), `ix_mtproto_state_phone_number` (partial) |
| `apscheduler_jobs` | `id` (`TEXT`) | `next_run_time FLOAT`, `job_state BYTEA` | Owned by APScheduler `SQLAlchemyJobStore` |

---

## 3. SQL Views (`tcbot/database/schema/views.sql`)

All 8 views are created with `WITH (security_invoker='true')`:
1. `active_bans`: Active, non-expired `ban` rows from `moderation_actions` (`ban_action_id`, `ban_id`, `scope_type`, `chat_id`, `origin_chat_id`, `banned_user_id`, `admin_user_id`, `reason`, `timestamp`, `until_date`, `duration_seconds`, `metadata`).
2. `active_mutes`: Active, non-expired `mute` rows from `moderation_actions`.
3. `community_member_stats`: `unique_members`, `active_memberships`, and `active_connected_chats` across active `connected_chats`.
4. `community_members`: Aggregated user profile + `first_joined_at`, `last_seen_at`, `connected_group_count`, `has_telegram_admin_membership`.
5. `effective_chat_settings`: Joins `connected_chats` (`is_active`), `telegram_chats`, `community_settings`, and `chat_settings`, coalescing `locale`/`timezone` and merging `settings` JSONB (`global || chat`).
6. `moderation_timeline`: `UNION ALL` timeline across `moderation_actions`, `moderation_appeals`, `moderation_evidence_uploads`, `moderation_evidence_items`, `moderation_enforcement_runs`, `moderation_enforcement_targets`, `moderation_enforcement_attempts`, and `audit_events`.
7. `role_permission_matrix`: Aggregates `role_definitions` + `role_permissions` with `permission_count`, `permissions[]`, and `missing_from_owner[]`.
8. `warn_counts`: `GROUP BY chat_id, target_user_id` over `moderation_actions` where `action_type = 'warn'`, `status = 'completed'`, and `(expires_at IS NULL OR expires_at > now())`.

---

## 4. PL/pgSQL Functions & Triggers (`schema/functions/*.sql`, `triggers.sql`)

The schema loader (`schema/loader.py`) applies files in strict order: `views.sql` → `functions/*.sql` → `triggers.sql` → `policies.sql` → `seed.sql`.

### 4.1 Key Functions by Domain
- **Identity (`functions/identity.sql`)**:
  - `ensure_connected_chat_settings()`: Auto-creates `chat_settings` row on `connected_chats` insert.
  - `guard_community_settings_singleton()`, `guard_join_request_lifecycle()`, `guard_telegram_chat_type_change()`, `validate_connected_chat_chat_type()`, `set_updated_at()`, `prevent_historical_record_delete()`.
  - `guard_erased_user_identity()`: Raises SQLSTATE `23514` (`ck_telegram_users_erased_identity`) if an update tries to repopulate `username`, `first_name`, `last_name`, `language_code`, or `is_premium = true` on a user with `erased_at IS NOT NULL`.
  - `repoint_chat_records(p_old_chat_id, p_new_chat_id)` (`SECURITY DEFINER`): Atomically migrates a group's `telegram_chats`, `chat_settings`, `connected_chats`, `chat_members`, `join_requests`, `moderation_actions`, and `moderation_case_rules` when Telegram upgrades a basic group to a supergroup, setting `tcbot.chat_repoint_source` GUC for the transaction.
- **RBAC (`functions/rbac.sql`)**:
  - `actor_has_permission(p_user_id, p_permission_key)`: Checks active, non-expired `role_assignments` joined with `role_permissions`.
  - `expire_due_role_assignments()` & `expire_due_role_assignments_and_audit()`.
  - `guard_promotion_request_lifecycle()`, `guard_role_assignment_update()`, `guard_system_role_definition()`, `prepare_role_assignment()`.
  - `promotion_requests_approve(...)` & `promotion_requests_reject(...)` (`SECURITY DEFINER`): Transactional approval/rejection with permission checks, self-approval block, and `audit_events` logging.
- **Rules (`functions/rules.sql`)**:
  - `ensure_published_rule_acknowledgement()`, `guard_rule_acknowledgement_history()`, `guard_rule_item_draft_only()`, `guard_rule_set_identity()`, `guard_rule_set_version_changes()`, `validate_rule_publication_scope()`.
- **Moderation & Audit (`functions/moderation.sql`, `functions/moderation_audit.sql`)**:
  - `assign_moderation_action_external_ref()`: Assigns 16-char UUID hex prefix if blank.
  - `enforce_moderation_ban_evidence()`: Requires completed + `is_required` evidence upload for `manual`, `system`, and `ai` bans (`automated` bans may omit evidence if case `requires_evidence` is false).
  - `prepare_moderation_action()`: Validates `scope_type` (`community` for ban/mute, `chat` for warn/kick), checks active chat or `primary_chat_id` (via `tcbot.primary_chat_id` GUC or `community_settings.primary_chat_id`), expires overdue active actions, and handles `supersedes_action_id`.
  - `guard_moderation_action_update()`: Enforces immutable decision facts, valid status transitions (including `kick` `completed <-> failed`), and repoint GUC checks.
  - `expire_due_moderation_actions()` & `expire_due_moderation_actions_and_queue_revokes()`: Atomically expires due bans/mutes, withdraws pending appeals (`'Ban expired'`), clears review card metadata, and queues `revoke` enforcement runs (`idempotency_key = 'moderation:<id>:revoke:expire:v1'`).
  - `prepare_moderation_enforcement_target()` & `refresh_moderation_enforcement_run()`: Enforces target state machine (`pending -> in_progress -> succeeded|skipped|failed`, `failed -> in_progress` when `next_retry_at <= now()`) and rolls up run counters/status.
  - `reconcile_stuck_enforcement_targets(p_stale_after='15m', p_max_attempts=3)`: Releases stale `in_progress` targets to `failed` (with immediate retry if `attempt_count < 3`, else terminal `attempts_exhausted`).
  - `enqueue_reconcile_run(...)`, `validate_moderation_case_rule_scope()`, `validate_moderation_evidence_upload()`, `guard_appeal_ban_target()`, `guard_moderation_appeal_lifecycle()`, `guard_moderation_case_insert/update()`, `guard_moderation_enforcement_attempt()`, `guard_moderation_enforcement_run_identity()`, `guard_moderation_evidence_item()`, `guard_moderation_message_history()`, `validate_audit_event_entity()`.
- **Automation & Broadcast (`functions/automation.sql`)**:
  - `automation_snapshot_run_steps()`, `validate_automation_policy_definition()`, `guard_automation_*()`, `refresh_automation_run()`, `queue_broadcast_campaign()`, `validate_broadcast_audience_filter()`, `guard_broadcast_*()`, `prepare_broadcast_target()`, `refresh_broadcast_campaign()`.
- **Scheduler (`functions/scheduler.sql`)**:
  - `scheduled_job_claim()`, `scheduled_job_finish()`, `run_scheduled_job()`, `audit_scheduler_drift()`, `scheduler_drift_report()`, `guard_scheduled_job_run()`, `safe_duration_ms()`.
- **Maintenance (`functions/maintenance.sql`)**:
  - `request_user_erasure(p_user_id, p_reason, p_source)`: Deduplicates open requests via `uq_telegram_user_erasures_open` and logs `telegram.user.erasure_requested`.
  - `process_user_erasure(p_erasure_id)`: Refuses erasing active `owner`; clears `telegram_users` PII, sets `erased_at`, deletes `chat_members` and `user_settings`, revokes `role_assignments`, withdraws pending `moderation_appeals`, revokes active `moderation_actions` and queues `revoke` enforcement runs (`moderation:<id>:revoke:erasure:v1`), cancels pending `promotion_requests`, and writes `telegram.user.erased` audit event.
  - `sweep_pending_user_erasures(p_limit=50)`: Processes pending erasures ordered by `(requested_at, id)`; marks failures as `retained`.
  - `apply_retention_policy(p_target_table, p_limit=5000)` & `sweep_retention_policies()`: Batch-deletes expired rows per `retention_policies` and calls `prune_expired_mtproto_state()`.
  - `assert_least_privilege()` & `rls_auto_enable()` (DDL event trigger helper).
- **MTProto (`functions/mtproto.sql`)**:
  - `mtproto_state_claim()`, `mtproto_state_get()`, `mtproto_state_put()`, `mtproto_state_delete()`, `mtproto_state_find_by_phone()`, `mtproto_state_find_by_username()`, `prune_expired_mtproto_state()`.

### 4.2 Triggers (`schema/triggers.sql`)
Triggers enforce append-only / no-delete / no-truncate invariants across all historical tables (`audit_events`, `automation_*`, `broadcast_*`, `join_requests`, `moderation_*`, `promotion_requests`, `role_assignments`, `rule_sets`, `rule_acknowledgements`, `community_settings`), auto-maintain `updated_at`, validate state transitions, and roll up child target/step statuses to parent runs/campaigns.

---

## 5. RLS Policies & Seed Data (`policies.sql`, `seed.sql`)

### 5.1 Row Level Security (`schema/policies.sql`)
- Checks if `anon` and `authenticated` roles exist; if so:
  - Enables RLS on all **48 base tables** and creates `CREATE POLICY deny_exposed_api_roles ON <schema>.<table> TO authenticated, anon USING (false) WITH CHECK (false)`.
  - Runs `REVOKE ALL ON <schema>.<view> FROM anon, authenticated` on all **8 views**.
- Note: Server-side access uses the PostgreSQL superuser/owner or `service_role` (which bypasses RLS).

### 5.2 Seed Data (`schema/seed.sql`)
- `community_settings`: Inserts singleton `'global'` row (`ON CONFLICT DO NOTHING`).
- `role_definitions`: `owner` (100), `admin` (80), `developer` (60), `moderator` (40), all `is_system = TRUE`.
- `permission_definitions`: **38 permissions** across `audit`, `automation`, `community`, `groups`, `members`, `moderation`, `roles`, and `rules`.
- `role_permissions`: Maps all 38 permissions to `owner`, 31 to `admin`, 17 to `developer`, and 14 to `moderator`.
- `retention_policies`: Policies for all 48 tables (`telemetry` 90–180 days, `chat_members` 90 days, `mtproto_state` lease-based, `history`/`reference` retained permanently).
- `scheduled_jobs`: 6 registered jobs (`enforcement.reconcile`, `moderation.expire`, `retention.sweep`, `role.expire`, `scheduler.drift`, `user.erasure`).

---

## 6. Key Domain DB Operations & Supabase Migration Notes

### 6.1 Domain Helpers Summary
- **`bans_db/`**: Composes `BanDoc` from `moderation_actions` + `moderation_messages` + `moderation_appeals`. Uses `pg_advisory_xact_lock` / partial unique index `uq_moderation_actions_active_ban` for supersession; manages review-card slots (`set_review_if_absent`, `claim_appeal_decision`, `release_stale_review`).
- **`rules_db/`**: Manages `rule_sets`, single-draft enforcement (`open_draft`), draft-only item edits, atomic version publication (`promote_version`), category CRUD, `rule_publication_runs` leases, `rule_publications` message slots, and `rule_acknowledgements`.
- **`moderation_db.py` / `warns_db.py` / `mutes_db.py` / `kicks_db.py`**:
  - `warns_db`: Serializes mutations with `pg_advisory_xact_lock` (`warn-user:{uid}`, `warn:{cid}:{uid}`), reads live counts from `warn_counts` view.
  - `mutes_db`: Serializes per-user mutes (`mute:{uid}`), extends `expires_at` on supersession (permanent outranks timed), and queues `apply`/`revoke` enforcement runs atomically.
  - `kicks_db`: Logs `completed` chat-scoped kicks and supports `completed <-> failed` repair transitions.
- **`erasure_db.py`**: Thin wrapper calling `SELECT request_user_erasure(:user_id, :reason, 'operator')`.

### 6.2 Supabase Migration Notes for `tcbot-hono`
1. **Server-Side Client**: `tcbot-hono` Workers must connect using `SUPABASE_SECRET_KEY` (`service_role` / secret key) with `{ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }` (`docs/supabase.md`). Because `policies.sql` explicitly denies `anon` and `authenticated` on all 48 tables, any Mini App or Web UI access must go through authenticated Hono API routes (or have new scoped RLS policies added if direct client reads are ever introduced).
2. **Stored Procedures & RPC**: Complex transactional workflows (`repoint_chat_records`, `promotion_requests_approve/reject`, `expire_due_moderation_actions_and_queue_revokes`, `process_user_erasure`, `run_scheduled_job`) live in PL/pgSQL. They can be invoked via `supabase.rpc(...)` or direct Postgres driver (`postgres` / `pg` over Hyperdrive) when session GUCs like `tcbot.primary_chat_id` or `FOR UPDATE SKIP LOCKED` are needed.
3. **Session GUC (`tcbot.primary_chat_id`)**: Triggers in `moderation.sql` fall back to `community_settings.primary_chat_id` when `tcbot.primary_chat_id` is not set on the connection (`0018_community_primary_chat`). Ensure `community_settings.primary_chat_id` is populated so stateless Supabase REST/RPC calls work without session GUCs.
4. **Return Rows in `supabase-js` v2**: Always chain `.select()` after `.insert()`, `.update()`, or `.upsert()` when the caller needs the mutated row (`docs/supabase.md`).
5. **Retired Python Tables**: `apscheduler_jobs` is specific to Python APScheduler and is not needed in `tcbot-hono` (replaced by Cloudflare Cron Triggers + `pg_cron`). `mtproto_state` is only needed if MTProto is retained via an external worker/service (Cloudflare Workers cannot run long-lived TCP MTProto connections).
