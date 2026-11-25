-- Multi-admin accounts with single active superadmin constraint

CREATE TABLE IF NOT EXISTS public.admin_accounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'
    CONSTRAINT ck_admin_accounts_role CHECK (role IN ('superadmin', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  token_version INTEGER NOT NULL DEFAULT 1,
  telegram_user_id BIGINT REFERENCES public.telegram_users (user_id) ON DELETE SET NULL,
  created_by_admin_id BIGINT REFERENCES public.admin_accounts (id) ON DELETE SET NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_accounts_single_superadmin
  ON public.admin_accounts (role)
  WHERE role = 'superadmin' AND is_active = true;

CREATE INDEX IF NOT EXISTS ix_admin_accounts_role_active
  ON public.admin_accounts (role, is_active);

GRANT ALL PRIVILEGES ON TABLE public.admin_accounts TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
