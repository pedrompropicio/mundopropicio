-- #203 — restauro completo atómico: área de carga + aplicação transaccional.

-- 1) Os dois ciclos de FKs passam a adiáveis (comportamento normal inalterado).
ALTER TABLE public.transactions        ALTER CONSTRAINT transactions_forecast_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.event_forecasts     ALTER CONSTRAINT event_forecasts_transaction_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.transactions        ALTER CONSTRAINT transactions_settlement_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.ticket_office_settlements ALTER CONSTRAINT ticket_office_settlements_transfer_transaction_id_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.ticket_office_settlements ALTER CONSTRAINT ticket_office_settlements_venue_retained_invoice_id_fkey DEFERRABLE INITIALLY IMMEDIATE;

-- 2) backup_runs aceita as corridas de restauro.
ALTER TABLE public.backup_runs DROP CONSTRAINT IF EXISTS backup_runs_scope_check;
ALTER TABLE public.backup_runs ADD CONSTRAINT backup_runs_scope_check
  CHECK (scope = ANY (ARRAY['company','global','restore','restore_test']));

-- 3) Área de carga.
CREATE SCHEMA IF NOT EXISTS restore_shadow;
REVOKE ALL ON SCHEMA restore_shadow FROM PUBLIC;
REVOKE ALL ON SCHEMA restore_shadow FROM anon, authenticated;

-- Resolve a chave do manifesto ("crm.x" ou "x") em schema/tabela/sombra.
CREATE OR REPLACE FUNCTION public.restore_shadow_ref(p_key text)
RETURNS TABLE (sch text, tbl text, shadow text)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT s, t, s || '__' || t
  FROM (SELECT CASE WHEN p_key LIKE 'crm.%' THEN 'crm' ELSE 'public' END AS s,
               CASE WHEN p_key LIKE 'crm.%' THEN substr(p_key, 5) ELSE p_key END AS t) x;
$$;

-- Ordem topológica (filhas depois dos pais). Ciclos vão no fim: as FKs adiadas resolvem.
CREATE OR REPLACE FUNCTION public.restore_topo_order(p_tables text[])
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order text[] := '{}';
  v_rem text[] := p_tables;
  k text;
  v_progress boolean;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _restore_deps (child text, parent text) ON COMMIT DROP;
  DELETE FROM _restore_deps;
  INSERT INTO _restore_deps (child, parent)
  SELECT DISTINCT
    CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END,
    CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END
  FROM pg_constraint c
  JOIN pg_class cc ON cc.oid = c.conrelid
  JOIN pg_namespace cn ON cn.oid = cc.relnamespace
  JOIN pg_class pc ON pc.oid = c.confrelid
  JOIN pg_namespace pn ON pn.oid = pc.relnamespace
  WHERE c.contype = 'f'
    AND c.conrelid <> c.confrelid
    AND (CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END) = ANY (p_tables)
    AND (CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END) = ANY (p_tables);

  LOOP
    EXIT WHEN array_length(v_rem, 1) IS NULL;
    v_progress := false;
    FOREACH k IN ARRAY v_rem LOOP
      IF NOT EXISTS (SELECT 1 FROM _restore_deps d WHERE d.child = k AND d.parent = ANY (v_rem)) THEN
        v_order := v_order || k;
        v_rem := array_remove(v_rem, k);
        v_progress := true;
      END IF;
    END LOOP;
    IF NOT v_progress THEN
      v_order := v_order || v_rem;   -- ciclo remanescente
      EXIT;
    END IF;
  END LOOP;
  RETURN v_order;
END $$;

-- Cria as sombras com as colunas de HOJE, sem constraints, sem triggers, sem índices.
CREATE OR REPLACE FUNCTION public.restore_shadow_prepare(p_tables text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; r record; v_out jsonb := '{}'::jsonb; v_cols text[];
BEGIN
  FOREACH k IN ARRAY p_tables LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = r.sch AND table_name = r.tbl) THEN
      RAISE EXCEPTION 'restore_shadow_prepare: tabela % não existe em produção', k;
    END IF;
    EXECUTE format('DROP TABLE IF EXISTS restore_shadow.%I', r.shadow);
    EXECUTE format('CREATE TABLE restore_shadow.%I (LIKE %I.%I INCLUDING DEFAULTS)', r.shadow, r.sch, r.tbl);
    SELECT array_agg(column_name::text ORDER BY ordinal_position) INTO v_cols
      FROM information_schema.columns
      WHERE table_schema = 'restore_shadow' AND table_name = r.shadow;
    v_out := v_out || jsonb_build_object(k, to_jsonb(v_cols));
  END LOOP;
  RETURN v_out;
END $$;

-- Carrega um lote na sombra. Colunas que já não existem são removidas AQUI,
-- contra as colunas da sombra (nunca por amostra de linha), e devolvidas.
CREATE OR REPLACE FUNCTION public.restore_shadow_load(p_table text, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_unknown text[]; v_n bigint;
BEGIN
  SELECT * INTO r FROM public.restore_shadow_ref(p_table);
  IF to_regclass('restore_shadow.' || quote_ident(r.shadow)) IS NULL THEN
    RAISE EXCEPTION 'restore_shadow_load: sombra inexistente para %', p_table;
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'restore_shadow_load: p_rows tem de ser um array jsonb';
  END IF;

  SELECT array_agg(DISTINCT kk) INTO v_unknown
  FROM jsonb_array_elements(p_rows) e, jsonb_object_keys(e.value) kk
  WHERE kk NOT IN (SELECT column_name FROM information_schema.columns
                   WHERE table_schema = 'restore_shadow' AND table_name = r.shadow);

  EXECUTE format(
    'INSERT INTO restore_shadow.%I SELECT * FROM jsonb_populate_recordset(NULL::restore_shadow.%I, $1)',
    r.shadow, r.shadow) USING p_rows;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('inserted', v_n, 'unknown_cols', COALESCE(to_jsonb(v_unknown), '[]'::jsonb));
END $$;

-- Validação: contagens, FKs e company_id. Sem tocar em produção.
CREATE OR REPLACE FUNCTION public.restore_shadow_validate(
  p_scope text, p_company_id uuid, p_tables text[], p_counts jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k text; r record; fk record; v_errors jsonb := '[]'::jsonb; v_counts jsonb := '{}'::jsonb;
  v_n bigint; v_exp bigint; v_bad bigint; v_parent text; v_skipped jsonb := '[]'::jsonb;
  v_fk_checked int := 0;
BEGIN
  FOREACH k IN ARRAY p_tables LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    EXECUTE format('SELECT count(*) FROM restore_shadow.%I', r.shadow) INTO v_n;
    v_counts := v_counts || jsonb_build_object(k, v_n);
    v_exp := COALESCE((p_counts ->> k)::bigint, 0);
    IF v_n <> v_exp THEN
      v_errors := v_errors || jsonb_build_object('table', k, 'kind', 'count',
        'detail', format('sombra tem %s linhas, manifesto diz %s', v_n, v_exp));
    END IF;

    IF p_scope = 'company' AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'restore_shadow' AND table_name = r.shadow AND column_name = 'company_id') THEN
      EXECUTE format('SELECT count(*) FROM restore_shadow.%I WHERE company_id IS DISTINCT FROM $1', r.shadow)
        INTO v_bad USING p_company_id;
      IF v_bad > 0 THEN
        v_errors := v_errors || jsonb_build_object('table', k, 'kind', 'company_id',
          'detail', format('%s linhas com company_id diferente de %s', v_bad, p_company_id));
      END IF;
    END IF;
  END LOOP;

  FOR fk IN
    SELECT c.conname,
           CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END AS child_key,
           CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END AS parent_key,
           pn.nspname AS p_sch, pc.relname AS p_tbl,
           array_length(c.conkey, 1) AS ncols,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS child_col,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1]) AS parent_col
    FROM pg_constraint c
    JOIN pg_class cc ON cc.oid = c.conrelid
    JOIN pg_namespace cn ON cn.oid = cc.relnamespace
    JOIN pg_class pc ON pc.oid = c.confrelid
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE c.contype = 'f'
      AND (CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END) = ANY (p_tables)
  LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(fk.child_key);
    IF fk.ncols > 1 THEN
      v_skipped := v_skipped || jsonb_build_object('constraint', fk.conname, 'reason', 'FK multi-coluna');
      CONTINUE;
    END IF;
    IF fk.parent_key = ANY (p_tables) THEN
      v_parent := 'restore_shadow.' || quote_ident((SELECT shadow FROM public.restore_shadow_ref(fk.parent_key)));
    ELSE
      v_parent := quote_ident(fk.p_sch) || '.' || quote_ident(fk.p_tbl);
    END IF;
    EXECUTE format(
      'SELECT count(*) FROM restore_shadow.%I c WHERE c.%I IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I)',
      r.shadow, fk.child_col, v_parent, fk.parent_col, fk.child_col) INTO v_bad;
    v_fk_checked := v_fk_checked + 1;
    IF v_bad > 0 THEN
      v_errors := v_errors || jsonb_build_object('table', fk.child_key, 'kind', 'fk',
        'detail', format('%s: %s valores sem pai em %s', fk.conname, v_bad, v_parent));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'tables', array_length(p_tables, 1),
    'fks_checked', v_fk_checked,
    'fks_skipped', v_skipped,
    'counts', v_counts,
    'errors', v_errors);
END $$;

-- A FUNÇÃO É A TRANSAÇÃO: ou entra tudo, ou a produção nunca mudou.
CREATE OR REPLACE FUNCTION public.restore_apply_from_shadow(
  p_scope text, p_company_id uuid, p_tables text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order text[]; k text; r record; v_cols text[]; v_list text;
  v_inserted jsonb := '{}'::jsonb; v_deleted jsonb := '{}'::jsonb; v_n bigint; i int;
BEGIN
  IF p_scope NOT IN ('company','global') THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_scope tem de ser company ou global';
  END IF;
  IF p_scope = 'company' AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_company_id obrigatório em scope company';
  END IF;
  IF p_tables IS NULL OR array_length(p_tables, 1) IS NULL THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_tables vazio';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;
  v_order := public.restore_topo_order(p_tables);

  -- Triggers de utilizador desligados durante a troca.
  FOREACH k IN ARRAY v_order LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    IF to_regclass('restore_shadow.' || quote_ident(r.shadow)) IS NULL THEN
      RAISE EXCEPTION 'restore_apply_from_shadow: sombra inexistente para %', k;
    END IF;
    EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER USER', r.sch, r.tbl);
  END LOOP;

  -- Apagar por ordem inversa.
  FOR i IN REVERSE array_length(v_order, 1) .. 1 LOOP
    k := v_order[i];
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    IF p_scope = 'company' THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = r.sch AND table_name = r.tbl AND column_name = 'company_id') THEN
        EXECUTE format('DELETE FROM %I.%I WHERE company_id = $1', r.sch, r.tbl) USING p_company_id;
      ELSE
        RAISE EXCEPTION 'restore_apply_from_shadow: % não tem company_id e o scope é company', k;
      END IF;
    ELSE
      EXECUTE format('DELETE FROM %I.%I', r.sch, r.tbl);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object(k, v_n);
  END LOOP;

  -- Inserir por ordem topológica, com lista de colunas explícita.
  FOREACH k IN ARRAY v_order LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    SELECT array_agg(p.column_name::text ORDER BY p.ordinal_position) INTO v_cols
      FROM information_schema.columns p
      WHERE p.table_schema = r.sch AND p.table_name = r.tbl
        AND EXISTS (SELECT 1 FROM information_schema.columns s
                    WHERE s.table_schema = 'restore_shadow' AND s.table_name = r.shadow
                      AND s.column_name = p.column_name);
    IF v_cols IS NULL THEN
      RAISE EXCEPTION 'restore_apply_from_shadow: sem colunas comuns em %', k;
    END IF;
    SELECT string_agg(quote_ident(c), ', ') INTO v_list FROM unnest(v_cols) c;
    EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM restore_shadow.%I',
                   r.sch, r.tbl, v_list, v_list, r.shadow);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_inserted := v_inserted || jsonb_build_object(k, v_n);
  END LOOP;

  FOREACH k IN ARRAY v_order LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER USER', r.sch, r.tbl);
  END LOOP;

  -- É aqui que as FKs adiadas se verificam. Falha = a transação inteira desfaz-se.
  SET CONSTRAINTS ALL IMMEDIATE;

  RETURN jsonb_build_object(
    'ok', true, 'scope', p_scope, 'company_id', p_company_id,
    'order', to_jsonb(v_order), 'deleted', v_deleted, 'inserted', v_inserted);
END $$;

CREATE OR REPLACE FUNCTION public.restore_shadow_cleanup(p_tables text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; r record; n int := 0;
BEGIN
  FOREACH k IN ARRAY COALESCE(p_tables, '{}'::text[]) LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    IF to_regclass('restore_shadow.' || quote_ident(r.shadow)) IS NOT NULL THEN
      EXECUTE format('DROP TABLE restore_shadow.%I', r.shadow);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- Só a máquina.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.restore_shadow_ref(text)',
    'public.restore_topo_order(text[])',
    'public.restore_shadow_prepare(text[])',
    'public.restore_shadow_load(text, jsonb)',
    'public.restore_shadow_validate(text, uuid, text[], jsonb)',
    'public.restore_apply_from_shadow(text, uuid, text[])',
    'public.restore_shadow_cleanup(text[])'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;