-- #333 fase11b — INERTE. NÃO aplicar sem "Sim" do Pedro. Ligação Gmail por utilizador+empresa.
-- Só o servidor (service_role) lê/escreve. Browser (anon/authenticated) sem qualquer acesso.
-- A chave de ligação é guardada só cifrada (AES-GCM, AAD user:empresa); nunca em claro.
BEGIN;
CREATE TABLE public.data_entry_gmail_connections (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  connection_key_ciphertext text NOT NULL CHECK (length(connection_key_ciphertext) BETWEEN 40 AND 4096),
  reconnect_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);
CREATE TABLE public.data_entry_gmail_pending (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  nonce_sha256 text NOT NULL CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (nonce_sha256),
  CHECK (expires_at <= created_at + interval '15 minutes')
);
CREATE INDEX data_entry_gmail_pending_owner ON public.data_entry_gmail_pending (user_id, company_id);
ALTER TABLE public.data_entry_gmail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_entry_gmail_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_entry_gmail_connections, public.data_entry_gmail_pending FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_entry_gmail_connections TO service_role;
GRANT INSERT, DELETE ON public.data_entry_gmail_pending TO service_role;
GRANT SELECT (nonce_sha256, expires_at, user_id, company_id) ON public.data_entry_gmail_pending TO service_role;
COMMIT;
