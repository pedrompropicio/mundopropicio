-- #333 fase11b/11c — INERTE. NÃO aplicar sem "Sim" do Pedro. Ligação Gmail por utilizador+empresa.
-- Só o servidor (service_role) lê/escreve. Browser (anon/authenticated) e roles técnicas sem qualquer acesso.
-- A chave de ligação é guardada só cifrada (AES-GCM, AAD user:empresa); nunca em claro.
-- Idempotente: pode ser re-executado sem efeito (IF NOT EXISTS; GRANT/REVOKE são idempotentes).
-- Nonces expirados ficam inertes (o consumo exige expires_at > now()); limpeza é opcional e manual.
BEGIN;
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
-- ACL real: revogar de PUBLIC e de TODAS as roles técnicas que o PostgREST/gateway usam,
-- não só anon/authenticated (lição do incidente ACL da #333).
REVOKE ALL ON public.data_entry_gmail_connections, public.data_entry_gmail_pending FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_entry_gmail_connections TO service_role;
GRANT INSERT, DELETE ON public.data_entry_gmail_pending TO service_role;
GRANT SELECT (nonce_sha256, expires_at, user_id, company_id) ON public.data_entry_gmail_pending TO service_role;
-- fase11d: privilégios por defeito da plataforma (ex.: roles técnicas sandbox_exec*) dão grants
-- automáticos a tabelas novas. Revogar SÓ nestas duas tabelas qualquer grantee ≠ dono/service_role.
DO $$
DECLARE t text; r regrole;
BEGIN
  FOREACH t IN ARRAY ARRAY['data_entry_gmail_connections','data_entry_gmail_pending'] LOOP
    FOR r IN SELECT DISTINCT x.grantee::regrole FROM pg_class c
             CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
             WHERE c.oid = ('public.' || t)::regclass AND x.grantee <> 0 AND x.grantee <> c.relowner AND x.grantee <> 'service_role'::regrole LOOP
      EXECUTE format('REVOKE ALL ON public.%I FROM %s', t, r);
    END LOOP;
  END LOOP;
END $$;
-- Guarda de catálogo (tabela + colunas, PUBLIC incluído): falha se sobrar grantee ≠ dono/service_role.
DO $$
DECLARE extra text;
BEGIN
  SELECT string_agg(DISTINCT c.relname || ':' || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END, ',') INTO extra
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  WHERE c.oid IN ('public.data_entry_gmail_connections'::regclass, 'public.data_entry_gmail_pending'::regclass)
    AND x.grantee <> c.relowner AND (x.grantee = 0 OR x.grantee <> 'service_role'::regrole);
  IF extra IS NULL THEN
    SELECT string_agg(DISTINCT c.relname || '.' || a.attname || ':' || CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END, ',') INTO extra
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attacl IS NOT NULL
    CROSS JOIN LATERAL aclexplode(a.attacl) x
    WHERE c.oid IN ('public.data_entry_gmail_connections'::regclass, 'public.data_entry_gmail_pending'::regclass)
      AND x.grantee <> c.relowner AND (x.grantee = 0 OR x.grantee <> 'service_role'::regrole);
  END IF;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'ACL inesperada em data_entry_gmail_*: %', extra;
  END IF;
END $$;
COMMIT;
