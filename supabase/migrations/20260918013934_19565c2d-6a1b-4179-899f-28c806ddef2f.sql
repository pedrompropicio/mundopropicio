-- ============================================================
-- Complemento do backup: infraestrutura e identidades (#206)
-- Ambas as funções são chamadas APENAS pela invocação GLOBAL da
-- edge function database-backup, com a service role key.
-- ============================================================

CREATE OR REPLACE FUNCTION public.backup_infra_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_crons jsonb;
  v_buckets jsonb;
  v_pols jsonb;
  v_ext jsonb;
  v_migs jsonb;
  v_secrets jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.jobid), '[]'::jsonb) INTO v_crons
  FROM (
    SELECT jobid, jobname, schedule, active, command, nodename, database, username
      FROM cron.job
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id), '[]'::jsonb) INTO v_buckets
  FROM (
    SELECT id, public, file_size_limit, allowed_mime_types, created_at
      FROM storage.buckets
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.tabela, x.nome), '[]'::jsonb) INTO v_pols
  FROM (
    SELECT c.relname                                    AS tabela,
           p.polname                                    AS nome,
           p.polpermissive                              AS permissiva,
           p.polcmd::text                               AS comando,
           (SELECT coalesce(array_agg(r.rolname::text), ARRAY[]::text[])
              FROM pg_roles r WHERE r.oid = ANY (p.polroles)) AS roles,
           pg_get_expr(p.polqual, p.polrelid)           AS expressao,
           pg_get_expr(p.polwithcheck, p.polrelid)      AS expressao_check
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'storage'
       AND c.relname IN ('objects', 'buckets')
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.nome), '[]'::jsonb) INTO v_ext
  FROM (
    SELECT e.extname AS nome, e.extversion AS versao, n.nspname AS schema_name
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
  ) x;

  SELECT coalesce(jsonb_agg(version ORDER BY version), '[]'::jsonb) INTO v_migs
  FROM supabase_migrations.schema_migrations;

  -- SEGREDOS: apenas o INVENTÁRIO (nome/descrição/data). NUNCA o valor.
  -- Proibido usar vault.decrypted_secrets ou a coluna secret aqui.
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name), '[]'::jsonb) INTO v_secrets
  FROM (
    SELECT name, description, created_at FROM vault.secrets
  ) x;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'crons', v_crons,
    'buckets', v_buckets,
    'politicas_storage', v_pols,
    'extensoes', v_ext,
    'migracoes', v_migs,
    'migracoes_count', jsonb_array_length(v_migs),
    'segredos_vault', v_secrets,
    'contagens', jsonb_build_object(
      'crons', jsonb_array_length(v_crons),
      'buckets', jsonb_array_length(v_buckets),
      'politicas_storage', jsonb_array_length(v_pols),
      'extensoes', jsonb_array_length(v_ext),
      'migracoes', jsonb_array_length(v_migs),
      'segredos_vault', jsonb_array_length(v_secrets)
    )
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.backup_infra_snapshot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backup_infra_snapshot() FROM anon;
REVOKE EXECUTE ON FUNCTION public.backup_infra_snapshot() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.backup_infra_snapshot() TO service_role;

-- ============================================================
-- Identidades: inventário de contas para reposição de acesso.
--
-- PROIBIDO devolver, e é deliberado que não estão aqui:
--   encrypted_password, confirmation_token, recovery_token,
--   email_change_token_new, email_change_token_current,
--   reauthentication_token, e o identity_data inteiro
--   (pode conter tokens do fornecedor de OAuth).
-- A recuperação de acesso faz-se por reposição de palavra-passe
-- forçada, NUNCA por reposição de hash.
-- ============================================================
CREATE OR REPLACE FUNCTION public.backup_identities_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_users jsonb;
  v_ids jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) INTO v_users
  FROM (
    SELECT id, email, phone, created_at, last_sign_in_at,
           email_confirmed_at, banned_until, is_sso_user, raw_app_meta_data
      FROM auth.users
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb) INTO v_ids
  FROM (
    SELECT user_id, provider, provider_id, created_at, last_sign_in_at
      FROM auth.identities
  ) x;

  RETURN jsonb_build_object(
    'gerado_em', now(),
    'utilizadores', v_users,
    'identidades', v_ids,
    'contagens', jsonb_build_object(
      'utilizadores', jsonb_array_length(v_users),
      'identidades', jsonb_array_length(v_ids)
    ),
    'aviso', 'Sem hashes de palavra-passe e sem tokens. Recuperar acesso por reposição de palavra-passe forçada.'
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.backup_identities_snapshot() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backup_identities_snapshot() FROM anon;
REVOKE EXECUTE ON FUNCTION public.backup_identities_snapshot() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.backup_identities_snapshot() TO service_role;