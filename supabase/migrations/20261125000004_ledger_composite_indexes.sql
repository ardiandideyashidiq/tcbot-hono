-- Composite indexes matching ledger pagination & sort patterns (supabase-postgres-best-practices)

CREATE INDEX IF NOT EXISTS ix_moderation_appeals_submitted_desc
  ON public.moderation_appeals (submitted_at DESC);

CREATE INDEX IF NOT EXISTS ix_moderation_actions_type_created_desc
  ON public.moderation_actions (action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_connected_chats_added_desc
  ON public.connected_chats (added_at DESC);

CREATE INDEX IF NOT EXISTS ix_rule_items_version_sort
  ON public.rule_items (version_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS ix_role_assignments_status_assigned_desc
  ON public.role_assignments (status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS ix_role_assignments_assigned_desc
  ON public.role_assignments (assigned_at DESC);
