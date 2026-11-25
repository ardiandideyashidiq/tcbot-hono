-- Complete Supabase Schema Extension for tcbot-hono
-- Adds remaining tables, views, RLS policies, and seed data from legacy tcbot specification.

-- ============================================================================
-- 1. Join Requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.join_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES public.telegram_chats (chat_id) ON DELETE CASCADE,
  owner_user_id BIGINT NOT NULL REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  request_message_id BIGINT,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_join_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  decision_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_join_requests_pending_chat
  ON public.join_requests (chat_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_join_requests_status ON public.join_requests (status);
CREATE INDEX IF NOT EXISTS ix_join_requests_chat ON public.join_requests (chat_id);

-- ============================================================================
-- 2. Rules Localization & Publication Slots
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rule_category_content (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id BIGINT NOT NULL REFERENCES public.rule_sets (id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  locale TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rule_category_content UNIQUE (rule_set_id, category_key, locale)
);

CREATE TABLE IF NOT EXISTS public.rule_publication_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id BIGINT NOT NULL REFERENCES public.rule_sets (id) ON DELETE CASCADE,
  rule_set_version_id BIGINT NOT NULL REFERENCES public.rule_set_versions (id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CONSTRAINT ck_rule_publication_runs_status CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_publication_runs_active
  ON public.rule_publication_runs (rule_set_id, chat_id) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.rule_publications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id BIGINT NOT NULL REFERENCES public.rule_sets (id) ON DELETE CASCADE,
  rule_set_version_id BIGINT NOT NULL REFERENCES public.rule_set_versions (id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en-US',
  chat_id BIGINT NOT NULL,
  message_thread_id BIGINT,
  category_key TEXT NOT NULL,
  part_index INTEGER NOT NULL DEFAULT 0,
  message_id BIGINT,
  content_hash TEXT,
  run_id BIGINT REFERENCES public.rule_publication_runs (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_rule_publications_status CHECK (status IN ('pending', 'synced', 'failed', 'missing', 'retired', 'deleted')),
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_publications_slot
  ON public.rule_publications (rule_set_id, locale, chat_id, coalesce(message_thread_id, 0), category_key, part_index);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_publications_message
  ON public.rule_publications (chat_id, message_id) WHERE message_id IS NOT NULL;

-- ============================================================================
-- 3. Case Rules, Evidence & Notification Tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.moderation_case_rules (
  case_id BIGINT NOT NULL REFERENCES public.moderation_cases (id) ON DELETE CASCADE,
  rule_item_id BIGINT NOT NULL REFERENCES public.rule_items (id) ON DELETE CASCADE,
  linked_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  attribution_source TEXT NOT NULL DEFAULT 'moderator'
    CONSTRAINT ck_moderation_case_rules_attribution CHECK (attribution_source IN ('moderator', 'system', 'automated', 'ai')),
  note TEXT,
  context_chat_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, rule_item_id)
);

CREATE TABLE IF NOT EXISTS public.moderation_evidence_uploads (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES public.moderation_cases (id) ON DELETE CASCADE,
  uploaded_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  destination_chat_id BIGINT NOT NULL,
  destination_thread_id BIGINT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  expected_item_count INTEGER,
  status TEXT NOT NULL DEFAULT 'queued'
    CONSTRAINT ck_moderation_evidence_uploads_status CHECK (status IN ('queued', 'uploading', 'completed', 'partial', 'failed', 'cancelled')),
  idempotency_key TEXT UNIQUE,
  primary_message_id BIGINT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  failure_code TEXT,
  failure_detail TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.moderation_evidence_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id BIGINT NOT NULL REFERENCES public.moderation_evidence_uploads (id) ON DELETE CASCADE,
  destination_chat_id BIGINT NOT NULL,
  archive_message_id BIGINT NOT NULL,
  source_chat_id BIGINT,
  source_message_id BIGINT,
  media_group_id TEXT,
  media_type TEXT NOT NULL
    CONSTRAINT ck_moderation_evidence_items_media_type CHECK (media_type IN ('photo', 'video', 'animation', 'document', 'audio', 'voice', 'video_note', 'sticker')),
  file_unique_id TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  item_order INTEGER NOT NULL DEFAULT 0,
  sha256_hex TEXT,
  archive_message_url TEXT,
  file_name TEXT,
  caption_text TEXT,
  duration_seconds INTEGER,
  width INTEGER,
  height INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_moderation_evidence_items_message UNIQUE (upload_id, archive_message_id)
);

CREATE TABLE IF NOT EXISTS public.moderation_notification_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_id BIGINT NOT NULL REFERENCES public.moderation_actions (id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'review_card'
    CONSTRAINT ck_moderation_notification_kind CHECK (kind IN ('review_card')),
  state TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_moderation_notification_state CHECK (state IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_moderation_notification_action_kind UNIQUE (action_id, kind)
);

CREATE INDEX IF NOT EXISTS ix_moderation_notification_due
  ON public.moderation_notification_tasks (state, next_retry_at);

-- ============================================================================
-- 4. Durable Multi-Group Enforcement
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.moderation_enforcement_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_id BIGINT NOT NULL REFERENCES public.moderation_actions (id) ON DELETE CASCADE,
  operation TEXT NOT NULL
    CONSTRAINT ck_moderation_enforcement_runs_op CHECK (operation IN ('apply', 'revoke', 'reconcile')),
  idempotency_key TEXT UNIQUE,
  requested_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CONSTRAINT ck_moderation_enforcement_runs_status CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  target_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.moderation_enforcement_targets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES public.moderation_enforcement_runs (id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_moderation_enforcement_targets_status CHECK (status IN ('pending', 'in_progress', 'succeeded', 'skipped', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_kind TEXT,
  last_error_code TEXT,
  last_error_detail TEXT,
  next_retry_at TIMESTAMPTZ,
  first_attempt_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_moderation_enforcement_targets_run_chat UNIQUE (run_id, chat_id)
);

CREATE INDEX IF NOT EXISTS ix_moderation_enforcement_targets_retry
  ON public.moderation_enforcement_targets (status, next_retry_at);

CREATE TABLE IF NOT EXISTS public.moderation_enforcement_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_id BIGINT NOT NULL REFERENCES public.moderation_enforcement_targets (id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL
    CONSTRAINT ck_moderation_enforcement_attempts_outcome CHECK (outcome IN ('succeeded', 'skipped', 'failed')),
  error_kind TEXT,
  error_code TEXT,
  error_detail TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 5. Broadcast Campaigns
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  title TEXT,
  message_text TEXT NOT NULL,
  parse_mode TEXT
    CONSTRAINT ck_broadcast_campaigns_parse_mode CHECK (parse_mode IS NULL OR parse_mode IN ('HTML', 'Markdown', 'MarkdownV2')),
  message_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  audience_filter JSONB NOT NULL DEFAULT '{"mode": "all_active"}'::jsonb,
  idempotency_key TEXT UNIQUE,
  requested_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CONSTRAINT ck_broadcast_campaigns_status CHECK (status IN ('draft', 'scheduled', 'queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  target_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.broadcast_targets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES public.broadcast_campaigns (id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_broadcast_targets_status CHECK (status IN ('pending', 'in_progress', 'succeeded', 'failed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  telegram_message_id BIGINT,
  last_error_kind TEXT,
  last_error_code TEXT,
  last_error_detail TEXT,
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_attempt_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_broadcast_targets_campaign_chat UNIQUE (campaign_id, chat_id)
);

CREATE TABLE IF NOT EXISTS public.broadcast_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_id BIGINT NOT NULL REFERENCES public.broadcast_targets (id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL
    CONSTRAINT ck_broadcast_attempts_outcome CHECK (outcome IN ('succeeded', 'failed', 'skipped')),
  telegram_message_id BIGINT,
  error_kind TEXT,
  error_code TEXT,
  error_detail TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 6. Erasure & Scheduled Jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_user_erasures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'operator'
    CONSTRAINT ck_telegram_user_erasures_source CHECK (source IN ('telegram_report', 'user_request', 'operator', 'sweep')),
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_telegram_user_erasures_status CHECK (status IN ('pending', 'processing', 'completed', 'retained')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by_user_id BIGINT,
  affected JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_user_erasures_open
  ON public.telegram_user_erasures (user_id) WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  job_key TEXT PRIMARY KEY,
  job_kind TEXT NOT NULL DEFAULT 'maintenance'
    CONSTRAINT ck_scheduled_jobs_kind CHECK (job_kind IN ('maintenance', 'dispatch')),
  description TEXT,
  job_owner TEXT NOT NULL DEFAULT 'application'
    CONSTRAINT ck_scheduled_jobs_owner CHECK (job_owner IN ('application', 'pg_cron')),
  schedule_spec TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  timeout_seconds INTEGER NOT NULL DEFAULT 60,
  idempotency_scope TEXT,
  last_started_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_scheduled_jobs_status CHECK (last_status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_duration_ms INTEGER,
  updated_by_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scheduled_job_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_key TEXT NOT NULL REFERENCES public.scheduled_jobs (job_key) ON DELETE CASCADE,
  run_key TEXT NOT NULL UNIQUE,
  triggered_by TEXT NOT NULL DEFAULT 'cron'
    CONSTRAINT ck_scheduled_job_runs_trigger CHECK (triggered_by IN ('cron', 'manual', 'app')),
  status TEXT NOT NULL DEFAULT 'running'
    CONSTRAINT ck_scheduled_job_runs_status CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  affected_count INTEGER DEFAULT 0,
  error_kind TEXT,
  error_detail TEXT,
  duration_ms INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 7. Additional Views (security_invoker = true)
-- ============================================================================

CREATE OR REPLACE VIEW public.community_member_stats WITH (security_invoker = true) AS
SELECT
  count(DISTINCT cm.user_id)::INTEGER AS unique_members,
  count(cm.user_id)::INTEGER AS active_memberships,
  count(DISTINCT cc.chat_id)::INTEGER AS active_connected_chats
FROM public.connected_chats cc
LEFT JOIN public.chat_members cm
  ON cm.chat_id = cc.chat_id
  AND cm.status IN ('creator', 'administrator', 'member', 'restricted')
WHERE cc.is_active = true;

CREATE OR REPLACE VIEW public.effective_chat_settings WITH (security_invoker = true) AS
SELECT
  cc.chat_id,
  tc.title,
  tc.chat_type,
  coalesce(cs.locale, g.default_locale) AS locale,
  coalesce(cs.timezone, g.timezone) AS timezone,
  (g.settings || coalesce(cs.settings, '{}'::jsonb)) AS settings
FROM public.connected_chats cc
JOIN public.telegram_chats tc ON tc.chat_id = cc.chat_id
CROSS JOIN public.community_settings g
LEFT JOIN public.chat_settings cs ON cs.chat_id = cc.chat_id
WHERE cc.is_active = true
  AND g.singleton_key = 'global';

CREATE OR REPLACE VIEW public.role_permission_matrix WITH (security_invoker = true) AS
SELECT
  rd.role_key,
  rd.display_name,
  rd.priority,
  count(rp.permission_key)::INTEGER AS permission_count,
  coalesce(array_agg(rp.permission_key ORDER BY rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL), ARRAY[]::TEXT[]) AS permissions
FROM public.role_definitions rd
LEFT JOIN public.role_permissions rp ON rp.role_key = rd.role_key
GROUP BY rd.role_key, rd.display_name, rd.priority
ORDER BY rd.priority DESC;

-- ============================================================================
-- 8. Row Level Security + Service Role Grants
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'join_requests', 'rule_category_content', 'rule_publication_runs', 'rule_publications',
    'moderation_case_rules', 'moderation_evidence_uploads', 'moderation_evidence_items',
    'moderation_notification_tasks', 'moderation_enforcement_runs',
    'moderation_enforcement_targets', 'moderation_enforcement_attempts',
    'broadcast_campaigns', 'broadcast_targets', 'broadcast_attempts',
    'telegram_user_erasures', 'scheduled_jobs', 'scheduled_job_runs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS deny_exposed_api_roles ON public.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY deny_exposed_api_roles ON public.%I FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);',
      tbl
    );
  END LOOP;
END $$;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
