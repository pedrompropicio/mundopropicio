-- Tabela de secrets em schema public, alternativa robusta ao Vault para edge functions
-- chamadas via PostgREST com sb_secret_* keys (Vault decrypted_secrets retorna NULL
-- silenciosamente nesse contexto). RLS bloqueia acesso directo; SECDEF function expõe.

CREATE TABLE IF NOT EXISTS public.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.app_secrets FROM PUBLIC;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_secrets TO service_role, postgres;

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy → ninguém vê via PostgREST excepto service_role (bypassRLS)

-- Função wrapper para edge functions lerem o secret
CREATE OR REPLACE FUNCTION public.get_app_secret(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v text;
BEGIN
  SELECT value INTO v FROM public.app_secrets WHERE name = _name LIMIT 1;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.get_app_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_secret(text) TO anon, authenticated, service_role, postgres;