-- #486 D1 — R2 PREPARADO, NÃO APLICADO. Não executar automaticamente.
-- Entrega parcial: persistência, plano, prévia canónica e reimportação.
-- Generate/revert NÃO estão disponíveis; ver docs/testes/issue486/contrato-d1.md.
-- Sem backfill, sem SQL externo, sem Storage. Rollback integralmente comentado
-- em supabase/manual/rollback_0305_issue486_ads_invoice_generation.sql.
BEGIN;
DO $$ BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'installation_owner_must_be_postgres';
  END IF;
END $$;

ALTER TABLE public.ads_invoice
  ADD COLUMN generation_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN generation_cycle bigint NOT NULL DEFAULT 0,
  ADD COLUMN generation_plan jsonb,
  ADD COLUMN generation_contract_version integer,
  ADD CONSTRAINT ads486_invoice_id_company UNIQUE (id,company_id),
  ADD CONSTRAINT ads_invoice_generation_v1_shape CHECK (
    generation_revision >= 0 AND generation_cycle >= 0 AND
    ((generation_contract_version IS NULL AND generation_plan IS NULL) OR
     (generation_contract_version IS NOT DISTINCT FROM 1 AND generation_plan IS NOT NULL AND
      jsonb_typeof(generation_plan) = 'object' AND generation_plan->'version' IS NOT DISTINCT FROM '1'::jsonb))
  );
COMMENT ON COLUMN public.ads_invoice.generation_plan IS
  '#486 v1: escolhas propostas, nunca aceites. NULL mantém contrato legado; sem planos históricos.';

CREATE TABLE public.ads_invoice_generation_operation (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  generation_cycle bigint NOT NULL CHECK (generation_cycle >= 0),
  request_key uuid NOT NULL,
  preview_hash text NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  plan_snapshot jsonb NOT NULL CHECK (jsonb_typeof(plan_snapshot) = 'object'),
  result_snapshot jsonb NOT NULL CHECK (jsonb_typeof(result_snapshot) = 'object'),
  documents jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(documents) = 'array'),
  state text NOT NULL CHECK (state IN ('financial_committed','complete','reverted')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (invoice_id,company_id) REFERENCES public.ads_invoice(id,company_id) ON DELETE RESTRICT,
  UNIQUE (invoice_id, generation_cycle),
  UNIQUE (company_id, request_key)
);
COMMENT ON TABLE public.ads_invoice_generation_operation IS
  '#486: histórico financeiro/documental; sem DML de cliente; invoice/company validados por trigger local.';
ALTER TABLE public.ads_invoice_generation_operation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ads_invoice_generation_operation FROM PUBLIC, anon, authenticated, service_role;
-- Até existir o commit financeiro revisto, nem service_role recebe DML directo.

CREATE FUNCTION public._ads486_operation_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ads_invoice i
                 WHERE i.id = NEW.invoice_id AND i.company_id = NEW.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid_plan', DETAIL = 'operation_tenant';
  END IF;
  IF TG_OP = 'UPDATE' AND
    (NEW.id, NEW.invoice_id, NEW.company_id, NEW.generation_cycle, NEW.request_key,
     NEW.preview_hash, NEW.request_hash, NEW.plan_snapshot, NEW.result_snapshot,
     NEW.created_by, NEW.created_at)
    IS DISTINCT FROM
    (OLD.id, OLD.invoice_id, OLD.company_id, OLD.generation_cycle, OLD.request_key,
     OLD.preview_hash, OLD.request_hash, OLD.plan_snapshot, OLD.result_snapshot,
     OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'request_conflict', DETAIL = 'immutable_operation';
  END IF;
  IF NEW.state = 'complete' AND (NEW.documents = '[]'::jsonb OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.documents) d WHERE d->>'status' IS DISTINCT FROM 'complete'
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'request_conflict', DETAIL = 'incomplete_documents';
  END IF;
  IF TG_OP = 'UPDATE' AND
     ((OLD.state = 'reverted' AND NEW IS DISTINCT FROM OLD) OR
      (OLD.state = 'complete' AND NEW.state = 'financial_committed')) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'request_conflict', DETAIL = 'operation_transition';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._ads486_operation_tenant() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ads486_operation_tenant BEFORE INSERT OR UPDATE
ON public.ads_invoice_generation_operation FOR EACH ROW EXECUTE FUNCTION public._ads486_operation_tenant();

-- Helpers são internos: sem sessão delegada, parâmetros de actor ou bypass platform_admin.
CREATE FUNCTION public._ads486_access(p_company uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'unauthenticated'; END IF;
  IF p_company IS NULL OR public.current_company_id() IS DISTINCT FROM p_company OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id = u
      AND r.role::text IN ('admin','manager','editor','accountant','platform_admin')
      AND (r.company_id = p_company OR r.role::text = 'platform_admin')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;
  RETURN u;
END $$;
REVOKE ALL ON FUNCTION public._ads486_access(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_money(p_value jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR
     (p_value #>> '{}') !~ '^-?(0|[1-9][0-9]{0,11})\.[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'decimal_string_required';
  END IF;
  RETURN (p_value #>> '{}')::numeric;
END $$;
REVOKE ALL ON FUNCTION public._ads486_money(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_decimal(p_value numeric) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$ SELECT to_char(p_value, 'FM999999999999999999999999999990.00') $$;
REVOKE ALL ON FUNCTION public._ads486_decimal(numeric) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_uuid(p_value jsonb) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR
     (p_value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'uuid_required';
  END IF;
  RETURN (p_value #>> '{}')::uuid;
END $$;
REVOKE ALL ON FUNCTION public._ads486_uuid(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_keys(p_object jsonb, p_allowed text[], p_required text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog
AS $$
BEGIN
  IF jsonb_typeof(p_object) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'object_required';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_object) k WHERE NOT (k = ANY(p_allowed))) OR
     NOT (p_object ?& p_required) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'object_keys';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._ads486_keys(jsonb,text[],text[]) FROM PUBLIC, anon, authenticated, service_role;

-- Validação estrutural e referencial completa das escolhas presentes. Um plano
-- em edição pode omitir linhas: preview devolve allocation_required como blocker.
-- Aceites não cabem neste schema. Arrays são normalizados por identidade estável.
CREATE FUNCTION public._ads486_plan(p_invoice uuid, p_plan jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE i public.ads_invoice; l public.ads_invoice_line; a jsonb; n jsonb; b jsonb;
        f public.event_forecasts; v_event uuid; v_amount numeric; v_line uuid;
        v_dest text; v_key text; v_sum numeric; v_count integer;
BEGIN
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id = p_invoice;
  PERFORM public._ads486_keys(p_plan,
    ARRAY['version','allocations','new_forecasts','budget_proposals'],
    ARRAY['version','allocations','new_forecasts','budget_proposals']);
  IF p_plan->'version' IS DISTINCT FROM '1'::jsonb OR
     jsonb_typeof(p_plan->'allocations') IS DISTINCT FROM 'array' OR
     jsonb_typeof(p_plan->'new_forecasts') IS DISTINCT FROM 'array' OR
     jsonb_typeof(p_plan->'budget_proposals') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'plan_v1';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'allocations') x GROUP BY x->>'key' HAVING count(*) > 1) OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'new_forecasts') x GROUP BY x->>'key' HAVING count(*) > 1) OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'budget_proposals') x GROUP BY x->>'forecast_id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'duplicate_key';
  END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(p_plan->'new_forecasts') LOOP
    PERFORM public._ads486_keys(n,
      ARRAY['key','event_id','category_id','description','specification','currency','amount','observation'],
      ARRAY['key','event_id','category_id','description','specification','currency','amount','observation']);
    v_key := n->>'key'; v_event := public._ads486_uuid(n->'event_id');
    v_amount := public._ads486_money(n->'amount');
    IF jsonb_typeof(n->'key') IS DISTINCT FROM 'string' OR v_key IS NULL OR v_key !~ '^[A-Za-z0-9_-]{1,80}$' OR v_amount <= 0 OR
       jsonb_typeof(n->'description') IS DISTINCT FROM 'string' OR length(btrim(n->>'description')) = 0 OR
       jsonb_typeof(n->'observation') IS DISTINCT FROM 'string' OR length(btrim(n->>'observation')) = 0 OR
       (n->'specification' <> 'null'::jsonb AND jsonb_typeof(n->'specification') <> 'string') OR
       NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = v_event AND e.company_id = i.company_id) OR
       public._ads486_uuid(n->'category_id') <> 'c0000034-0000-0000-0000-000000000001'::uuid OR
       NOT EXISTS (SELECT 1 FROM public.account_categories c
                   WHERE c.id = public._ads486_uuid(n->'category_id')
                     AND c.company_id = i.company_id AND c.type = 'expense' AND c.is_active
                     AND NOT EXISTS (SELECT 1 FROM public.account_categories ch WHERE ch.parent_id = c.id)) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'new_forecast';
    END IF;
    IF n->>'currency' IS DISTINCT FROM i.currency THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'currency_mismatch';
    END IF;
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(p_plan->'allocations') LOOP
    PERFORM public._ads486_keys(a,
      ARRAY['key','line_id','destination','event_id','forecast_id','new_forecast_key','amount','observation'],
      ARRAY['key','line_id','destination','amount','observation']);
    v_line := public._ads486_uuid(a->'line_id'); v_dest := a->>'destination';
    v_amount := public._ads486_money(a->'amount'); v_key := a->>'key';
    SELECT * INTO l FROM public.ads_invoice_line
      WHERE id = v_line AND invoice_id = i.id AND company_id = i.company_id;
    IF NOT FOUND OR jsonb_typeof(a->'key') IS DISTINCT FROM 'string' OR v_key IS NULL OR v_key !~ '^[A-Za-z0-9_-]{1,80}$' OR
       jsonb_typeof(a->'destination') IS DISTINCT FROM 'string' OR
       v_dest IS NULL OR v_dest NOT IN ('event','company','carreira','outside','prorate') OR
       jsonb_typeof(a->'observation') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'allocation';
    END IF;
    IF v_dest = 'event' THEN
      v_event := public._ads486_uuid(a->'event_id');
      IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = v_event AND e.company_id = i.company_id) OR
         ((a->>'forecast_id' IS NOT NULL)::int + (a->>'new_forecast_key' IS NOT NULL)::int) <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'event_forecast_required';
      END IF;
      IF a->>'forecast_id' IS NOT NULL THEN
        SELECT * INTO f FROM public.event_forecasts WHERE id = public._ads486_uuid(a->'forecast_id');
        IF NOT FOUND OR f.company_id <> i.company_id OR f.event_id <> v_event OR
           f.category_id IS DISTINCT FROM 'c0000034-0000-0000-0000-000000000001'::uuid OR
           f.type <> 'expense' OR f.status <> 'approved' OR f.version_id IS NOT NULL OR
           f.is_transitory OR f.exclude_from_result OR f.is_overhead THEN
          RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'forecast_scope';
        END IF;
        IF f.currency IS DISTINCT FROM i.currency THEN
          RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'currency_mismatch';
        END IF;
      ELSE
        IF jsonb_typeof(a->'new_forecast_key') IS DISTINCT FROM 'string' OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'new_forecasts') x
                       WHERE x->>'key' = a->>'new_forecast_key' AND x->>'event_id' = v_event::text) THEN
          RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'new_forecast_scope';
        END IF;
      END IF;
    ELSIF a->>'event_id' IS NOT NULL OR a->>'forecast_id' IS NOT NULL OR a->>'new_forecast_key' IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'non_event_has_link';
    END IF;
    IF v_dest = 'carreira' AND (i.platform <> 'tiktok' OR l.match_source <> 'carreira' OR l.event_id IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'carreira_not_preclassified';
    END IF;
    IF v_dest = 'outside' AND length(btrim(a->>'observation')) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'outside_reason_required';
    END IF;
    IF v_dest = 'prorate' AND (NOT l.is_adjustment OR l.external_campaign_id IS NOT NULL OR
       NULLIF(btrim(l.campaign_name),'') IS NOT NULL OR l.event_id IS NOT NULL OR l.event_split IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'prorate_not_anonymous';
    END IF;
    IF l.match_source = 'carreira' AND v_dest NOT IN ('carreira','outside') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'carreira_preserved';
    END IF;
    IF l.is_adjustment OR l.event_split IS NULL OR l.event_split = '[]'::jsonb THEN
      IF v_amount <> l.amount OR
         (SELECT count(*) FROM jsonb_array_elements(p_plan->'allocations') x WHERE x->>'line_id' = l.id::text) <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'whole_line_required';
      END IF;
    ELSE
      IF l.matched_by IS NULL OR l.matched_at IS NULL OR v_dest <> 'event' OR
         NOT EXISTS (SELECT 1 FROM jsonb_array_elements(l.event_split) s
                     WHERE s->>'event_id' = v_event::text AND (s->>'amount')::numeric = v_amount) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'human_split_required';
      END IF;
    END IF;
  END LOOP;
  FOR l IN SELECT * FROM public.ads_invoice_line
            WHERE invoice_id = i.id AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'allocations') x
                                               WHERE x->>'line_id' = ads_invoice_line.id::text) LOOP
    SELECT sum(public._ads486_money(x->'amount')), count(*) INTO v_sum, v_count
      FROM jsonb_array_elements(p_plan->'allocations') x WHERE x->>'line_id' = l.id::text;
    IF v_sum <> l.amount THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'line_sum';
    END IF;
    IF NOT l.is_adjustment AND l.event_split IS NOT NULL AND l.event_split <> '[]'::jsonb THEN
      IF v_count <> jsonb_array_length(l.event_split) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(l.event_split) s
        WHERE (SELECT count(*) FROM jsonb_array_elements(p_plan->'allocations') x
               WHERE x->>'line_id' = l.id::text AND x->>'event_id' = s->>'event_id'
                 AND public._ads486_money(x->'amount') = (s->>'amount')::numeric) <> 1
      ) THEN RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'split_multiplicity'; END IF;
    END IF;
  END LOOP;
  FOR n IN SELECT value FROM jsonb_array_elements(p_plan->'new_forecasts') LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'allocations') x WHERE x->>'new_forecast_key' = n->>'key') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'unused_new_forecast';
    END IF;
  END LOOP;
  FOR b IN SELECT value FROM jsonb_array_elements(p_plan->'budget_proposals') LOOP
    PERFORM public._ads486_keys(b, ARRAY['forecast_id','new_amount'], ARRAY['forecast_id','new_amount']);
    SELECT * INTO f FROM public.event_forecasts WHERE id = public._ads486_uuid(b->'forecast_id');
    v_amount := public._ads486_money(b->'new_amount');
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_plan->'allocations') x
                               WHERE x->>'forecast_id' = f.id::text) OR v_amount <= f.amount OR
       f.master_forecast_id IS NOT NULL OR f.is_retroactive_override THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'raise_scope';
    END IF;
  END LOOP;
  RETURN jsonb_build_object('version', 1,
    'allocations', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'key') COLLATE "C"), '[]') FROM jsonb_array_elements(p_plan->'allocations') x),
    'new_forecasts', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'key') COLLATE "C"), '[]') FROM jsonb_array_elements(p_plan->'new_forecasts') x),
    'budget_proposals', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'forecast_id') COLLATE "C"), '[]') FROM jsonb_array_elements(p_plan->'budget_proposals') x));
END $$;
REVOKE ALL ON FUNCTION public._ads486_plan(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Esta leitura é o único cálculo v1. Não escreve linhas de BP/transações/operações.
-- D1 pendente: o gerador financeiro terá de chamar ESTE helper após os locks.
CREATE FUNCTION public._ads486_preview(p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE i public.ads_invoice; p jsonb; a jsonb; n jsonb; r record;
  expanded jsonb := '[]'; children jsonb := '[]'; effects jsonb := '[]';
  line_budgets jsonb := '[]'; category_budgets jsonb := '[]'; blockers jsonb := '[]';
  forecasts jsonb := '[]'; commitments jsonb := '[]'; deduplication jsonb := '[]'; sources jsonb; snapshot jsonb;
  v_base numeric; v_part numeric; v_rest numeric; v_outside numeric := 0;
  v_sum numeric; v_current numeric; v_committed numeric; v_incoming numeric;
  v_after numeric; v_proposed numeric; v_effect numeric; v_shortfall numeric; v_rows integer;
  v_fid uuid; v_matches uuid[]; v_count integer; v_child_key text; v_basis jsonb;
  v_tx jsonb; v_alloc jsonb;
BEGIN
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id = p_invoice;
  IF i.generation_contract_version IS DISTINCT FROM 1 OR i.generation_plan IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'allocation_required', DETAIL = 'plan_required';
  END IF;
  p := public._ads486_plan(i.id, i.generation_plan);
  SELECT coalesce(sum(l.amount), 0), count(*) INTO v_sum, v_rows
    FROM public.ads_invoice_line l WHERE l.invoice_id = i.id AND l.company_id = i.company_id;
  IF v_rows = 0 OR v_sum <> i.total_amount OR i.lines_sum IS DISTINCT FROM v_sum OR
     EXISTS (SELECT 1 FROM public.ads_invoice_line l WHERE l.invoice_id = i.id AND l.company_id <> i.company_id) THEN
    blockers := blockers || jsonb_build_array(jsonb_build_object('code','invalid_plan','reason','invoice_reconciliation'));
  END IF;
  FOR r IN SELECT l.id FROM public.ads_invoice_line l WHERE l.invoice_id = i.id
           AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p->'allocations') x WHERE x->>'line_id' = l.id::text)
           ORDER BY l.id LOOP
    blockers := blockers || jsonb_build_array(jsonb_build_object('code','allocation_required','line_id',r.id));
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(p->'allocations') LOOP
    IF a->>'destination' = 'outside' THEN
      v_outside := v_outside + public._ads486_money(a->'amount');
    ELSIF a->>'destination' <> 'prorate' THEN
      expanded := expanded || jsonb_build_array(a || jsonb_build_object(
        'source_key', a->>'key', 'category_id','c0000034-0000-0000-0000-000000000001', 'prorated',false));
    END IF;
  END LOOP;
  -- Proporção pela mídia, independente de ajustes atribuídos. Cada resíduo vai
  -- para a maior base; empate pela chave da allocation sob collation C.
  SELECT coalesce(sum(public._ads486_money(x->'amount')),0),
         coalesce(jsonb_agg(x ORDER BY public._ads486_money(x->'amount') DESC, (x->>'key') COLLATE "C"),'[]')
    INTO v_base, v_basis
    FROM jsonb_array_elements(expanded) x JOIN public.ads_invoice_line l ON l.id = (x->>'line_id')::uuid
    WHERE NOT l.is_adjustment;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_basis) x WHERE public._ads486_money(x->'amount') < 0) THEN
    blockers := blockers || '[{"code":"invalid_plan","reason":"negative_media_basis"}]'::jsonb;
  END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(p->'allocations') WHERE value->>'destination' = 'prorate' LOOP
    v_rest := public._ads486_money(a->'amount'); v_alloc := '[]';
    IF v_base <= 0 AND v_rest <> 0 THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object('code','allocation_required',
        'reason','adjustment_without_media','line_id',a->>'line_id'));
    ELSIF v_base > 0 THEN
      FOR n IN SELECT value FROM jsonb_array_elements(v_basis) LOOP
        v_part := round(public._ads486_money(a->'amount') * public._ads486_money(n->'amount') / v_base, 2);
        v_rest := v_rest - v_part;
        v_alloc := v_alloc || jsonb_build_array(n || jsonb_build_object(
          'key', (a->>'key') || ':' || (n->>'key'), 'source_key',a->>'key', 'line_id',a->>'line_id',
          'amount',public._ads486_decimal(v_part), 'prorated',true, 'observation',a->>'observation'));
      END LOOP;
      IF v_rest <> 0 THEN
        v_alloc := jsonb_set(v_alloc, '{0,amount}', to_jsonb(public._ads486_decimal(
          public._ads486_money(v_alloc->0->'amount') + v_rest)));
      END IF;
      expanded := expanded || v_alloc;
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'key') COLLATE "C"),'[]') INTO expanded
    FROM jsonb_array_elements(expanded) x;
  FOR r IN
    SELECT grouped.* FROM (
    SELECT x->>'destination' destination, x->>'event_id' event_id, x->>'forecast_id' forecast_id,
           x->>'new_forecast_key' new_forecast_key, x->>'category_id' category_id,
           sum(public._ads486_money(x->'amount')) amount,
           jsonb_agg(jsonb_build_object('key',x->>'key','source_key',x->>'source_key',
             'line_id',x->>'line_id','amount',x->>'amount','prorated',x->'prorated') ORDER BY (x->>'key') COLLATE "C") source_line_allocations
    FROM jsonb_array_elements(expanded) x GROUP BY 1,2,3,4,5
    ) grouped
    ORDER BY grouped.destination COLLATE "C", grouped.event_id COLLATE "C", grouped.forecast_id COLLATE "C",
             grouped.new_forecast_key COLLATE "C", grouped.category_id COLLATE "C"
  LOOP
    v_child_key := encode(sha256(convert_to(jsonb_build_array(r.destination,r.event_id,r.category_id,
      r.forecast_id,r.new_forecast_key)::text,'UTF8')),'hex');
    children := children || jsonb_build_array(jsonb_build_object('key',v_child_key,
      'destination',r.destination,'event_id',r.event_id,'category_id',r.category_id,
      'forecast_id',r.forecast_id,'new_forecast_key',r.new_forecast_key,
      'amount',public._ads486_decimal(r.amount),'source_line_allocations',r.source_line_allocations));
  END LOOP;
  SELECT coalesce(sum(public._ads486_money(x->'amount')),0) INTO v_sum FROM jsonb_array_elements(children) x;
  IF v_sum + v_outside <> i.total_amount THEN
    blockers := blockers || '[{"code":"invalid_plan","reason":"children_plus_outside"}]'::jsonb;
  END IF;
  -- Fontes de verba: uma leitura por id, sem join que multiplique valores.
  -- Master/cidades ficam em eventos distintos. Espelhos com master_forecast_id
  -- repetido NO MESMO evento/rubrica bloqueiam: não se inventa uma verba extra.
  SELECT coalesce(jsonb_agg(to_jsonb(f) - ARRAY['created_at','updated_at','approved_at',
    'formalidade_changed_at'] ORDER BY f.id),'[]') INTO forecasts
  FROM public.event_forecasts f WHERE f.company_id = i.company_id AND f.version_id IS NULL
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(children) x WHERE x->>'destination' = 'event'
                AND x->>'event_id' = f.event_id::text AND x->>'category_id' = f.category_id::text);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(forecasts) f
             GROUP BY f->>'event_id', f->>'category_id', coalesce(f->>'master_forecast_id',f->>'id') HAVING count(*) > 1) THEN
    blockers := blockers || '[{"code":"invalid_plan","reason":"ambiguous_master_budget"}]'::jsonb;
  END IF;
  -- Antes de eliminar uma mãe de resultado, provar a composição integral.
  -- Um grupo parcial/moedas diferentes não pode baixar compromisso em silêncio.
  FOR r IN SELECT t.* FROM public.transactions t
    WHERE t.company_id = i.company_id AND t.type = 'expense'
      AND NOT t.is_transitory AND NOT t.exclude_from_result AND NOT t.is_hidden
      AND t.reversed_at IS NULL AND t.shared_cost_account_id IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(children) x WHERE x->>'destination' = 'event'
                  AND x->>'event_id' = t.event_id::text AND x->>'category_id' = t.category_id::text)
      AND EXISTS (SELECT 1 FROM public.transactions ch WHERE ch.parent_transaction_id = t.id
                  AND ch.company_id = t.company_id AND ch.type = 'expense'
                  AND NOT ch.is_transitory AND NOT ch.exclude_from_result AND NOT ch.is_hidden
                  AND ch.reversed_at IS NULL AND ch.shared_cost_account_id IS NULL)
    ORDER BY t.id LOOP
    SELECT coalesce(sum(ch.amount),0),coalesce(jsonb_agg(jsonb_build_object('id',ch.id,'amount',ch.amount,
      'currency',ch.currency,'event_id',ch.event_id,'category_id',ch.category_id,'forecast_id',ch.forecast_id) ORDER BY ch.id),'[]')
      INTO v_part,v_basis FROM public.transactions ch WHERE ch.parent_transaction_id = r.id
        AND ch.company_id = r.company_id AND ch.type = 'expense'
        AND NOT ch.is_transitory AND NOT ch.exclude_from_result AND NOT ch.is_hidden
        AND ch.reversed_at IS NULL AND ch.shared_cost_account_id IS NULL;
    deduplication := deduplication || jsonb_build_array(jsonb_build_object('parent_id',r.id,
      'amount',r.amount,'currency',r.currency,'children',v_basis));
    IF v_part <> r.amount OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_basis) x
                                     WHERE x->>'currency' IS DISTINCT FROM r.currency) THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object('code','invalid_plan',
        'reason','ambiguous_parent_commitment','transaction_id',r.id));
    END IF;
  END LOOP;
  -- Compromisso: inclui pendentes e filhas. A mãe de um grupo com pernas de
  -- resultado é eliminada uma só vez, sem excluir filhas por terem parent_id.
  FOR r IN SELECT t.* FROM public.transactions t
    WHERE t.company_id = i.company_id AND t.type = 'expense'
      AND NOT t.is_transitory AND NOT t.exclude_from_result AND NOT t.is_hidden
      AND t.reversed_at IS NULL AND t.shared_cost_account_id IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(children) x WHERE x->>'destination' = 'event'
                  AND x->>'event_id' = t.event_id::text AND x->>'category_id' = t.category_id::text)
      AND NOT EXISTS (SELECT 1 FROM public.transactions ch WHERE ch.parent_transaction_id = t.id
                      AND ch.company_id = t.company_id AND ch.type = 'expense'
                      AND NOT ch.is_transitory AND NOT ch.exclude_from_result AND NOT ch.is_hidden
                      AND ch.reversed_at IS NULL AND ch.shared_cost_account_id IS NULL)
    ORDER BY t.id
  LOOP
    v_fid := r.forecast_id;
    IF v_fid IS NULL THEN
      SELECT array_agg(f.id ORDER BY f.id) INTO v_matches
        FROM public.event_forecasts f WHERE f.company_id = i.company_id AND f.version_id IS NULL AND f.transaction_id = r.id;
      v_count := coalesce(cardinality(v_matches),0);
      IF v_count > 1 THEN
        blockers := blockers || jsonb_build_array(jsonb_build_object('code','invalid_plan',
          'reason','ambiguous_legacy_anchor','transaction_id',r.id));
      ELSIF v_count = 1 THEN
        v_fid := v_matches[1];
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(forecasts) f WHERE f->>'id' = v_fid::text
                       AND f->>'event_id' = r.event_id::text AND f->>'category_id' = r.category_id::text) THEN
          blockers := blockers || jsonb_build_array(jsonb_build_object('code','invalid_plan',
            'reason','legacy_anchor_scope','transaction_id',r.id));
        END IF;
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(forecasts) f WHERE f->>'id' = v_fid::text
                     AND f->>'event_id' = r.event_id::text AND f->>'category_id' = r.category_id::text) THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object('code','invalid_plan',
        'reason','commitment_forecast_scope','transaction_id',r.id));
    END IF;
    IF r.currency IS DISTINCT FROM i.currency THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object('code','currency_mismatch','transaction_id',r.id));
    END IF;
    v_tx := to_jsonb(r) - ARRAY['created_at','updated_at','payment_date','reversed_at'];
    commitments := commitments || jsonb_build_array(v_tx || jsonb_build_object('budget_forecast_id',v_fid));
  END LOOP;
  FOR r IN SELECT DISTINCT (x->>'forecast_id')::uuid id FROM jsonb_array_elements(children) x
           WHERE x->>'forecast_id' IS NOT NULL ORDER BY 1 LOOP
    SELECT value INTO n FROM jsonb_array_elements(forecasts) WHERE value->>'id' = r.id::text;
    v_current := (n->>'amount')::numeric;
    SELECT coalesce(sum((x->>'amount')::numeric),0) INTO v_committed FROM jsonb_array_elements(commitments) x
      WHERE x->>'budget_forecast_id' = r.id::text;
    SELECT coalesce(sum(public._ads486_money(x->'amount')),0) INTO v_incoming FROM jsonb_array_elements(children) x
      WHERE x->>'forecast_id' = r.id::text;
    SELECT public._ads486_money(x->'new_amount') INTO v_proposed FROM jsonb_array_elements(p->'budget_proposals') x
      WHERE x->>'forecast_id' = r.id::text;
    v_after := greatest(v_current, v_committed + v_incoming, coalesce(v_proposed,v_current));
    v_shortfall := greatest(v_committed + v_incoming - v_current,0);
    IF v_after > v_current THEN
      IF n->>'master_forecast_id' IS NOT NULL OR (n->>'is_retroactive_override')::boolean THEN
        blockers := blockers || jsonb_build_array(jsonb_build_object('code','invalid_plan',
          'reason','protected_forecast_raise','forecast_id',r.id));
      END IF;
      effects := effects || jsonb_build_array(jsonb_build_object('effect_id','raise:' || r.id::text,'kind','raise',
        'forecast_id',r.id,'new_forecast_key',NULL,'event_id',n->>'event_id','category_id',n->>'category_id',
        'before',public._ads486_decimal(v_current),'delta',public._ads486_decimal(v_after-v_current),
        'after',public._ads486_decimal(v_after),'description',n->>'description'));
    END IF;
    line_budgets := line_budgets || jsonb_build_array(jsonb_build_object('forecast_id',r.id,'new_forecast_key',NULL,
      'event_id',n->>'event_id','category_id',n->>'category_id',
      'current',public._ads486_decimal(v_current),'committed',public._ads486_decimal(v_committed),
      'incoming',public._ads486_decimal(v_incoming),'after',public._ads486_decimal(v_after-v_committed-v_incoming),
      'shortfall',public._ads486_decimal(v_shortfall)));
  END LOOP;
  FOR n IN SELECT value FROM jsonb_array_elements(p->'new_forecasts') LOOP
    v_current := public._ads486_money(n->'amount');
    SELECT coalesce(sum(public._ads486_money(x->'amount')),0) INTO v_incoming FROM jsonb_array_elements(children) x
      WHERE x->>'new_forecast_key' = n->>'key';
    IF v_incoming > v_current THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object('code','budget_excess',
        'new_forecast_key',n->>'key','reason','new_forecast_too_small'));
    END IF;
    effects := effects || jsonb_build_array(jsonb_build_object('effect_id','create:' || (n->>'key'), 'kind','create',
      'forecast_id',NULL,'new_forecast_key',n->>'key','event_id',n->>'event_id','category_id',n->>'category_id',
      'before','0.00','delta',n->>'amount','after',n->>'amount','description',n->>'description'));
    line_budgets := line_budgets || jsonb_build_array(jsonb_build_object('forecast_id',NULL,'new_forecast_key',n->>'key',
      'event_id',n->>'event_id','category_id',n->>'category_id', 'current','0.00','committed','0.00',
      'incoming',public._ads486_decimal(v_incoming),'after',public._ads486_decimal(v_current-v_incoming),
      'shortfall',public._ads486_decimal(greatest(v_incoming,0))));
  END LOOP;
  FOR r IN SELECT DISTINCT x->>'event_id' event_id, x->>'category_id' category_id
           FROM jsonb_array_elements(children) x WHERE x->>'destination' = 'event' ORDER BY 1,2 LOOP
    SELECT coalesce(sum((x->>'amount')::numeric),0) INTO v_current FROM jsonb_array_elements(forecasts) x
      WHERE x->>'event_id' = r.event_id AND x->>'category_id' = r.category_id
        AND x->>'status' = 'approved' AND x->>'type' = 'expense'
        AND NOT (x->>'is_transitory')::boolean AND NOT (x->>'exclude_from_result')::boolean AND NOT (x->>'is_overhead')::boolean;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(forecasts) x WHERE x->>'event_id' = r.event_id
               AND x->>'category_id' = r.category_id AND x->>'status' = 'approved'
               AND x->>'currency' IS DISTINCT FROM i.currency) THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object('code','currency_mismatch','event_id',r.event_id));
    END IF;
    SELECT coalesce(sum((x->>'amount')::numeric),0) INTO v_committed FROM jsonb_array_elements(commitments) x
      WHERE x->>'event_id' = r.event_id AND x->>'category_id' = r.category_id;
    SELECT coalesce(sum(public._ads486_money(x->'amount')),0) INTO v_incoming FROM jsonb_array_elements(children) x
      WHERE x->>'event_id' = r.event_id AND x->>'category_id' = r.category_id;
    SELECT coalesce(sum(public._ads486_money(x->'delta')),0) INTO v_effect FROM jsonb_array_elements(effects) x
      WHERE x->>'event_id' = r.event_id AND x->>'category_id' = r.category_id;
    v_shortfall := greatest(v_committed+v_incoming-v_current,0);
    v_after := v_current+v_effect-v_committed-v_incoming;
    IF v_after < 0 THEN
      blockers := blockers || jsonb_build_array(jsonb_build_object('code','budget_excess','reason','category_residual',
        'event_id',r.event_id,'category_id',r.category_id,'shortfall',public._ads486_decimal(-v_after)));
    END IF;
    category_budgets := category_budgets || jsonb_build_array(jsonb_build_object('event_id',r.event_id,
      'category_id',r.category_id,'current',public._ads486_decimal(v_current),'committed',public._ads486_decimal(v_committed),
      'incoming',public._ads486_decimal(v_incoming),'after',public._ads486_decimal(v_after),
      'shortfall',public._ads486_decimal(v_shortfall)));
  END LOOP;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'effect_id') COLLATE "C"),'[]') INTO effects FROM jsonb_array_elements(effects) x;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'key') COLLATE "C"),'[]') INTO children FROM jsonb_array_elements(children) x;
  SELECT jsonb_build_object('invoice', jsonb_build_object('id',i.id,'company_id',i.company_id,
    'platform',i.platform,'invoice_number',i.invoice_number,'currency',i.currency,'billing_period',i.billing_period,
    'issue_date',i.issue_date,'total_amount',i.total_amount,'lines_sum',i.lines_sum,'source',i.source,
    'file_path',i.file_path,'status',i.status,'parent_transaction_id',i.parent_transaction_id),
    'lines',(SELECT coalesce(jsonb_agg(to_jsonb(l) - ARRAY['created_at','updated_at','matched_at','line_no'] ORDER BY l.id),'[]')
             FROM public.ads_invoice_line l WHERE l.invoice_id = i.id),
    'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'company_id',e.company_id,
               'parent_event_id',e.parent_event_id) ORDER BY e.id),'[]') FROM public.events e
               WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(children) x WHERE x->>'event_id' = e.id::text)),
    'plan',p,'forecasts',forecasts,'commitments',commitments,'deduplication',deduplication) INTO sources;
  snapshot := jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,
    'generation_cycle',i.generation_cycle,'currency',i.currency,'allocations',expanded,'children',children,
    'line_budgets',line_budgets,'category_budgets',category_budgets,'effects',effects,'blockers',blockers,
    'totals',jsonb_build_object('children',public._ads486_decimal(v_sum),'outside',public._ads486_decimal(v_outside),
      'invoice',public._ads486_decimal(i.total_amount)));
  RETURN snapshot || jsonb_build_object('preview_hash',encode(sha256(convert_to(
    jsonb_build_object('snapshot',snapshot,'sources',sources)::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION public._ads486_preview(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Ponto público. Generate é recusado antes de qualquer escrita: a parcela
-- financeira/reversão ainda exige revisão D1. Não simula sucesso nem operação.
CREATE FUNCTION public.ads_invoice_generation_v1(
  p_invoice_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE i public.ads_invoice; u uuid; p jsonb; o public.ads_invoice_generation_operation; expected bigint;
BEGIN
  SELECT * INTO i FROM public.ads_invoice WHERE id = p_invoice_id;
  u := public._ads486_access(i.company_id);
  -- Protocolo comum a TODOS os writers Ads v1: empresa, fatura, linha da fatura.
  -- O lock de empresa serializa também faturas diferentes que partilhem verba.
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:company:' || i.company_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:invoice:' || i.id::text,0));
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id = p_invoice_id FOR UPDATE;
  u := public._ads486_access(i.company_id);
  IF p_action = 'operation' THEN
    PERFORM public._ads486_keys(p_payload, ARRAY[]::text[]);
    SELECT * INTO o FROM public.ads_invoice_generation_operation
      WHERE invoice_id = i.id AND company_id = i.company_id ORDER BY generation_cycle DESC LIMIT 1;
    RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,
      'generation_cycle',i.generation_cycle,'operation',CASE WHEN o.id IS NULL THEN NULL ELSE to_jsonb(o) END);
  ELSIF p_action = 'generate' THEN
    -- 503 a traduzir por D3. Não aceitar request_key nem escrever um histórico
    -- que pudesse ser confundido com um commit financeiro nesta parcela.
    RAISE EXCEPTION USING ERRCODE = '0A000', MESSAGE = 'contract_unavailable', DETAIL = 'D1_financial_commit_not_implemented';
  ELSIF p_action = 'save_plan' THEN
    PERFORM public._ads486_keys(p_payload, ARRAY['expected_revision','plan'], ARRAY['expected_revision','plan']);
    IF i.status <> 'proposed' OR i.parent_transaction_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.ads_invoice_generation_operation o WHERE o.invoice_id = i.id AND o.state <> 'reverted'
    ) THEN RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'invoice_not_editable'; END IF;
  ELSIF p_action = 'preview' THEN
    PERFORM public._ads486_keys(p_payload, ARRAY['expected_revision']);
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'unknown_action';
  END IF;
  IF p_payload ? 'expected_revision' THEN
    IF jsonb_typeof(p_payload->'expected_revision') IS DISTINCT FROM 'number' OR
       p_payload->>'expected_revision' !~ '^(0|[1-9][0-9]{0,18})$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'expected_revision';
    END IF;
    IF (p_payload->>'expected_revision')::numeric > 9223372036854775807 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'expected_revision';
    END IF;
    expected := (p_payload->>'expected_revision')::bigint;
    IF expected <> i.generation_revision THEN
      RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'revision_conflict';
    END IF;
  END IF;
  PERFORM 1 FROM public.ads_invoice_line l WHERE l.invoice_id = i.id ORDER BY l.id FOR UPDATE;
  IF p_action = 'save_plan' THEN
    p := public._ads486_plan(i.id,p_payload->'plan');
    UPDATE public.ads_invoice SET generation_plan = p, generation_contract_version = 1,
      generation_revision = generation_revision+1, updated_at = now()
      WHERE id = i.id AND generation_revision = expected;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'revision_conflict'; END IF;
    RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision+1,
      'generation_cycle',i.generation_cycle,'plan',p);
  END IF;
  RETURN public._ads486_preview(i.id);
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_generation_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_generation_v1(uuid,text,jsonb) TO authenticated;

-- Reabertura apenas pré-financeira. Conserva plano, incrementa revisão.
-- Não desbloqueia CRM: D3 tem de integrar os handlers/campanhas existentes.
CREATE FUNCTION public.ads_invoice_reopen_v1(p_invoice_id uuid, p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE i public.ads_invoice; u uuid;
BEGIN
  SELECT * INTO i FROM public.ads_invoice WHERE id = p_invoice_id;
  u := public._ads486_access(i.company_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:company:' || i.company_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:invoice:' || i.id::text,0));
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id = p_invoice_id FOR UPDATE;
  u := public._ads486_access(i.company_id);
  IF p_expected_revision IS NULL OR p_expected_revision <> i.generation_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'revision_conflict';
  END IF;
  IF i.status <> 'confirmed' OR i.parent_transaction_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.ads_invoice_generation_operation o WHERE o.invoice_id = i.id AND o.state <> 'reverted'
  ) THEN RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'financial_reversal_required'; END IF;
  UPDATE public.ads_invoice SET status = 'proposed',confirmed_by = NULL,confirmed_at = NULL,
    reopened_by = u,reopened_at = now(),reopen_count = reopen_count+1,
    generation_revision = generation_revision+1,updated_at = now() WHERE id = i.id;
  RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'status','proposed','revision',i.generation_revision+1);
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_reopen_v1(uuid,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_reopen_v1(uuid,bigint) TO authenticated;

-- Identidade de conteúdo da linha do PDF. Ordem e line_no não entram na chave;
-- NULL e vazio são distintos. Não normalizar texto nem remover separadores.
CREATE FUNCTION public._ads486_line_identity(p_line jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$ SELECT jsonb_build_array(p_line->'external_campaign_id',p_line->'campaign_name',p_line->'placement',
                              p_line->'raw_description',p_line->'is_adjustment',p_line->'amount') $$;
REVOKE ALL ON FUNCTION public._ads486_line_identity(jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Importação recebe apenas dados do PDF, sem escolhas/matcher fornecidos pelo
-- cliente. D3 preserva a fase dry_run/confirmar e chama com o JWT do utilizador.
CREATE FUNCTION public.ads_invoice_import_v1(p_invoice jsonb, p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE i public.ads_invoice; u uuid; company uuid; v_invoice_id uuid; line jsonb; normalized jsonb := '[]';
        old_lines jsonb; incoming_content jsonb; old_content jsonb; header jsonb; old_header jsonb;
        preserved uuid[] := '{}'; unresolved uuid[] := '{}'; removed uuid[] := '{}';
        identity jsonb; old_id uuid; next_id uuid;
        new_count integer; old_count integer; v_sum numeric := 0; v_amount numeric;
        identical boolean; ambiguity boolean := false; plan jsonb; allocations jsonb; new_forecasts jsonb; proposals jsonb;
BEGIN
  PERFORM public._ads486_keys(p_invoice,
    ARRAY['company_id','platform','invoice_number','currency','billing_period','issue_date','total_amount','lines_sum','source','source_ref','file_path'],
    ARRAY['company_id','platform','invoice_number','currency','billing_period','issue_date','total_amount','lines_sum','source','source_ref','file_path']);
  company := public._ads486_uuid(p_invoice->'company_id');
  u := public._ads486_access(company);
  IF p_invoice->>'platform' IS NULL OR p_invoice->>'platform' NOT IN ('meta','google','tiktok') OR
     jsonb_typeof(p_invoice->'invoice_number') IS DISTINCT FROM 'string' OR
     length(btrim(p_invoice->>'invoice_number')) = 0 OR
     coalesce(p_invoice->>'currency','') !~ '^[A-Z]{3}$' OR p_invoice->>'source' IS DISTINCT FROM 'pdf' OR
     coalesce(p_invoice->>'billing_period','') !~ '^[0-9]{4}-[0-9]{2}-01$' OR
     (p_invoice->>'issue_date' IS NOT NULL AND p_invoice->>'issue_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR
     (p_invoice->>'file_path' IS NOT NULL AND
      (left(p_invoice->>'file_path',37) <> company::text || '/' OR p_invoice->>'file_path' ~ '(^|/)\.\.(/|$)')) OR
     EXISTS (SELECT 1 FROM unnest(ARRAY['source_ref','file_path','issue_date']) k
             WHERE jsonb_typeof(p_invoice->k) NOT IN ('string','null')) OR
     jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'import_header';
  END IF;
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'empty_invoice';
  END IF;
  -- Só os erros de entrada são traduzidos; falhas de leitura nunca são engolidas.
  BEGIN
    PERFORM (p_invoice->>'billing_period')::date, (p_invoice->>'issue_date')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'import_date';
  END;
  FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    PERFORM public._ads486_keys(line,
      ARRAY['line_no','raw_description','placement','campaign_name','external_campaign_id','amount','is_adjustment'],
      ARRAY['line_no','raw_description','placement','campaign_name','external_campaign_id','amount','is_adjustment']);
    IF jsonb_typeof(line->'line_no') IS DISTINCT FROM 'number' OR line->>'line_no' !~ '^[1-9][0-9]{0,8}$' OR
       jsonb_typeof(line->'raw_description') IS DISTINCT FROM 'string' OR
       jsonb_typeof(line->'is_adjustment') IS DISTINCT FROM 'boolean' OR EXISTS (
         SELECT 1 FROM unnest(ARRAY['placement','campaign_name','external_campaign_id']) k
         WHERE jsonb_typeof(line->k) NOT IN ('string','null')
       ) THEN RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'import_line'; END IF;
    v_amount := public._ads486_money(line->'amount'); v_sum := v_sum+v_amount;
    normalized := normalized || jsonb_build_array(line || jsonb_build_object('amount',public._ads486_decimal(v_amount)));
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(normalized) x GROUP BY x->>'line_no' HAVING count(*) > 1) OR
     v_sum <> public._ads486_money(p_invoice->'total_amount') OR v_sum <> public._ads486_money(p_invoice->'lines_sum') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'import_reconciliation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:company:' || company::text,0));
  -- A chave de importação é a constraint existente; não se pesquisa por período.
  SELECT * INTO i FROM public.ads_invoice ai WHERE ai.company_id = company AND ai.platform = p_invoice->>'platform'
    AND ai.invoice_number = p_invoice->>'invoice_number';
  IF i.id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ads486:invoice:' || i.id::text,0));
    SELECT * INTO STRICT i FROM public.ads_invoice ai WHERE ai.id = i.id FOR UPDATE;
    u := public._ads486_access(i.company_id);
    PERFORM 1 FROM public.ads_invoice_line l WHERE l.invoice_id = i.id ORDER BY l.id FOR UPDATE;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object('amount',public._ads486_decimal(l.amount)) ORDER BY l.id),'[]')
    INTO old_lines FROM public.ads_invoice_line l WHERE l.invoice_id = i.id;
  header := p_invoice - ARRAY['file_path','source_ref'];
  old_header := jsonb_build_object('company_id',i.company_id,'platform',i.platform,'invoice_number',i.invoice_number,
    'currency',i.currency,'billing_period',i.billing_period,'issue_date',i.issue_date,
    'total_amount',public._ads486_decimal(i.total_amount),'lines_sum',public._ads486_decimal(i.lines_sum),'source',i.source);
  SELECT coalesce(jsonb_agg(x ORDER BY x::text COLLATE "C"),'[]') INTO incoming_content
    FROM (SELECT public._ads486_line_identity(value) x FROM jsonb_array_elements(normalized)) q;
  SELECT coalesce(jsonb_agg(x ORDER BY x::text COLLATE "C"),'[]') INTO old_content
    FROM (SELECT public._ads486_line_identity(value) x FROM jsonb_array_elements(old_lines)) q;
  identical := i.id IS NOT NULL AND header = old_header AND incoming_content = old_content;
  IF identical THEN
    -- Até diferenças de caminho do mesmo PDF são no-op; não se apagam escolhas,
    -- IDs, fora_sistema, matched_by/at, plano, estado ou tarefas.
    RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'status',i.status,'revision',i.generation_revision,
      'identical',true,'preserved_line_ids',(SELECT coalesce(jsonb_agg(x->'id'),'[]') FROM jsonb_array_elements(old_lines) x),
      'unresolved_line_ids','[]'::jsonb,'ambiguous',false);
  END IF;
  IF i.status = 'applied' OR i.parent_transaction_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.ads_invoice_generation_operation o WHERE o.invoice_id = i.id AND o.state <> 'reverted'
  ) THEN RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'applied_invoice_changed'; END IF;
  IF i.id IS NOT NULL AND i.status NOT IN ('proposed','confirmed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'import_state';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ads_invoice_line l WHERE l.invoice_id = i.id
             AND (l.company_id <> company OR l.transaction_id IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'import_existing_links';
  END IF;
  IF i.id IS NULL THEN
    INSERT INTO public.ads_invoice(company_id,platform,invoice_number,currency,billing_period,issue_date,
      total_amount,lines_sum,source,source_ref,file_path,status)
    VALUES(company,p_invoice->>'platform',p_invoice->>'invoice_number',p_invoice->>'currency',
      (p_invoice->>'billing_period')::date,(p_invoice->>'issue_date')::date,
      public._ads486_money(p_invoice->'total_amount'),v_sum,'pdf',p_invoice->>'source_ref',p_invoice->>'file_path','proposed')
    RETURNING id INTO v_invoice_id;
  ELSE v_invoice_id := i.id;
  END IF;
  -- Só 1:1 é correspondência inequívoca. Repetições são preservadas no no-op
  -- integral acima; num PDF alterado nunca se atribuem escolhas por line_no.
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) ORDER BY (value->>'line_no')::integer LOOP
    identity := public._ads486_line_identity(line);
    SELECT count(*) INTO new_count FROM jsonb_array_elements(normalized) x WHERE public._ads486_line_identity(x) = identity;
    SELECT count(*), (array_agg((x->>'id')::uuid ORDER BY x->>'id'))[1] INTO old_count, old_id
      FROM jsonb_array_elements(old_lines) x WHERE public._ads486_line_identity(x) = identity;
    IF new_count = 1 AND old_count = 1 THEN
      preserved := array_append(preserved,old_id);
      UPDATE public.ads_invoice_line SET line_no = (line->>'line_no')::integer,updated_at = now() WHERE id = old_id;
    ELSE
      ambiguity := ambiguity OR (new_count > 1 AND old_count > 0) OR old_count > 1;
      INSERT INTO public.ads_invoice_line(invoice_id,company_id,line_no,raw_description,placement,campaign_name,
        external_campaign_id,amount,is_adjustment,event_id,event_split,match_source,match_note,matched_by,matched_at)
      VALUES(v_invoice_id,company,(line->>'line_no')::integer,line->>'raw_description',line->>'placement',line->>'campaign_name',
        line->>'external_campaign_id',public._ads486_money(line->'amount'),(line->>'is_adjustment')::boolean,
        NULL,NULL,'none',NULL,NULL,NULL) RETURNING id INTO next_id;
      unresolved := array_append(unresolved,next_id);
    END IF;
  END LOOP;
  SELECT coalesce(array_agg((x->>'id')::uuid),'{}') INTO removed FROM jsonb_array_elements(old_lines) x
    WHERE NOT ((x->>'id')::uuid = ANY(preserved));
  -- Histórico fora_sistema: nunca apagar uma linha histórica silenciosamente.
  -- Se o PDF alterado remove/ambigua essa identidade, recusar TUDO; o utilizador
  -- tem de rever a origem. Não se inventa uma nova tabela de histórico nesta parcela.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(old_lines) x WHERE x->>'match_source' = 'fora_sistema'
             AND (x->>'id')::uuid = ANY(removed)) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(i.generation_plan->'allocations') x
    WHERE x->>'destination' = 'outside' AND (x->>'line_id')::uuid = ANY(removed)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'outside_history_requires_review';
  END IF;
  DELETE FROM public.ads_invoice_line l WHERE l.id = ANY(removed) AND l.invoice_id = v_invoice_id;
  plan := i.generation_plan;
  IF plan IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(x ORDER BY (x->>'key') COLLATE "C"),'[]') INTO allocations
      FROM jsonb_array_elements(plan->'allocations') x WHERE (x->>'line_id')::uuid = ANY(preserved);
    SELECT coalesce(jsonb_agg(x ORDER BY (x->>'key') COLLATE "C"),'[]') INTO new_forecasts
      FROM jsonb_array_elements(plan->'new_forecasts') x WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(allocations) a WHERE a->>'new_forecast_key' = x->>'key');
    SELECT coalesce(jsonb_agg(x ORDER BY (x->>'forecast_id') COLLATE "C"),'[]') INTO proposals
      FROM jsonb_array_elements(plan->'budget_proposals') x WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(allocations) a WHERE a->>'forecast_id' = x->>'forecast_id');
    plan := jsonb_build_object('version',1,'allocations',allocations,'new_forecasts',new_forecasts,'budget_proposals',proposals);
  END IF;
  UPDATE public.ads_invoice SET currency = p_invoice->>'currency',billing_period = (p_invoice->>'billing_period')::date,
    issue_date = (p_invoice->>'issue_date')::date,total_amount = public._ads486_money(p_invoice->'total_amount'),lines_sum = v_sum,
    source = 'pdf',source_ref = p_invoice->>'source_ref',file_path = p_invoice->>'file_path',status = 'proposed',
    confirmed_by = NULL,confirmed_at = NULL,generation_plan = plan,
    generation_revision = generation_revision+1,updated_at = now() WHERE id = v_invoice_id;
  RETURN jsonb_build_object('contract_version',1,'invoice_id',v_invoice_id,'status','proposed',
    'revision',coalesce(i.generation_revision,0)+1,'identical',false,
    'preserved_line_ids',to_jsonb(preserved),'unresolved_line_ids',to_jsonb(unresolved),
    'removed_line_ids',to_jsonb(removed),'ambiguous',ambiguity);
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_import_v1(jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_import_v1(jsonb,jsonb) TO authenticated;

-- Uma tarefa contém somente metadados allowlisted. O caminho fica vinculado à
-- operação/destino; o conteúdo do PDF e os tokens nunca entram neste JSON.
CREATE FUNCTION public._ads486_documents(p_operation uuid, p_company uuid, p_documents jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public
AS $$
DECLARE d jsonb; prefix text := p_company::text || '/ads-invoices/operations/' || p_operation::text || '/';
BEGIN
  IF jsonb_typeof(p_documents) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_documents) x GROUP BY x->>'key' HAVING count(*) > 1) OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(p_documents) x GROUP BY x->>'path' HAVING count(*) > 1) THEN RETURN false; END IF;
  FOR d IN SELECT value FROM jsonb_array_elements(p_documents) LOOP
    PERFORM public._ads486_keys(d,
      ARRAY['key','transaction_id','bucket','path','name','doc_type','is_accounting','status','document_id','error_code'],
      ARRAY['key','transaction_id','bucket','path','name','doc_type','is_accounting','status','document_id','error_code']);
    PERFORM public._ads486_uuid(d->'transaction_id');
    IF coalesce(d->>'key','') !~ '^(original|proof:[0-9a-f]{64})$' OR
       d->>'bucket' IS DISTINCT FROM 'transaction-documents' OR
       d->>'path' IS DISTINCT FROM prefix || replace(d->>'key',':','-') || '.pdf' OR
       jsonb_typeof(d->'name') IS DISTINCT FROM 'string' OR length(btrim(d->>'name')) = 0 OR
       jsonb_typeof(d->'is_accounting') IS DISTINCT FROM 'boolean' OR
       coalesce(d->>'status','') NOT IN ('pending','complete','error') OR
       (d->>'key' = 'original' AND (d->>'doc_type' IS DISTINCT FROM 'fatura' OR d->'is_accounting' <> 'true'::jsonb)) OR
       (d->>'key' <> 'original' AND (d->>'doc_type' IS DISTINCT FROM 'comprovativo_veiculacao' OR d->'is_accounting' <> 'false'::jsonb)) OR
       (d->>'status' <> 'complete' AND d->>'document_id' IS NOT NULL) OR
       (d->>'status' = 'complete' AND d->>'document_id' IS NULL) OR
       (d->>'status' <> 'error' AND d->>'error_code' IS NOT NULL) OR
       (d->>'status' = 'error' AND coalesce(d->>'error_code','') !~ '^[a-z][a-z0-9_]{0,79}$') THEN RETURN false; END IF;
    IF d->>'document_id' IS NOT NULL THEN PERFORM public._ads486_uuid(d->'document_id'); END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public._ads486_documents(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.ads_invoice_generation_operation ADD CONSTRAINT ads486_documents_shape
  CHECK (public._ads486_documents(id,company_id,documents));

-- Rejeita conclusão com operação de outro tenant/transação fora do snapshot.
-- Nenhuma chamada Storage. A ligação só pode concluir depois do upload em D3.
CREATE FUNCTION public.ads_invoice_document_complete_v1(
  p_operation_id uuid, p_task_key text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE o public.ads_invoice_generation_operation; i public.ads_invoice; task jsonb; tasks jsonb;
  doc public.transaction_documents; v_index integer; v_count integer; v_doc_id uuid; v_tx_id uuid; v_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;
  PERFORM public._ads486_keys(p_payload,ARRAY['company_id','transaction_id','bucket','path','status','error_code'],
    ARRAY['company_id','transaction_id','bucket','path','status']);
  SELECT * INTO o FROM public.ads_invoice_generation_operation WHERE id = p_operation_id;
  IF NOT FOUND OR o.company_id <> public._ads486_uuid(p_payload->'company_id') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:company:' || o.company_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:invoice:' || o.invoice_id::text,0));
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id = o.invoice_id FOR UPDATE;
  SELECT * INTO STRICT o FROM public.ads_invoice_generation_operation WHERE id = p_operation_id FOR UPDATE;
  IF i.company_id <> o.company_id OR i.generation_cycle <> o.generation_cycle OR o.state = 'reverted' OR
     i.status <> 'applied' OR i.parent_transaction_id IS NULL OR
     i.parent_transaction_id::text IS DISTINCT FROM o.result_snapshot->'parent'->>'id' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'operation_not_current';
  END IF;
  SELECT value, (ordinality-1)::integer INTO task,v_index
    FROM jsonb_array_elements(o.documents) WITH ORDINALITY WHERE value->>'key' = p_task_key;
  IF NOT FOUND OR task->>'transaction_id' IS DISTINCT FROM p_payload->>'transaction_id' OR
     task->>'bucket' IS DISTINCT FROM p_payload->>'bucket' OR task->>'path' IS DISTINCT FROM p_payload->>'path' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'document_task';
  END IF;
  v_tx_id := public._ads486_uuid(task->'transaction_id');
  PERFORM 1 FROM public.transactions t WHERE t.id = v_tx_id AND t.company_id = o.company_id FOR KEY SHARE;
  -- D1 financeiro pendente: result_snapshot v1 deverá conter parent.id e
  -- children[].transaction_id. Não há fallback por evento, nome ou descrição.
  IF NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = v_tx_id AND t.company_id = o.company_id
                 AND ((task->>'key' = 'original' AND t.id::text = o.result_snapshot->'parent'->>'id') OR
                      (task->>'key' <> 'original' AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(o.result_snapshot->'children') c
                        WHERE c->>'transaction_id' = t.id::text AND task->>'key' = 'proof:' || (c->>'key'))))) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'document_transaction';
  END IF;
  IF task->>'status' = 'complete' THEN
    SELECT * INTO doc FROM public.transaction_documents WHERE id = (task->>'document_id')::uuid;
    IF NOT FOUND OR doc.transaction_id <> v_tx_id OR doc.company_id <> o.company_id OR
       doc.file_url <> task->>'path' OR doc.name <> task->>'name' OR doc.doc_type <> task->>'doc_type' OR
       doc.is_accounting IS DISTINCT FROM (task->>'is_accounting')::boolean THEN
      RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'document_link_changed';
    END IF;
    RETURN jsonb_build_object('contract_version',1,'operation_id',o.id,'state',o.state,'task',task);
  END IF;
  v_status := p_payload->>'status';
  IF v_status = 'error' THEN
    IF coalesce(p_payload->>'error_code','') !~ '^[a-z][a-z0-9_]{0,79}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'document_error_code';
    END IF;
    task := task || jsonb_build_object('status','error','error_code',p_payload->>'error_code','document_id',NULL);
  ELSIF v_status = 'complete' AND p_payload->>'error_code' IS NULL THEN
    SELECT count(*),(array_agg(d.id ORDER BY d.id))[1] INTO v_count,v_doc_id
      FROM public.transaction_documents d WHERE d.company_id = o.company_id AND d.transaction_id = v_tx_id
        AND d.file_url = task->>'path';
    IF v_count > 1 THEN RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'duplicate_document_link'; END IF;
    IF v_count = 1 THEN
      SELECT * INTO STRICT doc FROM public.transaction_documents WHERE id = v_doc_id;
      IF doc.name <> task->>'name' OR doc.doc_type <> task->>'doc_type' OR
         doc.is_accounting IS DISTINCT FROM (task->>'is_accounting')::boolean THEN
        RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'document_metadata_changed';
      END IF;
    ELSE
      INSERT INTO public.transaction_documents(transaction_id,company_id,name,file_url,doc_type,is_accounting,uploaded_by)
      VALUES(v_tx_id,o.company_id,task->>'name',task->>'path',task->>'doc_type',
        (task->>'is_accounting')::boolean,'system') RETURNING id INTO v_doc_id;
    END IF;
    task := task || jsonb_build_object('status','complete','document_id',v_doc_id,'error_code',NULL);
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'document_status';
  END IF;
  tasks := jsonb_set(o.documents,ARRAY[v_index::text],task);
  v_status := CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tasks) x WHERE x->>'status' <> 'complete')
                   THEN 'complete' ELSE 'financial_committed' END;
  UPDATE public.ads_invoice_generation_operation SET documents = tasks,state = v_status,updated_at = now() WHERE id = o.id;
  RETURN jsonb_build_object('contract_version',1,'operation_id',o.id,'state',v_status,'task',task);
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_document_complete_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_document_complete_v1(uuid,text,jsonb) TO service_role;

-- Critério v1 partilhado pelo campo calculado e contagem. SECURITY INVOKER:
-- preserva a RLS subjacente. Legado é literalmente o critério TikTok de 0106.
-- v1 considera TODAS as linhas, incluindo taxas. Preview é a autoridade de
-- validação financeira; este contador mede apenas a presença de uma escolha.
CREATE OR REPLACE FUNCTION public.ads_invoice_line_is_pending(l public.ads_invoice_line)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
  SELECT coalesce((SELECT CASE WHEN i.generation_contract_version = 1 THEN
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(i.generation_plan->'allocations') a
                WHERE a->>'line_id' = l.id::text)
  ELSE NOT coalesce(l.is_adjustment,false)
       AND coalesce(l.match_source,'') NOT IN ('fora_sistema','carreira')
       AND (l.event_id IS NULL OR l.match_source = 'none') END
  FROM public.ads_invoice i WHERE i.id = l.invoice_id AND i.company_id = l.company_id),true)
$$;
REVOKE ALL ON FUNCTION public.ads_invoice_line_is_pending(public.ads_invoice_line) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_line_is_pending(public.ads_invoice_line) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ads_invoice_pending_counts(p_invoice_ids uuid[])
RETURNS TABLE(invoice_id uuid,total_lines integer,pending_lines integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public
AS $$ SELECT l.invoice_id,count(*)::integer,count(*) FILTER (WHERE public.ads_invoice_line_is_pending(l))::integer
      FROM public.ads_invoice_line l WHERE l.invoice_id = ANY(p_invoice_ids) GROUP BY l.invoice_id $$;
REVOKE ALL ON FUNCTION public.ads_invoice_pending_counts(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_pending_counts(uuid[]) TO authenticated, service_role;

-- Privilégios por omissão inesperados não podem abrir o contrato novo. Não
-- alterar defaults globais: abortar toda a preparação se o catálogo divergir.
DO $$
DECLARE f record; a record; allowed_role text;
BEGIN
  FOR a IN SELECT x.* FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
    WHERE c.oid = 'public.ads_invoice_generation_operation'::regclass LOOP
    IF a.grantee = 0 OR pg_get_userbyid(a.grantee) <> 'postgres' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unexpected_operation_acl';
    END IF;
  END LOOP;
  FOR f IN SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (left(p.proname,8) = '_ads486_' OR p.proname IN (
      'ads_invoice_generation_v1','ads_invoice_import_v1','ads_invoice_reopen_v1','ads_invoice_document_complete_v1',
      'ads_invoice_line_is_pending','ads_invoice_pending_counts')) LOOP
    FOR a IN SELECT * FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) LOOP
      allowed_role := pg_get_userbyid(a.grantee);
      IF a.grantee = f.proowner THEN CONTINUE; END IF;
      IF a.grantee = 0 OR a.is_grantable OR NOT (
        (f.proname = 'ads_invoice_document_complete_v1' AND allowed_role = 'service_role') OR
        (f.proname IN ('ads_invoice_generation_v1','ads_invoice_import_v1','ads_invoice_reopen_v1') AND allowed_role = 'authenticated') OR
        (f.proname IN ('ads_invoice_line_is_pending','ads_invoice_pending_counts') AND allowed_role IN ('authenticated','service_role'))
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unexpected_function_acl', DETAIL = f.proname;
      END IF;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
