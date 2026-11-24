-- Initial Supabase Schema for tcbot-hono
-- Aligned with legacy tcbot PostgreSQL schema (tcbot-hono/docs/legacy/03-database-schema-and-sql.md)

-- ============================================================================
-- 1. Identity & Group Registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_users (
  user_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  erased_at TIMESTAMPTZ,
  erasure_reason TEXT
);

CREATE INDEX IF NOT EXISTS ix_telegram_users_username ON public.telegram_users (username);
CREATE INDEX IF NOT EXISTS ix_telegram_users_username_lower ON public.telegram_users (lower(username) text_pattern_ops);
CREATE INDEX IF NOT EXISTS ix_telegram_users_first_name_lower ON public.telegram_users (lower(first_name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS ix_telegram_users_last_seen ON public.telegram_users (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.telegram_chats (
  chat_id BIGINT PRIMARY KEY,
  chat_type TEXT NOT NULL DEFAULT 'unknown'
    CONSTRAINT ck_telegram_chats_chat_type CHECK (chat_type IN ('private', 'group', 'supergroup', 'channel', 'unknown')),
  title TEXT,
  username TEXT,
  description TEXT,
  is_forum BOOLEAN NOT NULL DEFAULT false,
  linked_chat_id BIGINT REFERENCES public.telegram_chats (chat_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_telegram_chats_username ON public.telegram_chats (username);
CREATE INDEX IF NOT EXISTS ix_telegram_chats_chat_type ON public.telegram_chats (chat_type);

CREATE TABLE IF NOT EXISTS public.connected_chats (
  chat_id BIGINT PRIMARY KEY REFERENCES public.telegram_chats (chat_id) ON DELETE CASCADE,
  added_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS ix_connected_chats_active ON public.connected_chats (is_active);
CREATE INDEX IF NOT EXISTS ix_connected_chats_added_by ON public.connected_chats (added_by_user_id);

CREATE TABLE IF NOT EXISTS public.chat_members (
  chat_id BIGINT NOT NULL REFERENCES public.telegram_chats (chat_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'member'
    CONSTRAINT ck_chat_members_status CHECK (status IN ('creator', 'administrator', 'member', 'restricted', 'left', 'kicked')),
  custom_title TEXT,
  joined_at TIMESTAMPTZ,
  until_date TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_chat_members_user ON public.chat_members (user_id);
CREATE INDEX IF NOT EXISTS ix_chat_members_last_seen ON public.chat_members (last_seen_at DESC);

-- ============================================================================
-- 2. Community & Settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.community_settings (
  singleton_key TEXT PRIMARY KEY DEFAULT 'global'
    CONSTRAINT ck_community_settings_singleton CHECK (singleton_key = 'global'),
  community TEXT NOT NULL DEFAULT 'Bot',
  description TEXT,
  primary_chat_id BIGINT,
  default_locale TEXT NOT NULL DEFAULT 'en-US',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id BIGINT PRIMARY KEY REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  locale TEXT,
  timezone TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_settings (
  chat_id BIGINT PRIMARY KEY REFERENCES public.telegram_chats (chat_id) ON DELETE CASCADE,
  locale TEXT,
  timezone TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. Roles & RBAC
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.role_definitions (
  role_key TEXT PRIMARY KEY
    CONSTRAINT ck_role_definitions_key CHECK (role_key ~ '^[a-z][a-z0-9_]*$'),
  display_name TEXT NOT NULL,
  description TEXT,
  priority SMALLINT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permission_definitions (
  permission_key TEXT PRIMARY KEY
    CONSTRAINT ck_permission_definitions_key CHECK (permission_key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  resource TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_permission_definitions_resource ON public.permission_definitions (resource);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_key TEXT NOT NULL REFERENCES public.role_definitions (role_key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permission_definitions (permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE INDEX IF NOT EXISTS ix_role_permissions_permission ON public.role_permissions (permission_key);

CREATE TABLE IF NOT EXISTS public.role_assignments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  role_key TEXT NOT NULL REFERENCES public.role_definitions (role_key),
  assigned_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT ck_role_assignments_status CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_role_assignments_active_user
  ON public.role_assignments (user_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_assignments_active_owner
  ON public.role_assignments (role_key) WHERE status = 'active' AND role_key = 'owner';
CREATE INDEX IF NOT EXISTS ix_role_assignments_status ON public.role_assignments (status);

CREATE TABLE IF NOT EXISTS public.promotion_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  target_user_id BIGINT NOT NULL REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  requested_role_key TEXT NOT NULL REFERENCES public.role_definitions (role_key),
  requested_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_promotion_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  decision_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_promotion_requests_pending_target
  ON public.promotion_requests (target_user_id) WHERE status = 'pending';

-- ============================================================================
-- 4. Rules & Publications
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rule_sets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope_type TEXT NOT NULL CONSTRAINT ck_rule_sets_scope CHECK (scope_type IN ('community', 'chat')),
  chat_id BIGINT REFERENCES public.connected_chats (chat_id) ON DELETE CASCADE,
  rule_set_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_rule_sets_scope_chat CHECK (
    (scope_type = 'community' AND chat_id IS NULL) OR
    (scope_type = 'chat' AND chat_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.rule_set_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id BIGINT NOT NULL REFERENCES public.rule_sets (id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en-US',
  status TEXT NOT NULL DEFAULT 'draft'
    CONSTRAINT ck_rule_set_versions_status CHECK (status IN ('draft', 'published', 'superseded', 'archived')),
  change_summary TEXT,
  created_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  published_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rule_set_versions_number UNIQUE (rule_set_id, locale, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_set_versions_published
  ON public.rule_set_versions (rule_set_id, locale) WHERE status = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_set_versions_draft
  ON public.rule_set_versions (rule_set_id, locale) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS public.rule_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_id BIGINT NOT NULL REFERENCES public.rule_sets (id) ON DELETE CASCADE,
  category_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rule_categories_set_key UNIQUE (rule_set_id, category_key)
);

CREATE TABLE IF NOT EXISTS public.rule_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_version_id BIGINT NOT NULL REFERENCES public.rule_set_versions (id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  category_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'plain_text'
    CONSTRAINT ck_rule_items_content_format CHECK (content_format IN ('plain_text', 'markdown')),
  category_title TEXT,
  category_sort_order INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  reference_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rule_items_version_key UNIQUE (rule_set_version_id, rule_key)
);

CREATE TABLE IF NOT EXISTS public.rule_acknowledgements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_set_version_id BIGINT NOT NULL REFERENCES public.rule_set_versions (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  context_chat_id BIGINT,
  acknowledgement_method TEXT NOT NULL DEFAULT 'inline_button'
    CONSTRAINT ck_rule_acknowledgements_method CHECK (acknowledgement_method IN ('inline_button', 'command', 'join_gate', 'admin_recorded', 'api')),
  telegram_message_id BIGINT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_rule_acknowledgements_version_user UNIQUE (rule_set_version_id, user_id)
);

-- ============================================================================
-- 5. Moderation, Cases, Evidence, Appeals & Audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  subject_user_id BIGINT NOT NULL REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  case_type TEXT NOT NULL DEFAULT 'rule_violation',
  title TEXT,
  summary TEXT,
  severity TEXT NOT NULL DEFAULT 'unknown'
    CONSTRAINT ck_moderation_cases_severity CHECK (severity IN ('unknown', 'low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CONSTRAINT ck_moderation_cases_status CHECK (status IN ('open', 'collecting_evidence', 'evidence_failed', 'under_review', 'escalated', 'resolved', 'dismissed', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'manual'
    CONSTRAINT ck_moderation_cases_source CHECK (source IN ('manual', 'system', 'automated', 'ai')),
  opened_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  assigned_to_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  closed_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  requires_evidence BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES public.telegram_chats (chat_id) ON DELETE CASCADE,
  action_type TEXT NOT NULL
    CONSTRAINT ck_moderation_actions_type CHECK (action_type IN ('warn', 'mute', 'ban', 'kick')),
  target_user_id BIGINT NOT NULL REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  reason TEXT,
  duration_seconds BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT ck_moderation_actions_status CHECK (status IN ('active', 'completed', 'revoked', 'expired', 'superseded', 'failed')),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  external_ref TEXT NOT NULL DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  case_id BIGINT REFERENCES public.moderation_cases (id) ON DELETE SET NULL,
  supersedes_action_id BIGINT REFERENCES public.moderation_actions (id) ON DELETE SET NULL,
  action_origin TEXT NOT NULL DEFAULT 'manual'
    CONSTRAINT ck_moderation_actions_origin CHECK (action_origin IN ('manual', 'system', 'automated', 'ai')),
  scope_type TEXT NOT NULL DEFAULT 'community'
    CONSTRAINT ck_moderation_actions_scope CHECK (scope_type IN ('community', 'chat')),
  origin_chat_id BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_moderation_actions_active_ban
  ON public.moderation_actions (target_user_id) WHERE action_type = 'ban' AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_moderation_actions_active_mute
  ON public.moderation_actions (target_user_id) WHERE action_type = 'mute' AND status = 'active';
CREATE INDEX IF NOT EXISTS ix_moderation_actions_target ON public.moderation_actions (target_user_id, action_type, status);
CREATE INDEX IF NOT EXISTS ix_moderation_actions_external_ref ON public.moderation_actions (external_ref);

CREATE TABLE IF NOT EXISTS public.moderation_appeals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_id BIGINT NOT NULL REFERENCES public.moderation_actions (id) ON DELETE CASCADE,
  appellant_user_id BIGINT NOT NULL REFERENCES public.telegram_users (user_id) ON DELETE CASCADE,
  appeal_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT ck_moderation_appeals_status CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  reviewed_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  decision_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_moderation_appeals_pending
  ON public.moderation_appeals (action_id, appellant_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_moderation_appeals_status ON public.moderation_appeals (status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action_id BIGINT NOT NULL REFERENCES public.moderation_actions (id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  message_kind TEXT NOT NULL
    CONSTRAINT ck_moderation_messages_kind CHECK (message_kind IN ('log', 'review', 'appeal_log', 'notice')),
  recorded_by_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  subject_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  event_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  case_id BIGINT REFERENCES public.moderation_cases (id) ON DELETE SET NULL,
  action_id BIGINT REFERENCES public.moderation_actions (id) ON DELETE SET NULL,
  correlation_id TEXT,
  operation_id TEXT
);

CREATE INDEX IF NOT EXISTS ix_audit_events_occurred ON public.audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_events_entity ON public.audit_events (entity_type, entity_id);

-- ============================================================================
-- 6. Views (security_invoker = true)
-- ============================================================================

CREATE OR REPLACE VIEW public.active_bans WITH (security_invoker = true) AS
SELECT
  id AS ban_action_id,
  external_ref AS ban_id,
  scope_type,
  chat_id,
  origin_chat_id,
  target_user_id AS banned_user_id,
  actor_user_id AS admin_user_id,
  reason,
  created_at AS timestamp,
  expires_at AS until_date,
  duration_seconds,
  metadata
FROM public.moderation_actions
WHERE action_type = 'ban'
  AND status = 'active'
  AND (expires_at IS NULL OR expires_at > now());

CREATE OR REPLACE VIEW public.active_mutes WITH (security_invoker = true) AS
SELECT
  id AS mute_action_id,
  external_ref AS mute_id,
  scope_type,
  chat_id,
  origin_chat_id,
  target_user_id AS muted_user_id,
  actor_user_id AS admin_user_id,
  reason,
  created_at AS timestamp,
  expires_at AS until_date,
  duration_seconds,
  metadata
FROM public.moderation_actions
WHERE action_type = 'mute'
  AND status = 'active'
  AND (expires_at IS NULL OR expires_at > now());

CREATE OR REPLACE VIEW public.warn_counts WITH (security_invoker = true) AS
SELECT
  chat_id,
  target_user_id,
  count(*)::INTEGER AS active_warn_count
FROM public.moderation_actions
WHERE action_type = 'warn'
  AND status = 'completed'
  AND (expires_at IS NULL OR expires_at > now())
GROUP BY chat_id, target_user_id;

-- ============================================================================
-- 7. Row Level Security (Deny Exposed API Roles; Worker uses secret/service_role)
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'telegram_users', 'telegram_chats', 'connected_chats', 'chat_members',
    'community_settings', 'user_settings', 'chat_settings',
    'role_definitions', 'permission_definitions', 'role_permissions',
    'role_assignments', 'promotion_requests',
    'rule_sets', 'rule_set_versions', 'rule_categories', 'rule_items',
    'rule_acknowledgements', 'moderation_cases', 'moderation_actions',
    'moderation_appeals', 'moderation_messages', 'audit_events'
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

-- ============================================================================
-- 8. Seed Data (Community Singleton & RBAC Roles/Permissions)
-- ============================================================================

INSERT INTO public.community_settings (singleton_key, community, default_locale, timezone)
VALUES ('global', 'Bot', 'en-US', 'UTC')
ON CONFLICT (singleton_key) DO NOTHING;

INSERT INTO public.role_definitions (role_key, display_name, description, priority, is_system)
VALUES
  ('owner', 'Owner', 'Federation owner with full authority', 100, true),
  ('admin', 'Admin', 'Senior administrator', 80, true),
  ('developer', 'Developer', 'Technical staff with moderation access', 60, true),
  ('moderator', 'Moderator', 'Community moderator', 40, true)
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO public.permission_definitions (permission_key, resource, description)
VALUES
  ('moderation.ban', 'moderation', 'Ban users across the federation'),
  ('moderation.unban', 'moderation', 'Unban users and review appeals'),
  ('moderation.mute', 'moderation', 'Mute users across the federation'),
  ('moderation.unmute', 'moderation', 'Unmute users'),
  ('moderation.warn', 'moderation', 'Warn users in connected chats'),
  ('moderation.kick', 'moderation', 'Kick users from chats'),
  ('moderation.check', 'moderation', 'Inspect moderation records'),
  ('rules.manage', 'rules', 'Create, edit, and publish rule sets'),
  ('groups.manage', 'groups', 'Connect and manage federation groups'),
  ('roles.manage', 'roles', 'Promote, demote, and assign staff roles'),
  ('community.broadcast', 'community', 'Broadcast announcements to active groups'),
  ('audit.read', 'audit', 'View audit logs and federation stats')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'owner', permission_key FROM public.permission_definitions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'admin', permission_key FROM public.permission_definitions
WHERE permission_key IN (
  'moderation.ban', 'moderation.unban', 'moderation.mute', 'moderation.unmute',
  'moderation.warn', 'moderation.kick', 'moderation.check',
  'rules.manage', 'groups.manage', 'community.broadcast', 'audit.read'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'developer', permission_key FROM public.permission_definitions
WHERE permission_key IN (
  'moderation.ban', 'moderation.mute', 'moderation.unmute',
  'moderation.warn', 'moderation.kick', 'moderation.check',
  'rules.manage', 'audit.read'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, permission_key)
SELECT 'moderator', permission_key FROM public.permission_definitions
WHERE permission_key IN (
  'moderation.ban', 'moderation.mute', 'moderation.unmute',
  'moderation.warn', 'moderation.kick', 'moderation.check'
)
ON CONFLICT DO NOTHING;
