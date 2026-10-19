-- #333 fase11d — registo do pacote supabase/manual/20261019_issue333_gmail_connections.INERTE.sql (sha256 4256d3dbdfa4adf46fcf212a397996efc98ecc4275f02d3e72e846dc9033ed7a), autorizado pelo Pedro 19/10/2026. Só service_role.
CREATE TABLE IF NOT EXISTS public.data_entry_gmail_connections (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  connection_key_ciphertext text NOT NULL CHECK (length(connection_key_ciphertext) BETWEEN 40 AND 4096),
  reconnect_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);
CREATE TABLE IF NOT EXISTS public.data_entry_gmail_pending (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  nonce_sha256 text NOT NULL CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (nonce_sha256),
  CHECK (expires_at <= created_at + interval '15 minutes')
);
CREATE INDEX IF NOT EXISTS data_entry_gmail_pending_owner ON public.data_entry_gmail_pending (user_id, company_id);
ALTER TABLE public.data_entry_gmail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_entry_gmail_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_entry_gmail_connections, public.data_entry_gmail_pending FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_entry_gmail_connections TO service_role;
GRANT INSERT, DELETE ON public.data_entry_gmail_pending TO service_role;
GRANT SELECT (nonce_sha256, expires_at, user_id, company_id) ON public.data_entry_gmail_pending TO service_role;
DO $$
DECLARE extra text;
BEGIN
  SELECT string_agg(grantee || ':' || privilege_type, ',') INTO extra
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name LIKE 'data_entry_gmail%'
    AND grantee IN ('anon', 'authenticated', 'authenticator', 'PUBLIC');
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'ACL inesperada em data_entry_gmail_*: %', extra;
  END IF;
END $$;