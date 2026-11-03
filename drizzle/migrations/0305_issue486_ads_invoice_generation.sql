-- #486 D1 — R2 PREPARADO, NÃO APLICADO. Não executar automaticamente.
-- Candidato D1-C3: contrato financeiro e proteção específicos de Ads v1.
-- Instalação, compilação e provas PostgreSQL P1–P9 permanecem gates separados.
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
  ADD COLUMN source_file_sha256 text CHECK (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN source_attestation jsonb,
  ADD COLUMN confirmed_revision bigint,
  ADD COLUMN confirmed_preview_hash text,
  ADD COLUMN generation_maintenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT ads486_invoice_id_company UNIQUE (id,company_id),
  ADD CONSTRAINT ads_invoice_generation_v1_shape CHECK (
    generation_revision >= 0 AND generation_cycle >= 0 AND
    ((generation_contract_version IS NULL AND generation_plan IS NULL) OR
     (generation_contract_version IS NOT DISTINCT FROM 1 AND generation_plan IS NOT NULL AND
      jsonb_typeof(generation_plan) = 'object' AND generation_plan->'version' IS NOT DISTINCT FROM '1'::jsonb))
  );
COMMENT ON COLUMN public.ads_invoice.generation_plan IS
  '#486 v1: escolhas propostas, nunca aceites. NULL mantém contrato legado; sem planos históricos.';

-- Controlo fechado. Papel/JWT/GUC não constituem contexto de comando.
CREATE SCHEMA ads486_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA ads486_private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE ads486_private.control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false CHECK (enabled IN (true,false))
);
INSERT INTO ads486_private.control(singleton,enabled) VALUES(true,false);
CREATE TABLE ads486_private.command_context (
  backend integer NOT NULL, transaction_id bigint NOT NULL,
  invoice_id uuid NOT NULL, action text NOT NULL,
  transaction_ids uuid[] NOT NULL DEFAULT '{}', line_ids uuid[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (backend,transaction_id)
);
CREATE TABLE ads486_private.preimages(signature text PRIMARY KEY,definition text NOT NULL,owner_name text NOT NULL,acl jsonb NOT NULL);
CREATE TABLE ads486_private.installation_manifest(singleton boolean PRIMARY KEY CHECK(singleton),catalog jsonb NOT NULL);
INSERT INTO ads486_private.preimages
SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),
 (SELECT coalesce(jsonb_agg(jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 'grantable',a.is_grantable)),'[]') FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)
FROM pg_proc p WHERE p.oid IN ('public.ads_invoice_line_is_pending(public.ads_invoice_line)'::regprocedure,
 'public.ads_invoice_pending_counts(uuid[])'::regprocedure,'public.ads_invoice_line_set_tour_split(uuid,jsonb)'::regprocedure);
DO $$ BEGIN
 IF (SELECT count(*) FROM ads486_private.preimages)<>3 OR EXISTS(SELECT 1 FROM ads486_private.preimages WHERE owner_name<>'postgres') THEN
   RAISE EXCEPTION 'legacy_preimage_missing';
 END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
  ('public.ads_invoice_line_is_pending(public.ads_invoice_line)','5d17486cafee4a4958c3571360261524',false,ARRAY['search_path=public']::text[]),
  ('public.ads_invoice_pending_counts(uuid[])','a0dac5afeea4c9890a1fe495a75afd95',false,ARRAY['search_path=public']::text[]),
  ('public.ads_invoice_line_set_tour_split(uuid,jsonb)','28d59eca2001138466125ffec1f35ae7',true,ARRAY['search_path=public, pg_catalog']::text[])
 ) expected(signature,body_md5,secdef,config) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
 WHERE p.oid IS NULL OR md5(p.prosrc)<>expected.body_md5 OR p.prosecdef<>expected.secdef
  OR p.proconfig IS DISTINCT FROM expected.config OR pg_get_userbyid(p.proowner)<>'postgres') THEN
  RAISE EXCEPTION 'legacy_preimage_changed';
 END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA ads486_private FROM PUBLIC, anon, authenticated, service_role;

-- Leituras operation/preview/list não entram neste cerco. O gate é consultado
-- ANTES de qualquer lock de relação/advisory/linha. V1 fechada não cerca finanças.
-- Todos os mutadores declaram a sua união de relações antes dos locks de linha,
-- evitando upgrades tardios contra generate/revert. Não altera guardas globais.
CREATE FUNCTION public._ads486_fence(p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
SET lock_timeout = '2s' SET statement_timeout = '15s'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ads486_private.control WHERE singleton AND enabled) THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='feature_disabled';
  END IF;
  IF p_action NOT IN ('generate','revert','save_plan','import','attest','set_split','confirm','reopen','document','maintenance') THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='fence_action';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='P0409', MESSAGE='read_committed_required';
  END IF;
  PERFORM set_config('lock_timeout','2s',true);
  PERFORM set_config('statement_timeout','15s',true);
  IF p_action IN ('generate','revert') THEN
    -- União financeira conservada: protege também writers já dentro de DML,
    -- phantoms e efeitos transitivos. Companies fecha a corrida de currency.
    -- Esta serialização é global; provar contenção antes de promover.
    LOCK TABLE ads486_private.command_context, ads486_private.control,
      crm.ad_platform_connections, crm.tiktok_campaign,
      public.account_categories, public.accountant_transaction_reviews,
      public.accounting_exports, public.ads_invoice, public.ads_invoice_generation_operation, public.ads_invoice_line,
      public.artist_songs, public.artists, public.bp_version_audit_log, public.bp_versions, public.companies,
      public.event_forecast_formalidade_log, public.event_forecasts, public.event_settlements,
      public.events, public.forecast_audit_log, public.payment_list_items,
      public.profiles, public.reimbursement_note_items, public.reimbursement_notes,
      public.role_permissions, public.standalone_invoices, public.suppliers, public.system_audit_log,
      public.transaction_audit_log, public.transaction_documents, public.transaction_payments, public.transactions,
      public.user_permissions, public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  ELSE
    -- ROW EXCLUSIVE é compatível com os outros comandos curtos e com writers
    -- financeiros alheios. Declarar antes de company/invoice/linhas.
    LOCK TABLE ads486_private.command_context, public.ads_invoice,
      public.ads_invoice_generation_operation, public.ads_invoice_line,
      public.transaction_documents IN ROW EXCLUSIVE MODE;
    IF p_action IN ('save_plan','import','attest') THEN
      -- Conversão v0: não pode atravessar mãe legada já inserida, unlink de
      -- âncora BP já em UPDATE ou writer que já passou a guarda. C3/P9-V0-BP
      -- cobre commit/rollback desse UPDATE, que pode não escrever transactions.
      -- Não substituir por advisory cooperativo; declarar antes da fatura.
      LOCK TABLE public.event_forecasts, public.standalone_invoices, public.transactions IN SHARE MODE;
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._ads486_fence(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_enter(p_invoice uuid,p_action text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
SET lock_timeout = '2s' SET statement_timeout = '15s'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ads486_private.control WHERE singleton AND enabled) THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='feature_disabled';
  END IF;
  INSERT INTO ads486_private.command_context(backend,transaction_id,invoice_id,action,line_ids)
  VALUES(pg_backend_pid(),txid_current(),p_invoice,p_action,
    ARRAY(SELECT id FROM public.ads_invoice_line WHERE invoice_id=p_invoice ORDER BY id));
END $$;
REVOKE ALL ON FUNCTION public._ads486_enter(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public._ads486_leave() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $$ DELETE FROM ads486_private.command_context WHERE backend=pg_backend_pid() AND transaction_id=txid_current() $$;
REVOKE ALL ON FUNCTION public._ads486_leave() FROM PUBLIC, anon, authenticated, service_role;

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
-- DML apenas pelo comando owner; service_role recebe só callbacks delimitados.

CREATE FUNCTION public._ads486_operation_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
SET lock_timeout = '2s' SET statement_timeout = '15s'
AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM ads486_private.command_context ctx WHERE ctx.backend=pg_backend_pid()
    AND ctx.transaction_id=txid_current() AND ctx.invoice_id=NEW.invoice_id AND ctx.action IN ('generate','revert','document')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ads_v1_command_required';
  END IF;
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
SET lock_timeout = '2s' SET statement_timeout = '15s'
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
SET lock_timeout = '2s' SET statement_timeout = '15s'
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
  IF octet_length(p_plan::text)>1048576 OR jsonb_array_length(p_plan->'allocations')>1000 OR
    jsonb_array_length(p_plan->'new_forecasts')>1000 OR jsonb_array_length(p_plan->'budget_proposals')>1000 THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='plan_limit';
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
    IF v_dest = 'carreira' AND (i.platform <> 'tiktok' OR l.match_source <> 'carreira' OR l.event_id IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public._ads486_tiktok_proof(i.id)) pr WHERE pr->>'line_id'=l.id::text)) THEN
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
         NOT EXISTS(SELECT 1 FROM public.events ev WHERE ev.id=v_event AND ev.company_id=i.company_id
           AND (ev.id=l.event_id OR ev.parent_event_id=l.event_id)) OR
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

CREATE FUNCTION public._ads486_policy(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'manage_transactions',public.has_permission_in(auth.uid(),'manage_transactions',p_company),
    'approve_transactions',public.has_permission_in(auth.uid(),'approve_transactions',p_company),
    'manage_bp',public.has_permission_in(auth.uid(),'manage_bp',p_company),
    'raise_budget',public.has_permission_in(auth.uid(),'raise_budget',p_company),
    'approve_bp_role',EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
      AND ((r.company_id=p_company AND r.role::text IN ('admin','manager')) OR r.role::text='platform_admin')));
END $$;
REVOKE ALL ON FUNCTION public._ads486_policy(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_financial_source(p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE i public.ads_invoice; proof jsonb; supplier_ids uuid[]; connection_proof jsonb;
BEGIN
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id=p_invoice;
  proof:=i.source_attestation->'identity';
  -- D3 verifica NIF/entidade e conta nos bytes PDF antes de atestar. SQL exige
  -- essa referência forte exacta e única no tenant; nomes/uso nunca são prova.
  SELECT array_agg(s.id ORDER BY s.id) INTO supplier_ids FROM public.suppliers s
    WHERE s.company_id=i.company_id AND s.is_active AND nullif(btrim(s.nif),'') IS NOT NULL
      AND s.nif=proof->>'supplier_nif';
  SELECT jsonb_build_object('id',c.id,'company_id',c.company_id,'platform',c.platform,
    'account_id',c.selected_ad_account_id,'status',c.status,'scope',c.connection_scope,'artist_id',c.artist_id)
    INTO connection_proof FROM crm.ad_platform_connections c
    WHERE c.id::text=proof->>'connection_id' AND c.company_id=i.company_id AND c.platform=i.platform
      AND c.status='active' AND c.selected_ad_account_id=proof->>'account_id'
      AND nullif(btrim(c.selected_ad_account_id),'') IS NOT NULL
      AND (SELECT count(*) FROM crm.ad_platform_connections other WHERE other.company_id=i.company_id
        AND other.platform=i.platform AND other.status='active'
        AND other.selected_ad_account_id=c.selected_ad_account_id)=1;
  IF proof->>'platform' IS DISTINCT FROM i.platform OR proof->>'invoice_number' IS DISTINCT FROM i.invoice_number
    OR proof->>'sha256' IS DISTINCT FROM i.source_file_sha256 OR connection_proof IS NULL
    OR cardinality(supplier_ids) IS DISTINCT FROM 1 OR supplier_ids[1]::text IS DISTINCT FROM proof->>'supplier_id' THEN
    supplier_ids:='{}'; connection_proof:=NULL;
  END IF;
  RETURN jsonb_build_object('supplier_id',CASE WHEN cardinality(supplier_ids)=1 THEN supplier_ids[1] END,
    'supplier_candidates',coalesce(to_jsonb(supplier_ids),'[]'::jsonb),'identity',proof,
    'connection',connection_proof,'connection_id',connection_proof->>'id','account_id',connection_proof->>'account_id',
    'date',i.issue_date,'due_date',CASE WHEN i.platform='meta' THEN i.issue_date+60 ELSE i.issue_date END,
    'payment_method',CASE WHEN i.platform='meta' THEN 'transfer' ELSE 'direct_debit' END,
    'iva_rate',0,'currency','EUR');
END $$;
REVOKE ALL ON FUNCTION public._ads486_financial_source(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_no_duplicate(p_invoice uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE i public.ads_invoice; sid uuid; ref text;
BEGIN
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id=p_invoice;
  sid:=(public._ads486_financial_source(i.id)->>'supplier_id')::uuid;
  ref:='ref. '||to_char(i.billing_period,'MM/YYYY');
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.company_id=i.company_id
    AND t.category_id='c0000034-0000-0000-0000-000000000001'::uuid
    AND (t.invoice_ref=i.invoice_number OR
      (strpos(lower(coalesce(t.specification,'')),lower(ref))>0
        AND (sid IS NULL OR t.supplier_id IS NULL OR t.supplier_id=sid))))
    OR EXISTS (SELECT 1 FROM public.standalone_invoices s WHERE s.company_id=i.company_id
      AND s.invoice_number=i.invoice_number) THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='duplicate_invoice';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._ads486_no_duplicate(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_tiktok_proof(p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE result jsonb;
BEGIN
  -- Apenas identidade empresa/conta/campanha. Não se junta por nomes.
  -- Se o mesmo código aparecer em mais de uma conta da empresa, sem prova
  -- inequívoca mantém-se por resolver; nunca se elege a primeira ligação.
  SELECT coalesce(jsonb_agg(q.proof ORDER BY q.line_id),'[]') INTO result FROM (
    SELECT l.id line_id, jsonb_build_object('line_id',l.id,'connection_id',min(c.id::text),
      'account_id',min(c.selected_ad_account_id),'external_campaign_id',l.external_campaign_id,
      'song_id',min(t.linked_song_id::text),'artist_id',min(song.artist_id::text)) proof
    FROM public.ads_invoice_line l JOIN public.ads_invoice i ON i.id=l.invoice_id AND i.company_id=l.company_id
    JOIN crm.tiktok_campaign t ON t.company_id=i.company_id AND t.external_campaign_id=l.external_campaign_id
    JOIN public.artist_songs song ON song.id=t.linked_song_id AND song.company_id=i.company_id
    JOIN public.artists artist ON artist.id=song.artist_id AND artist.company_id=i.company_id
    JOIN crm.ad_platform_connections c ON c.id=t.connection_id AND c.company_id=i.company_id
      AND c.platform='tiktok' AND c.status='active' AND nullif(c.selected_ad_account_id,'') IS NOT NULL
      AND c.id::text=public._ads486_financial_source(i.id)->>'connection_id'
      AND c.selected_ad_account_id=public._ads486_financial_source(i.id)->>'account_id'
      AND (c.connection_scope='company' OR c.artist_id=song.artist_id)
    WHERE i.id=p_invoice AND i.platform='tiktok' AND NOT l.is_adjustment
    GROUP BY l.id,l.external_campaign_id
    HAVING count(*)=1 AND count(t.linked_song_id)=1 AND bool_and(t.linked_event_id IS NULL)
  ) q;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public._ads486_tiktok_proof(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._ads486_classify_tiktok(p_invoice uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE proof jsonb;
BEGIN
  FOR proof IN SELECT value FROM jsonb_array_elements(public._ads486_tiktok_proof(p_invoice)) LOOP
    UPDATE public.ads_invoice_line SET match_source='carreira',match_note=proof::text,
      matched_by=auth.uid(),matched_at=now()
    WHERE id=(proof->>'line_id')::uuid AND invoice_id=p_invoice AND match_source='none'
      AND event_id IS NULL AND event_split IS NULL;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._ads486_classify_tiktok(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Cria draft pelo escritor canónico; aprovação explícita pelo mesmo papel/selos
-- do BP, com manage_bp/deny revalidado antes de chamar o helper permissivo.
CREATE FUNCTION public._ads486_create_forecast(p_company uuid,p_new jsonb,p_observation text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE policy jsonb; result jsonb; f public.event_forecasts; fid uuid; actor text;
BEGIN
  policy:=public._ads486_policy(p_company);
  IF policy->'manage_bp' IS DISTINCT FROM 'true'::jsonb OR
    policy->'approve_bp_role' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bp_approval_required';
  END IF;
  IF nullif(btrim(p_observation),'') IS NULL OR p_new->>'currency' IS DISTINCT FROM 'EUR' THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='currency_unrepresentable';
  END IF;
  result:=public.batch_save_event_forecasts((p_new->>'event_id')::uuid,NULL::uuid,
    jsonb_build_array(jsonb_build_object('type','expense','description',p_new->>'description',
      'specification',p_new->>'specification','amount',public._ads486_money(p_new->'amount'),
      'category_id',p_new->>'category_id','iva_rate',0,'formalidade','estimado','notes',btrim(p_observation))),
    '[]'::jsonb,'Fatura Ads: criação aceite individualmente');
  IF result->>'inserted' IS DISTINCT FROM '1' OR jsonb_array_length(result->'ids')<>1 THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='bp_create_failed';
  END IF;
  fid:=(result->'ids'->>0)::uuid;
  SELECT * INTO STRICT f FROM public.event_forecasts WHERE id=fid;
  IF f.company_id IS DISTINCT FROM p_company OR f.event_id IS DISTINCT FROM (p_new->>'event_id')::uuid
    OR f.status<>'draft' OR f.currency IS DISTINCT FROM 'EUR' OR f.version_id IS NOT NULL
    OR f.amount IS DISTINCT FROM public._ads486_money(p_new->'amount') OR f.baseline_amount IS DISTINCT FROM f.amount THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='bp_create_failed';
  END IF;
  SELECT coalesce(email,auth.uid()::text) INTO actor FROM public.profiles WHERE id=auth.uid();
  UPDATE public.event_forecasts SET status='approved',approved_at=now(),
    approved_by=coalesce(actor,auth.uid()::text) WHERE id=fid;
  UPDATE public.events SET status='active' WHERE id=f.event_id AND status IN ('planning','confirmed');
  RETURN fid;
END $$;
REVOKE ALL ON FUNCTION public._ads486_create_forecast(uuid,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;


-- Esta leitura é o único cálculo v1. Não escreve linhas de BP/transações/operações.
-- Generate chama ESTE helper dentro do cerco financeiro, após todas as esperas.
CREATE FUNCTION public._ads486_preview(p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
SET lock_timeout = '2s' SET statement_timeout = '15s'
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
  -- A raiz e uma parcela adotada nunca somam a mesma verba. Sem composição
  -- canónica inequívoca, bloquear em vez de inventar disponibilidade do Master.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(forecasts) f
    JOIN public.event_forecasts city ON city.master_forecast_id=(f->>'id')::uuid
    WHERE city.company_id=i.company_id AND city.version_id IS NULL
      AND city.status='approved') THEN
    blockers := blockers || '[{"code":"ambiguous_master_budget"}]'::jsonb;
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
  SELECT jsonb_build_object('company',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',co.id,'currency',co.currency) ORDER BY co.id),'[]')
      FROM public.companies co WHERE co.id=i.company_id),
    'invoice', jsonb_build_object('id',i.id,'company_id',i.company_id,
    'platform',i.platform,'invoice_number',i.invoice_number,'currency',i.currency,'billing_period',i.billing_period,
    'issue_date',i.issue_date,'total_amount',i.total_amount,'lines_sum',i.lines_sum,'source',i.source,
    'file_path',i.file_path,'source_file_sha256',i.source_file_sha256,
    'source_attestation',i.source_attestation,'parent_transaction_id',i.parent_transaction_id),
    'lines',(SELECT coalesce(jsonb_agg(to_jsonb(l) - ARRAY['created_at','updated_at','matched_at','line_no'] ORDER BY l.id),'[]')
             FROM public.ads_invoice_line l WHERE l.invoice_id = i.id),
    'actor',jsonb_build_object('id',auth.uid(),'email',(SELECT email FROM public.profiles WHERE id=auth.uid())),
    'categories',(SELECT coalesce(jsonb_agg(to_jsonb(cat)-ARRAY['created_at','updated_at'] ORDER BY cat.id),'[]')
      FROM public.account_categories cat WHERE cat.company_id=i.company_id AND EXISTS(
        SELECT 1 FROM jsonb_array_elements(children) x WHERE x->>'category_id'=cat.id::text)),
    'settlements',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',es.id,'event_id',es.event_id,'is_sealed',es.is_sealed) ORDER BY es.id),'[]')
      FROM public.event_settlements es WHERE EXISTS(SELECT 1 FROM public.events ev WHERE ev.id=es.event_id
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(children) x WHERE x->>'event_id'=ev.id::text OR
          EXISTS(SELECT 1 FROM public.events city WHERE city.id::text=x->>'event_id' AND city.parent_event_id=ev.id)))),
    'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'company_id',e.company_id,
               'parent_event_id',e.parent_event_id,'status',e.status,
               'closed_at',e.closed_at,'historical_at',e.historical_at) ORDER BY e.id),'[]') FROM public.events e
               WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(children) x WHERE x->>'event_id' = e.id::text OR
                 EXISTS(SELECT 1 FROM public.events city WHERE city.id::text=x->>'event_id' AND city.parent_event_id=e.id))),
    'policy',public._ads486_policy(i.company_id),'financial',public._ads486_financial_source(i.id),
    'classification',public._ads486_tiktok_proof(i.id),
    'plan',p,'forecasts',forecasts,'commitments',commitments,'deduplication',deduplication) INTO sources;
  IF i.currency IS DISTINCT FROM 'EUR' OR
    (SELECT count(*) FROM public.companies co WHERE co.id=i.company_id AND co.currency='EUR')<>1 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(forecasts) f WHERE
      f->>'currency' IS DISTINCT FROM 'EUR' OR
      (f->>'fx_rate' IS NOT NULL AND (f->>'fx_rate')::numeric <> 1) OR
      (f->>'original_amount' IS NOT NULL AND (f->>'original_amount')::numeric IS DISTINCT FROM (f->>'amount')::numeric)
  ) OR EXISTS (SELECT 1 FROM jsonb_array_elements(commitments) t WHERE
    t->>'currency' IS DISTINCT FROM 'EUR' OR t->>'fx_rate' IS NOT NULL AND (t->>'fx_rate')::numeric <> 1 OR
    t->>'original_amount' IS NOT NULL AND (t->>'original_amount')::numeric IS DISTINCT FROM (t->>'amount')::numeric) THEN
    blockers := blockers || '[{"code":"currency_unrepresentable"}]'::jsonb;
  END IF;
  IF i.source <> 'pdf' OR i.source_file_sha256 IS NULL OR i.source_attestation->>'path' IS DISTINCT FROM i.file_path OR
    i.source_attestation->>'sha256' IS DISTINCT FROM i.source_file_sha256 THEN
    blockers := blockers || '[{"code":"source_attestation_required"}]'::jsonb;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(children) c WHERE public._ads486_money(c->'amount')<=0)
    OR v_sum<=0 THEN
    blockers := blockers || '[{"code":"unsupported_financial_shape"}]'::jsonb;
  END IF;
  IF EXISTS (SELECT 1 FROM public.events e WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(children) c WHERE c->>'event_id'=e.id::text)
    AND (e.status IN ('completed','cancelled') OR e.closed_at IS NOT NULL OR e.historical_at IS NOT NULL
      OR EXISTS(SELECT 1 FROM public.events master WHERE master.id=e.parent_event_id
        AND (master.status IN ('completed','cancelled') OR master.closed_at IS NOT NULL OR master.historical_at IS NOT NULL))
      OR EXISTS(SELECT 1 FROM public.event_settlements es WHERE es.event_id IN (e.id,e.parent_event_id) AND es.is_sealed))) THEN
    blockers := blockers || '[{"code":"event_locked"}]'::jsonb;
  END IF;
  IF public._ads486_financial_source(i.id)->>'supplier_id' IS NULL OR i.issue_date IS NULL THEN
    blockers := blockers || '[{"code":"financial_source_required"}]'::jsonb;
  END IF;
  snapshot := jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,
    'generation_cycle',i.generation_cycle,'currency',i.currency,'allocations',expanded,'children',children,
    'line_budgets',line_budgets,'category_budgets',category_budgets,'effects',effects,'blockers',blockers,
    'totals',jsonb_build_object('children',public._ads486_decimal(v_sum),'outside',public._ads486_decimal(v_outside),
      'invoice',public._ads486_decimal(i.total_amount)));
  RETURN snapshot || jsonb_build_object('preview_hash',encode(sha256(convert_to(
    jsonb_build_object('snapshot',snapshot,'sources',sources)::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION public._ads486_preview(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Outbox finita, com identidade/recursos imutáveis e ordem por posição no array.
-- O consumidor D3 deve repetir efeitos externos idempotentemente antes do ack.
CREATE FUNCTION public._ads486_task(p_invoice uuid,p_action text,p_revision bigint,p_operation uuid,p_resources jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public AS $$
DECLARE i public.ads_invoice;
BEGIN
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id=p_invoice;
  IF p_action NOT IN ('lock_campaigns','unlock_campaigns','revert_cleanup') OR
    p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_resources) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='maintenance_task';
  END IF;
  IF jsonb_array_length(i.generation_maintenance)>=2048 THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='maintenance_capacity';
  END IF;
  RETURN jsonb_build_object('task_id',gen_random_uuid(),'company_id',i.company_id,'invoice_id',i.id,
    'action',p_action,'revision',p_revision,'generation_cycle',i.generation_cycle,'operation_id',p_operation,
    'resources',p_resources,'status','pending','attempt',1,'error_code',NULL,'receipts','{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public._ads486_task(uuid,text,bigint,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Fronteira única. Nenhum aceite/valor de efeito é lido do plano do cliente.
CREATE FUNCTION public.ads_invoice_generation_v1(
  p_invoice_id uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
SET lock_timeout='2s' SET statement_timeout='15s'
AS $$
DECLARE i public.ads_invoice; u uuid; o public.ads_invoice_generation_operation; expected bigint;
  preview jsonb; a jsonb; e jsonb; n jsonb; c jsonb; p jsonb; financial jsonb; policy jsonb;
  approvals jsonb; request_hash text; request_key uuid; operation_id uuid; parent_id uuid; child_id uuid;
  forecast_map jsonb:='{}'; children jsonb:='[]'; applied_effects jsonb:='[]'; documents jsonb:='[]';
  result jsonb; prior_audits uuid[]; audit_refs jsonb; tx_ids uuid[]; fid uuid; split_line public.ads_invoice_line; split_ids uuid[]:='{}'; split_total numeric:=0; parts jsonb:='[]'; actor text; prefix text; total numeric; before_row public.event_forecasts;
BEGIN
  SELECT * INTO i FROM public.ads_invoice WHERE id=p_invoice_id;
  u:=public._ads486_access(i.company_id);
  IF p_action='operation' THEN
    PERFORM public._ads486_keys(p_payload,ARRAY[]::text[]);
    RETURN (SELECT jsonb_build_object('contract_version',1,'invoice_id',ai.id,'revision',ai.generation_revision,
      'generation_cycle',ai.generation_cycle,'operation',(SELECT to_jsonb(op) FROM public.ads_invoice_generation_operation op
        WHERE op.invoice_id=ai.id AND op.company_id=ai.company_id ORDER BY generation_cycle DESC LIMIT 1),
      'maintenance',ai.generation_maintenance) FROM public.ads_invoice ai WHERE ai.id=p_invoice_id AND ai.company_id=i.company_id);
  END IF;
  IF p_action='preview' THEN
    PERFORM public._ads486_keys(p_payload,ARRAY['expected_revision']);
  ELSIF p_action='save_plan' THEN
    PERFORM public._ads486_keys(p_payload,ARRAY['expected_revision','plan'],ARRAY['expected_revision','plan']);
  ELSIF p_action='set_split' THEN
    PERFORM public._ads486_keys(p_payload,ARRAY['expected_revision','line_id','parts'],ARRAY['expected_revision','line_id','parts']);
  ELSIF p_action='confirm' THEN
    PERFORM public._ads486_keys(p_payload,ARRAY['expected_revision','preview_hash'],ARRAY['expected_revision','preview_hash']);
  ELSIF p_action='generate' THEN
    PERFORM public._ads486_keys(p_payload,ARRAY['request_key','expected_revision','preview_hash','approvals'],
      ARRAY['request_key','expected_revision','preview_hash','approvals']);
    request_key:=public._ads486_uuid(p_payload->'request_key');
    IF jsonb_typeof(p_payload->'approvals') IS DISTINCT FROM 'array' OR
      coalesce(p_payload->>'preview_hash','') !~ '^[0-9a-f]{64}$' OR
      jsonb_array_length(p_payload->'approvals')>1000 OR octet_length(p_payload::text)>1048576 THEN
      RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='generate_shape';
    END IF;
    FOR a IN SELECT value FROM jsonb_array_elements(p_payload->'approvals') LOOP
      PERFORM public._ads486_keys(a,ARRAY['effect_id','accepted','observation'],ARRAY['effect_id','accepted','observation']);
      IF jsonb_typeof(a->'effect_id') IS DISTINCT FROM 'string' OR a->'accepted' IS DISTINCT FROM 'true'::jsonb
        OR jsonb_typeof(a->'observation') IS DISTINCT FROM 'string' OR nullif(btrim(a->>'observation'),'') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='approval_required';
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'approvals') a GROUP BY a->>'effect_id' HAVING count(*)<>1) THEN
      RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='approval_required';
    END IF;
    SELECT coalesce(jsonb_agg(a ORDER BY (a->>'effect_id') COLLATE "C"),'[]') INTO approvals
      FROM jsonb_array_elements(p_payload->'approvals') a;
  ELSE
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='unknown_action';
  END IF;
  IF p_payload ? 'expected_revision' THEN
    IF jsonb_typeof(p_payload->'expected_revision') IS DISTINCT FROM 'number' OR
      p_payload->>'expected_revision' !~ '^(0|[1-9][0-9]{0,15})$' OR
      (p_payload->>'expected_revision')::numeric>9007199254740991 THEN
      RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='expected_revision';
    END IF;
    expected:=(p_payload->>'expected_revision')::bigint;
  END IF;
  IF p_action='preview' THEN
    -- STABLE helper: uma fotografia MVCC para fontes/hash/valores. Sem FOR UPDATE
    -- nem advisory; o gerador volta a calcular depois de adquirir o cerco.
    preview:=public._ads486_preview(i.id);
    IF expected IS NOT NULL AND expected<>(preview->>'revision')::bigint THEN
      RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='revision_conflict';
    END IF;
    RETURN preview;
  END IF;
  PERFORM public._ads486_fence(p_action);
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:company:'||i.company_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:invoice:'||i.id::text,0));
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id=p_invoice_id FOR UPDATE;
  u:=public._ads486_access(i.company_id);
  PERFORM 1 FROM public.ads_invoice_line WHERE invoice_id=i.id ORDER BY id FOR UPDATE;
  IF p_action='generate' THEN
    policy:=public._ads486_policy(i.company_id);
    IF policy->'manage_transactions' IS DISTINCT FROM 'true'::jsonb OR
      policy->'approve_transactions' IS DISTINCT FROM 'true'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden';
    END IF;
    -- Resolver chave antes da revisão/dos duplicados/do recálculo; revert
    -- incrementa ciclo mas o pedido original continua terminal.
    SELECT * INTO o FROM public.ads_invoice_generation_operation op
      WHERE op.company_id=i.company_id AND op.request_key=(p_payload->>'request_key')::uuid;
    request_hash:=encode(sha256(convert_to(jsonb_build_object('action','generate','invoice_id',i.id,
      'cycle',coalesce(o.generation_cycle,i.generation_cycle),'revision',expected,
      'preview_hash',p_payload->>'preview_hash','approvals',approvals)::text,'UTF8')),'hex');
    IF o.id IS NOT NULL THEN
      IF o.invoice_id<>i.id OR o.request_hash<>request_hash THEN
        RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='request_conflict';
      END IF;
      RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,
        'generation_cycle',i.generation_cycle,'operation',to_jsonb(o),'already',true);
    END IF;
    SELECT * INTO o FROM public.ads_invoice_generation_operation op WHERE op.invoice_id=i.id AND op.generation_cycle=i.generation_cycle;
    IF o.id IS NOT NULL THEN
      RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,
        'generation_cycle',i.generation_cycle,'operation',to_jsonb(o),'already',true);
    END IF;
  END IF;
  IF expected IS NOT NULL AND expected<>i.generation_revision THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='revision_conflict';
  END IF;
  PERFORM public._ads486_enter(i.id,p_action);
  IF p_action='set_split' THEN
    IF i.status<>'proposed' OR i.parent_transaction_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='request_conflict';
    END IF;
    SELECT * INTO split_line FROM public.ads_invoice_line WHERE id=public._ads486_uuid(p_payload->'line_id')
      AND invoice_id=i.id AND company_id=i.company_id;
    IF split_line.id IS NULL OR split_line.is_adjustment OR split_line.event_id IS NULL
      OR jsonb_typeof(p_payload->'parts') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='split_media_required';
    END IF;
    FOR a IN SELECT value FROM jsonb_array_elements(p_payload->'parts') LOOP
      PERFORM public._ads486_keys(a,ARRAY['event_id','amount','source'],ARRAY['event_id','amount']);
      fid:=public._ads486_uuid(a->'event_id');
      IF fid=ANY(split_ids) OR public._ads486_money(a->'amount')<0 OR NOT EXISTS(
        SELECT 1 FROM public.events ev WHERE ev.id=fid AND ev.company_id=i.company_id
          AND (ev.id=split_line.event_id OR ev.parent_event_id=split_line.event_id)) THEN
        RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='split_family';
      END IF;
      split_ids:=array_append(split_ids,fid);split_total:=split_total+public._ads486_money(a->'amount');
      parts:=parts||jsonb_build_array(jsonb_build_object('event_id',fid,'amount',public._ads486_money(a->'amount'),'source','manual'));
    END LOOP;
    IF cardinality(split_ids)>0 AND split_total<>split_line.amount THEN
      RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='split_sum';
    END IF;
    UPDATE public.ads_invoice_line SET event_split=CASE WHEN parts='[]'::jsonb THEN NULL ELSE parts END,
      matched_by=u,matched_at=now(),updated_at=now() WHERE id=split_line.id;
    -- Invalida as escolhas BP desta linha; não as replica arbitrariamente para
    -- as cidades. D3 tem de recolher as novas seleções e gravar o plano completo.
    SELECT coalesce(jsonb_agg(al),'[]') INTO p FROM jsonb_array_elements(i.generation_plan->'allocations') al
      WHERE al->>'line_id'<>split_line.id::text;
    p:=jsonb_build_object('version',1,'allocations',p,'new_forecasts',
      (SELECT coalesce(jsonb_agg(nf),'[]') FROM jsonb_array_elements(i.generation_plan->'new_forecasts') nf
       WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p) al WHERE al->>'new_forecast_key'=nf->>'key')),
      'budget_proposals',(SELECT coalesce(jsonb_agg(bp),'[]') FROM jsonb_array_elements(i.generation_plan->'budget_proposals') bp
       WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(p) al WHERE al->>'forecast_id'=bp->>'forecast_id')));
    UPDATE public.ads_invoice SET generation_revision=generation_revision+1,generation_plan=p,
      confirmed_revision=NULL,confirmed_preview_hash=NULL,confirmed_by=NULL,confirmed_at=NULL,updated_at=now() WHERE id=i.id;
    PERFORM public._ads486_leave();
    RETURN jsonb_build_object('ok',true,'contract_version',1,'invoice_id',i.id,'revision',i.generation_revision+1,
      'parts',cardinality(split_ids),'cleared',cardinality(split_ids)=0);
  END IF;
  IF p_action='save_plan' THEN
    IF i.status<>'proposed' OR i.parent_transaction_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.ads_invoice_generation_operation op WHERE op.invoice_id=i.id AND op.state<>'reverted') THEN
      RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='request_conflict',DETAIL='invoice_not_editable';
    END IF;
    PERFORM public._ads486_no_duplicate(i.id);
    PERFORM public._ads486_classify_tiktok(i.id);
    p:=public._ads486_plan(i.id,p_payload->'plan');
    UPDATE public.ads_invoice SET generation_plan=p,generation_contract_version=1,
      generation_revision=generation_revision+1,confirmed_revision=NULL,confirmed_preview_hash=NULL,
      confirmed_by=NULL,confirmed_at=NULL,updated_at=now() WHERE id=i.id;
    PERFORM public._ads486_classify_tiktok(i.id);
    PERFORM public._ads486_leave();
    RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision+1,
      'generation_cycle',i.generation_cycle,'plan',p);
  END IF;
  PERFORM public._ads486_no_duplicate(i.id);
  preview:=public._ads486_preview(i.id);
  IF preview->>'preview_hash' IS DISTINCT FROM p_payload->>'preview_hash' THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='preview_stale';
  END IF;
  IF preview->'blockers'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='generation_blocked',DETAIL=(preview->'blockers')::text;
  END IF;
  IF p_action='confirm' THEN
    IF i.status NOT IN ('proposed','confirmed') OR i.parent_transaction_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='request_conflict';
    END IF;
    IF i.status='confirmed' AND i.confirmed_revision=i.generation_revision AND i.confirmed_preview_hash=preview->>'preview_hash' THEN
      PERFORM public._ads486_leave();
      RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,'status','confirmed');
    END IF;
    UPDATE public.ads_invoice SET status='confirmed',confirmed_revision=i.generation_revision,
      confirmed_preview_hash=preview->>'preview_hash',confirmed_by=u,confirmed_at=now(),
      generation_maintenance=generation_maintenance || CASE WHEN i.status='confirmed' THEN jsonb_build_array(public._ads486_task(i.id,'unlock_campaigns',i.generation_revision,NULL,coalesce((SELECT t->'resources' FROM jsonb_array_elements(i.generation_maintenance) WITH ORDINALITY q(t,ord) WHERE t->>'action'='lock_campaigns' ORDER BY ord DESC LIMIT 1),'{}'::jsonb))) ELSE '[]'::jsonb END || jsonb_build_array(public._ads486_task(i.id,'lock_campaigns',
        i.generation_revision,NULL,jsonb_build_object('source',i.source_attestation,
        'source_lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('line_id',l.id,'platform',i.platform,
          'external_campaign_id',l.external_campaign_id) ORDER BY l.id),'[]')
          FROM public.ads_invoice_line l WHERE l.invoice_id=i.id)))),updated_at=now() WHERE id=i.id;
    PERFORM public._ads486_leave();
    RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,'status','confirmed');
  END IF;
  IF i.status<>'confirmed' OR i.confirmed_revision IS DISTINCT FROM i.generation_revision OR
    i.confirmed_preview_hash IS DISTINCT FROM preview->>'preview_hash' OR i.parent_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='confirmation_required';
  END IF;
  IF jsonb_array_length(approvals)<>jsonb_array_length(preview->'effects') OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(preview->'effects') eff WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(approvals) ap WHERE ap->>'effect_id'=eff->>'effect_id')) THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='approval_required';
  END IF;
  -- Valida TODOS os gates antes da primeira escrita financeira, inclusive deny
  -- de platform_admin. O contexto privado por si só não concede autorização.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'effects') eff WHERE
    (eff->>'kind'='raise' AND policy->'raise_budget' IS DISTINCT FROM 'true'::jsonb) OR
    (eff->>'kind'='create' AND (policy->'manage_bp' IS DISTINCT FROM 'true'::jsonb OR
      policy->'approve_bp_role' IS DISTINCT FROM 'true'::jsonb))) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='bp_approval_required';
  END IF;
  -- Deterministic reads after the table fence; no late upgrades of relations.
  PERFORM 1 FROM public.events ev WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'children') ch
    WHERE ch->>'event_id'=ev.id::text) ORDER BY ev.id FOR UPDATE;
  PERFORM 1 FROM public.event_forecasts f WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'children') ch
    WHERE ch->>'forecast_id'=f.id::text) ORDER BY f.id FOR UPDATE;
  FOR e IN SELECT value FROM jsonb_array_elements(preview->'effects') LOOP
    SELECT value INTO a FROM jsonb_array_elements(approvals) ap WHERE ap->>'effect_id'=e->>'effect_id';
    audit_refs:='[]';
    IF e->>'kind'='create' THEN
      SELECT value INTO n FROM jsonb_array_elements(i.generation_plan->'new_forecasts') nf
        WHERE nf->>'key'=e->>'new_forecast_key';
      fid:=public._ads486_create_forecast(i.company_id,n,a->>'observation');
      forecast_map:=forecast_map||jsonb_build_object(e->>'new_forecast_key',fid);
    ELSE
      fid:=(e->>'forecast_id')::uuid;
      SELECT * INTO STRICT before_row FROM public.event_forecasts WHERE id=fid;
      SELECT coalesce(array_agg(id),'{}') INTO prior_audits FROM public.forecast_audit_log WHERE forecast_id=fid;
      PERFORM public.raise_forecast_budget(fid,public._ads486_money(e->'after'),a->>'observation');
      SELECT coalesce(jsonb_agg(to_jsonb(log) ORDER BY id),'[]') INTO audit_refs
        FROM public.forecast_audit_log log WHERE forecast_id=fid AND NOT(id=ANY(prior_audits));
      IF (SELECT count(*) FROM jsonb_array_elements(audit_refs) ar WHERE ar->>'field_name'='Valor (EUR)')<>1 THEN
        RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='canonical_audit_mismatch';
      END IF;
      IF (SELECT baseline_amount FROM public.event_forecasts WHERE id=fid) IS DISTINCT FROM before_row.baseline_amount THEN
        RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='baseline_changed';
      END IF;
    END IF;
    applied_effects:=applied_effects||jsonb_build_array(e||jsonb_build_object('forecast_id',fid,'approval',a,'audit_refs',audit_refs));
  END LOOP;
  financial:=public._ads486_financial_source(i.id);
  total:=public._ads486_money(preview->'totals'->'children');
  operation_id:=gen_random_uuid(); parent_id:=gen_random_uuid(); tx_ids:=ARRAY[parent_id];
  FOR c IN SELECT value FROM jsonb_array_elements(preview->'children') LOOP
    child_id:=gen_random_uuid(); tx_ids:=array_append(tx_ids,child_id);
    fid:=coalesce((c->>'forecast_id')::uuid,(forecast_map->> (c->>'new_forecast_key'))::uuid);
    children:=children||jsonb_build_array(c||jsonb_build_object('transaction_id',child_id,'forecast_id',fid));
  END LOOP;
  UPDATE ads486_private.command_context SET transaction_ids=tx_ids WHERE backend=pg_backend_pid() AND transaction_id=txid_current();
  INSERT INTO public.transactions(id,company_id,type,category_id,description,specification,amount,iva_rate,status,
    supplier_id,payment_method,date,due_date,event_id,invoice_ref,split_mode,currency)
  VALUES(parent_id,i.company_id,'expense','c0000034-0000-0000-0000-000000000001','Trafego Pago',
    'ref. '||to_char(i.billing_period,'MM/YYYY'),total,0,'approved',(financial->>'supplier_id')::uuid,
    financial->>'payment_method',i.issue_date,(financial->>'due_date')::date,NULL,i.invoice_number,'absolute','EUR');
  FOR c IN SELECT value FROM jsonb_array_elements(children) LOOP
    INSERT INTO public.transactions(id,company_id,type,category_id,description,specification,amount,iva_rate,status,
      supplier_id,payment_method,date,due_date,event_id,invoice_ref,parent_transaction_id,forecast_id,split_mode,split_percentage,currency)
    VALUES((c->>'transaction_id')::uuid,i.company_id,'expense',(c->>'category_id')::uuid,'Trafego Pago',
      'ref. '||to_char(i.billing_period,'MM/YYYY')||CASE c->>'destination'
        WHEN 'carreira' THEN ' · Carreira (TikTok)' WHEN 'company' THEN ' · Empresa' ELSE '' END,
      public._ads486_money(c->'amount'),0,'approved',(financial->>'supplier_id')::uuid,
      financial->>'payment_method',i.issue_date,(financial->>'due_date')::date,(c->>'event_id')::uuid,
      i.invoice_number,parent_id,(c->>'forecast_id')::uuid,'percentage',
      round(public._ads486_money(c->'amount')/total*100,4),'EUR');
  END LOOP;
  -- Scalar só quando representa o vínculo completo. N:N retido no snapshot.
  UPDATE public.ads_invoice_line l SET transaction_id=(
    SELECT CASE WHEN count(DISTINCT ch->>'transaction_id')=1 THEN min(ch->>'transaction_id')::uuid END
    FROM jsonb_array_elements(children) ch CROSS JOIN LATERAL jsonb_array_elements(ch->'source_line_allocations') al
    WHERE al->>'line_id'=l.id::text) WHERE l.invoice_id=i.id;
  prefix:=i.company_id::text||'/ads-invoices/operations/'||operation_id::text||'/';
  documents:=jsonb_build_array(jsonb_build_object('key','original','transaction_id',parent_id,'bucket','transaction-documents',
    'path',prefix||'original.pdf','name',i.invoice_number||'.pdf','doc_type','fatura','is_accounting',true,
    'status','pending','document_id',NULL,'error_code',NULL));
  FOR c IN SELECT value FROM jsonb_array_elements(children) LOOP
    documents:=documents||jsonb_build_array(jsonb_build_object('key','proof:'||(c->>'key'),
      'transaction_id',c->>'transaction_id','bucket','transaction-documents','path',prefix||'proof-'||(c->>'key')||'.pdf',
      'name','Comprovativo '||i.invoice_number||' '||(c->>'key')||'.pdf','doc_type','comprovativo_veiculacao',
      'is_accounting',false,'status','pending','document_id',NULL,'error_code',NULL));
  END LOOP;
  result:=jsonb_build_object('parent',jsonb_build_object('id',parent_id,'amount',public._ads486_decimal(total)),
    'children',children,'effects',applied_effects,'approvals',approvals,'source',i.source_attestation,
    'financial',financial,'preview',preview,
    'financial_rows',(SELECT jsonb_agg(to_jsonb(t)-ARRAY['created_at','updated_at','paid_amount','status','payment_date'] ORDER BY t.id)
      FROM public.transactions t WHERE t.id=ANY(tx_ids)));
  INSERT INTO public.ads_invoice_generation_operation(id,invoice_id,company_id,generation_cycle,request_key,preview_hash,
    request_hash,plan_snapshot,result_snapshot,documents,state,created_by)
  VALUES(operation_id,i.id,i.company_id,i.generation_cycle,(p_payload->>'request_key')::uuid,preview->>'preview_hash',
    request_hash,i.generation_plan,result,documents,'financial_committed',u) RETURNING * INTO o;
  UPDATE public.ads_invoice SET status='applied',parent_transaction_id=parent_id,applied_by=u,applied_at=now(),updated_at=now() WHERE id=i.id;
  PERFORM public._ads486_leave();
  RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,
    'generation_cycle',i.generation_cycle,'operation',to_jsonb(o),'already',false);
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_generation_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_generation_v1(uuid,text,jsonb) TO authenticated;


-- Reabertura apenas pré-financeira. Conserva plano, incrementa revisão.
-- Não desbloqueia CRM: D3 tem de integrar os handlers/campanhas existentes.
CREATE FUNCTION public.ads_invoice_reopen_v1(p_invoice_id uuid, p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
SET lock_timeout = '2s' SET statement_timeout = '15s'
AS $$
DECLARE i public.ads_invoice; u uuid;
BEGIN
  SELECT * INTO i FROM public.ads_invoice WHERE id = p_invoice_id;
  u := public._ads486_access(i.company_id);
  PERFORM public._ads486_fence('reopen');
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
  IF NOT public.has_permission_in(u,'manage_transactions',i.company_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden';
  END IF;
  PERFORM public._ads486_enter(i.id,'reopen');
  UPDATE public.ads_invoice SET confirmed_revision=NULL,confirmed_preview_hash=NULL,
    generation_maintenance=generation_maintenance || jsonb_build_array(public._ads486_task(i.id,'unlock_campaigns',i.generation_revision,NULL,
      coalesce((SELECT t->'resources' FROM jsonb_array_elements(i.generation_maintenance) WITH ORDINALITY q(t,ord)
        WHERE t->>'action'='lock_campaigns' ORDER BY ord DESC LIMIT 1),'{}'::jsonb))),
    status = 'proposed',confirmed_by = NULL,confirmed_at = NULL,
    reopened_by = u,reopened_at = now(),reopen_count = reopen_count+1,
    generation_revision = generation_revision+1,updated_at = now() WHERE id = i.id;
  PERFORM public._ads486_leave();
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
SET lock_timeout = '2s' SET statement_timeout = '15s'
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
  IF jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines)>1000 OR
    octet_length(p_lines::text)+octet_length(p_invoice::text)>1048576 THEN
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
  PERFORM public._ads486_fence('import');
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
  IF NOT EXISTS (SELECT 1 FROM ads486_private.control WHERE singleton AND enabled) THEN
    RAISE EXCEPTION USING ERRCODE='0A000',MESSAGE='feature_disabled';
  END IF;
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
    v_invoice_id := gen_random_uuid();
    PERFORM public._ads486_enter(v_invoice_id,'import');
    INSERT INTO public.ads_invoice(id,company_id,platform,invoice_number,currency,billing_period,issue_date,
      total_amount,lines_sum,source,source_ref,file_path,status)
    VALUES(v_invoice_id,company,p_invoice->>'platform',p_invoice->>'invoice_number',p_invoice->>'currency',
      (p_invoice->>'billing_period')::date,(p_invoice->>'issue_date')::date,
      public._ads486_money(p_invoice->'total_amount'),v_sum,'pdf',p_invoice->>'source_ref',p_invoice->>'file_path','proposed')
    RETURNING id INTO v_invoice_id;
  ELSE v_invoice_id := i.id;
    PERFORM public._ads486_enter(v_invoice_id,'import');
  END IF;
  PERFORM public._ads486_no_duplicate(v_invoice_id);
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
      next_id := gen_random_uuid();
      UPDATE ads486_private.command_context SET line_ids=array_append(line_ids,next_id)
        WHERE backend=pg_backend_pid() AND transaction_id=txid_current();
      INSERT INTO public.ads_invoice_line(id,invoice_id,company_id,line_no,raw_description,placement,campaign_name,
        external_campaign_id,amount,is_adjustment,event_id,event_split,match_source,match_note,matched_by,matched_at)
      VALUES(next_id,v_invoice_id,company,(line->>'line_no')::integer,line->>'raw_description',line->>'placement',line->>'campaign_name',
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
  UPDATE public.ads_invoice SET source_file_sha256=NULL,source_attestation=NULL,
    generation_maintenance=generation_maintenance||CASE WHEN i.status='confirmed' THEN jsonb_build_array(public._ads486_task(i.id,'unlock_campaigns',i.generation_revision,NULL,coalesce((SELECT t->'resources' FROM jsonb_array_elements(i.generation_maintenance) WITH ORDINALITY q(t,ord) WHERE t->>'action'='lock_campaigns' ORDER BY ord DESC LIMIT 1),'{}'::jsonb))) ELSE '[]'::jsonb END,
    confirmed_revision=NULL,confirmed_preview_hash=NULL,
    currency = p_invoice->>'currency',billing_period = (p_invoice->>'billing_period')::date,
    issue_date = (p_invoice->>'issue_date')::date,total_amount = public._ads486_money(p_invoice->'total_amount'),lines_sum = v_sum,
    source = 'pdf',source_ref = p_invoice->>'source_ref',file_path = p_invoice->>'file_path',status = 'proposed',
    confirmed_by = NULL,confirmed_at = NULL,generation_plan = plan,
    generation_revision = generation_revision+1,updated_at = now() WHERE id = v_invoice_id;
  PERFORM public._ads486_classify_tiktok(v_invoice_id);
  PERFORM public._ads486_leave();
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
SET lock_timeout = '2s' SET statement_timeout = '15s'
AS $$
DECLARE d jsonb; prefix text := p_company::text || '/ads-invoices/operations/' || p_operation::text || '/';
BEGIN
  IF jsonb_typeof(p_documents) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_documents) x GROUP BY x->>'key' HAVING count(*) > 1) OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(p_documents) x GROUP BY x->>'path' HAVING count(*) > 1) THEN RETURN false; END IF;
  FOR d IN SELECT value FROM jsonb_array_elements(p_documents) LOOP
    PERFORM public._ads486_keys(d,
      ARRAY['key','transaction_id','bucket','path','name','doc_type','is_accounting','status','document_id','error_code','sha256'],
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
       (d->>'status' = 'complete' AND (d->>'document_id' IS NULL OR coalesce(d->>'sha256','') !~ '^[0-9a-f]{64}$')) OR
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
SET lock_timeout = '2s' SET statement_timeout = '15s'
AS $$
DECLARE o public.ads_invoice_generation_operation; i public.ads_invoice; task jsonb; tasks jsonb;
  doc public.transaction_documents; v_index integer; v_count integer; v_doc_id uuid; v_tx_id uuid; v_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;
  PERFORM public._ads486_keys(p_payload,ARRAY['company_id','transaction_id','bucket','path','status','error_code','sha256'],
    ARRAY['company_id','transaction_id','bucket','path','status']);
  SELECT * INTO o FROM public.ads_invoice_generation_operation WHERE id = p_operation_id;
  IF NOT FOUND OR o.company_id <> public._ads486_uuid(p_payload->'company_id') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'forbidden';
  END IF;
  PERFORM public._ads486_fence('document');
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
  -- Snapshot imutável: parent.id e children[].transaction_id; sem heurísticas.
  IF NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = v_tx_id AND t.company_id = o.company_id
                 AND ((task->>'key' = 'original' AND t.id::text = o.result_snapshot->'parent'->>'id') OR
                      (task->>'key' <> 'original' AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(o.result_snapshot->'children') c
                        WHERE c->>'transaction_id' = t.id::text AND task->>'key' = 'proof:' || (c->>'key'))))) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'document_transaction';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ads486_private.control WHERE singleton AND enabled) THEN
    RAISE EXCEPTION USING ERRCODE='0A000',MESSAGE='feature_disabled';
  END IF;
  IF task->>'status' = 'complete' THEN
    IF p_payload->>'sha256' IS DISTINCT FROM task->>'sha256' THEN
      RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='document_digest_mismatch';
    END IF;
    SELECT * INTO doc FROM public.transaction_documents WHERE id = (task->>'document_id')::uuid;
    IF NOT FOUND OR doc.transaction_id <> v_tx_id OR doc.company_id <> o.company_id OR
       doc.file_url <> task->>'path' OR doc.name <> task->>'name' OR doc.doc_type <> task->>'doc_type' OR
       doc.is_accounting IS DISTINCT FROM (task->>'is_accounting')::boolean THEN
      RAISE EXCEPTION USING ERRCODE = 'P0409', MESSAGE = 'request_conflict', DETAIL = 'document_link_changed';
    END IF;
    RETURN jsonb_build_object('contract_version',1,'operation_id',o.id,'state',o.state,'task',task);
  END IF;
  PERFORM public._ads486_enter(i.id,'document');
  v_status := p_payload->>'status';
  IF v_status = 'error' THEN
    IF coalesce(p_payload->>'error_code','') !~ '^[a-z][a-z0-9_]{0,79}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'document_error_code';
    END IF;
    task := task || jsonb_build_object('status','error','error_code',p_payload->>'error_code','document_id',NULL);
  ELSIF v_status = 'complete' AND p_payload->>'error_code' IS NULL THEN
    IF coalesce(p_payload->>'sha256','') !~ '^[0-9a-f]{64}$' OR
      (p_task_key='original' AND p_payload->>'sha256' IS DISTINCT FROM i.source_file_sha256) THEN
      RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='document_digest_mismatch';
    END IF;
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
    task := task || jsonb_build_object('status','complete','document_id',v_doc_id,'error_code',NULL,'sha256',p_payload->>'sha256');
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0422', MESSAGE = 'invalid_plan', DETAIL = 'document_status';
  END IF;
  tasks := jsonb_set(o.documents,ARRAY[v_index::text],task);
  v_status := CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tasks) x WHERE x->>'status' <> 'complete')
                   THEN 'complete' ELSE 'financial_committed' END;
  UPDATE public.ads_invoice_generation_operation SET documents = tasks,state = v_status,updated_at = now() WHERE id = o.id;
  PERFORM public._ads486_leave();
  RETURN jsonb_build_object('contract_version',1,'operation_id',o.id,'state',v_status,'task',task);
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_document_complete_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_document_complete_v1(uuid,text,jsonb) TO service_role;

CREATE FUNCTION public.ads_invoice_source_attest_v1(p_invoice_id uuid,p_expected_revision bigint,p_source jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
SET lock_timeout='2s' SET statement_timeout='15s'
AS $$
DECLARE i public.ads_invoice;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden'; END IF;
  PERFORM public._ads486_keys(p_source,ARRAY['company_id','bucket','path','sha256','identity'],ARRAY['company_id','bucket','path','sha256','identity']);
  PERFORM public._ads486_keys(p_source->'identity',
    ARRAY['supplier_id','supplier_nif','connection_id','account_id','platform','invoice_number','sha256'],
    ARRAY['supplier_id','supplier_nif','connection_id','account_id','platform','invoice_number','sha256']);
  IF EXISTS(SELECT 1 FROM jsonb_each(p_source->'identity') kv WHERE jsonb_typeof(kv.value)<>'string' OR nullif(btrim(kv.value#>>'{}'),'') IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='financial_source_required';
  END IF;
  PERFORM public._ads486_uuid(p_source#>'{identity,supplier_id}'),public._ads486_uuid(p_source#>'{identity,connection_id}');
  PERFORM public._ads486_fence('attest');
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id=p_invoice_id;
  IF i.company_id IS DISTINCT FROM public._ads486_uuid(p_source->'company_id') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:company:'||i.company_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:invoice:'||i.id::text,0));
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id=p_invoice_id FOR UPDATE;
  IF p_expected_revision IS DISTINCT FROM i.generation_revision THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='revision_conflict'; END IF;
  IF p_source->>'bucket' IS DISTINCT FROM 'ads-invoices' OR p_source->>'path' IS DISTINCT FROM i.file_path
    OR left(p_source->>'path',37) IS DISTINCT FROM i.company_id::text||'/'
    OR p_source->>'path' ~ '(^|/)\.\.(/|$)' OR jsonb_typeof(p_source->'sha256') IS DISTINCT FROM 'string'
    OR p_source->>'sha256' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='source_attestation_invalid';
  END IF;
  PERFORM public._ads486_enter(i.id,'attest');
  IF i.source_attestation=p_source THEN
    IF public._ads486_financial_source(i.id)->>'supplier_id' IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='financial_source_required';
    END IF;
    PERFORM public._ads486_leave();
    RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision,'identical',true);
  END IF;
  IF i.status NOT IN ('proposed','confirmed') OR i.parent_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='applied_invoice_changed';
  END IF;
  PERFORM public._ads486_no_duplicate(i.id);
  UPDATE public.ads_invoice SET source_file_sha256=p_source->>'sha256',source_attestation=p_source,
    generation_maintenance=generation_maintenance||CASE WHEN i.status='confirmed' THEN jsonb_build_array(public._ads486_task(i.id,'unlock_campaigns',i.generation_revision,NULL,coalesce((SELECT t->'resources' FROM jsonb_array_elements(i.generation_maintenance) WITH ORDINALITY q(t,ord) WHERE t->>'action'='lock_campaigns' ORDER BY ord DESC LIMIT 1),'{}'::jsonb))) ELSE '[]'::jsonb END,
    generation_revision=generation_revision+1,status='proposed',confirmed_revision=NULL,confirmed_preview_hash=NULL,
    confirmed_by=NULL,confirmed_at=NULL,updated_at=now() WHERE id=i.id;
  IF public._ads486_financial_source(i.id)->>'supplier_id' IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='financial_source_required';
  END IF;
  PERFORM public._ads486_leave();
  RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision+1,'identical',false);
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_source_attest_v1(uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_source_attest_v1(uuid,bigint,jsonb) TO service_role;

CREATE FUNCTION public.ads_invoice_revert_v1(p_invoice_id uuid,p_operation_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
SET lock_timeout='2s' SET statement_timeout='15s'
AS $$
DECLARE i public.ads_invoice; o public.ads_invoice_generation_operation; u uuid; ids uuid[]; current_rows jsonb; al jsonb; allocations jsonb:='[]'; fid uuid; resolved_plan jsonb;
BEGIN
  SELECT * INTO i FROM public.ads_invoice WHERE id=p_invoice_id;
  u:=public._ads486_access(i.company_id);
  IF NOT public.has_permission_in(u,'manage_transactions',i.company_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden';
  END IF;
  PERFORM public._ads486_fence('revert');
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:company:'||i.company_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:invoice:'||i.id::text,0));
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id=p_invoice_id FOR UPDATE;
  u:=public._ads486_access(i.company_id);
  IF NOT public.has_permission_in(u,'manage_transactions',i.company_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden';
  END IF;
  SELECT * INTO o FROM public.ads_invoice_generation_operation WHERE id=p_operation_id AND invoice_id=i.id AND company_id=i.company_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden'; END IF;
  IF o.state='reverted' THEN RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,
    'revision',i.generation_revision,'generation_cycle',i.generation_cycle,'operation',to_jsonb(o),'already',true); END IF;
  IF p_expected_revision IS DISTINCT FROM i.generation_revision OR i.generation_cycle<>o.generation_cycle
    OR i.status<>'applied' OR i.parent_transaction_id::text IS DISTINCT FROM o.result_snapshot->'parent'->>'id' THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='revision_conflict';
  END IF;
  ids:=ARRAY[(o.result_snapshot->'parent'->>'id')::uuid]||ARRAY(
    SELECT (c->>'transaction_id')::uuid FROM jsonb_array_elements(o.result_snapshot->'children') c);
  PERFORM 1 FROM public.ads_invoice_line WHERE invoice_id=i.id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.transactions WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  SELECT coalesce(jsonb_agg(to_jsonb(t)-ARRAY['created_at','updated_at','paid_amount','status','payment_date'] ORDER BY t.id),'[]')
    INTO current_rows FROM public.transactions t WHERE t.id=ANY(ids) AND t.company_id=i.company_id;
  IF current_rows IS DISTINCT FROM o.result_snapshot->'financial_rows' OR EXISTS (
    SELECT 1 FROM public.transactions WHERE parent_transaction_id=i.parent_transaction_id AND NOT(id=ANY(ids))) THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='revert_blocked',DETAIL='composition_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.id=ANY(ids)
      AND (t.status NOT IN ('approved','pending') OR coalesce(t.paid_amount,0)>0 OR t.settlement_id IS NOT NULL OR t.card_session_id IS NOT NULL))
    OR EXISTS (SELECT 1 FROM public.transaction_payments WHERE transaction_id=ANY(ids))
    OR EXISTS (SELECT 1 FROM public.payment_list_items WHERE transaction_id=ANY(ids))
    OR EXISTS (SELECT 1 FROM public.reimbursement_note_items WHERE transaction_id=ANY(ids))
    OR EXISTS (SELECT 1 FROM public.reimbursement_notes WHERE payment_transaction_id=ANY(ids))
    OR EXISTS (SELECT 1 FROM public.accountant_transaction_reviews WHERE transaction_id=ANY(ids))
    OR EXISTS (SELECT 1 FROM public.accounting_exports ex JOIN public.transactions t
      ON t.company_id=ex.company_id AND t.date BETWEEN ex.period_from AND ex.period_to WHERE t.id=ANY(ids))
    OR EXISTS (SELECT 1 FROM public.events e JOIN public.transactions t ON t.event_id=e.id WHERE t.id=ANY(ids)
      AND (e.status IN ('completed','cancelled') OR e.closed_at IS NOT NULL OR e.historical_at IS NOT NULL))
    OR EXISTS (SELECT 1 FROM public.event_settlements es JOIN public.transactions t ON t.event_id=es.event_id
      WHERE t.id=ANY(ids) AND es.is_sealed)
    OR EXISTS(SELECT 1 FROM public.transactions t JOIN public.events child ON child.id=t.event_id
      JOIN public.events master ON master.id=child.parent_event_id WHERE t.id=ANY(ids)
      AND (master.status IN ('completed','cancelled') OR master.closed_at IS NOT NULL OR master.historical_at IS NOT NULL
        OR EXISTS(SELECT 1 FROM public.event_settlements es WHERE es.event_id=master.id AND es.is_sealed))) THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='revert_blocked';
  END IF;
  PERFORM public._ads486_enter(i.id,'revert');
  UPDATE ads486_private.command_context SET transaction_ids=ids WHERE backend=pg_backend_pid() AND transaction_id=txid_current();
  UPDATE public.event_forecasts SET transaction_id=NULL WHERE transaction_id=ANY(ids);
  UPDATE public.ads_invoice_line SET transaction_id=NULL WHERE invoice_id=i.id;
  -- Retomar o ciclo seguinte usa os BPs criados/aprovados anteriormente,
  -- conservando as escolhas e sem recriar a mesma finalidade após reversão.
  FOR al IN SELECT value FROM jsonb_array_elements(i.generation_plan->'allocations') LOOP
    IF al->>'new_forecast_key' IS NOT NULL THEN
      SELECT (eff->>'forecast_id')::uuid INTO fid FROM jsonb_array_elements(o.result_snapshot->'effects') eff
        WHERE eff->>'kind'='create' AND eff->>'new_forecast_key'=al->>'new_forecast_key';
      IF fid IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='revert_blocked',DETAIL='created_forecast_missing'; END IF;
      al:=(al-'new_forecast_key')||jsonb_build_object('forecast_id',fid);
    END IF;
    allocations:=allocations||jsonb_build_array(al);
  END LOOP;
  resolved_plan:=jsonb_build_object('version',1,'allocations',allocations,'new_forecasts','[]'::jsonb,'budget_proposals','[]'::jsonb);
  -- Explicit children then parent; never delete an accountant review by cascade.
  DELETE FROM public.transactions WHERE id=ANY(ids) AND id<>i.parent_transaction_id;
  UPDATE public.ads_invoice SET generation_plan=resolved_plan,parent_transaction_id=NULL,status='proposed',applied_by=NULL,applied_at=NULL,
    confirmed_by=NULL,confirmed_at=NULL,confirmed_revision=NULL,confirmed_preview_hash=NULL,
    generation_revision=generation_revision+1,generation_cycle=generation_cycle+1,updated_at=now(),
    generation_maintenance=generation_maintenance||jsonb_build_array(public._ads486_task(i.id,'revert_cleanup',i.generation_revision,o.id,
      jsonb_build_object('documents',o.documents,'original_source',o.result_snapshot->'source',
        'campaigns',coalesce((SELECT t->'resources' FROM jsonb_array_elements(i.generation_maintenance) WITH ORDINALITY q(t,ord)
          WHERE t->>'action'='lock_campaigns' ORDER BY ord DESC LIMIT 1),'{}'::jsonb)))) WHERE id=i.id;
  DELETE FROM public.transactions WHERE id=i.parent_transaction_id;
  UPDATE public.ads_invoice_generation_operation SET state='reverted',updated_at=now() WHERE id=o.id RETURNING * INTO o;
  -- BP/baseline/ledger are preserved. Storage and campaign unlock are D3 tasks.
  PERFORM public._ads486_leave();
  RETURN jsonb_build_object('contract_version',1,'invoice_id',i.id,'revision',i.generation_revision+1,
    'generation_cycle',i.generation_cycle+1,'operation',to_jsonb(o),'already',false);
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_revert_v1(uuid,uuid,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_revert_v1(uuid,uuid,bigint) TO authenticated;

-- Leitura/redelivery e acknowledgements explícitos; nenhum callback externo
-- é pressuposto. List é MVCC sem fence. Erro exige retry explícito, até 8 tentativas.
CREATE FUNCTION public.ads_invoice_maintenance_v1(p_invoice_id uuid,p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
SET lock_timeout='2s' SET statement_timeout='15s' AS $$
DECLARE i public.ads_invoice; task jsonb; task_index integer; prior jsonb; receipt jsonb;
  request_digest text; reply jsonb; key text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden'; END IF;
  IF p_action='list' THEN
    PERFORM public._ads486_keys(p_payload,ARRAY['company_id'],ARRAY['company_id']);
  ELSIF p_action IN ('ack','retry') THEN
    PERFORM public._ads486_keys(p_payload,
      ARRAY['company_id','task_id','action','revision','operation_id','attempt','request_key','status','error_code'],
      ARRAY['company_id','task_id','action','revision','operation_id','attempt','request_key','status','error_code']);
  ELSE RAISE EXCEPTION USING ERRCODE='P0422',MESSAGE='invalid_plan',DETAIL='maintenance_action'; END IF;
  SELECT * INTO i FROM public.ads_invoice WHERE id=p_invoice_id AND company_id=public._ads486_uuid(p_payload->'company_id');
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden'; END IF;
  IF p_action='list' THEN
    -- Uma consulta, uma fotografia e somente a cabeça não concluída.
    RETURN (SELECT jsonb_build_object('contract_version',1,'invoice_id',ai.id,'task',
      (SELECT t FROM jsonb_array_elements(ai.generation_maintenance) WITH ORDINALITY q(t,ord)
       WHERE t->>'status'<>'complete' ORDER BY ord LIMIT 1)) FROM public.ads_invoice ai WHERE ai.id=i.id);
  END IF;
  PERFORM public._ads486_fence('maintenance');
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:company:'||i.company_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ads486:invoice:'||i.id::text,0));
  SELECT * INTO STRICT i FROM public.ads_invoice WHERE id=p_invoice_id FOR UPDATE;
  IF i.company_id IS DISTINCT FROM public._ads486_uuid(p_payload->'company_id') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='forbidden';
  END IF;
  key:=public._ads486_uuid(p_payload->'request_key')::text;
  request_digest:=encode(sha256(convert_to(jsonb_build_object('invoice_id',i.id,'command',p_action,'payload',p_payload)::text,'UTF8')),'hex');
  SELECT t->'receipts'->key INTO prior FROM jsonb_array_elements(i.generation_maintenance) t WHERE t->'receipts' ? key;
  IF prior IS NOT NULL THEN
    IF prior->>'request_hash' IS DISTINCT FROM request_digest THEN
      RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='request_conflict';
    END IF;
    RETURN prior->'response';
  END IF;
  SELECT t,(ord-1)::integer INTO task,task_index FROM jsonb_array_elements(i.generation_maintenance) WITH ORDINALITY q(t,ord)
    WHERE t->>'task_id'=public._ads486_uuid(p_payload->'task_id')::text;
  IF task IS NULL OR task->'revision' IS DISTINCT FROM p_payload->'revision' OR
    task->'operation_id' IS DISTINCT FROM p_payload->'operation_id' OR task->'action' IS DISTINCT FROM p_payload->'action' OR
    task->'attempt' IS DISTINCT FROM p_payload->'attempt' OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(i.generation_maintenance) WITH ORDINALITY q(t,ord)
       WHERE ord<=task_index AND t->>'status'<>'complete') THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='maintenance_conflict';
  END IF;
  IF p_action='retry' THEN
    IF task->>'status'<>'error' OR p_payload->>'status' IS DISTINCT FROM 'pending' OR
      p_payload->'error_code' IS DISTINCT FROM 'null'::jsonb OR (task->>'attempt')::int>=8 THEN
      RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='maintenance_retry_blocked';
    END IF;
    task:=task||jsonb_build_object('status','pending','attempt',(task->>'attempt')::int+1,'error_code',NULL);
  ELSE
    IF task->>'status'<>'pending' OR coalesce(p_payload->>'status','') NOT IN ('complete','error') OR
      (p_payload->>'status'='complete' AND p_payload->'error_code' IS DISTINCT FROM 'null'::jsonb) OR
      (p_payload->>'status'='error' AND (jsonb_typeof(p_payload->'error_code') IS DISTINCT FROM 'string' OR
        p_payload->>'error_code' !~ '^[a-z][a-z0-9_]{0,79}$')) THEN
      RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='maintenance_conflict';
    END IF;
    task:=task||jsonb_build_object('status',p_payload->>'status','error_code',p_payload->'error_code');
  END IF;
  reply:=jsonb_build_object('contract_version',1,'invoice_id',i.id,'task',task-'receipts');
  receipt:=jsonb_build_object('request_hash',request_digest,'response',reply);
  task:=jsonb_set(task,ARRAY['receipts',key],receipt);
  PERFORM public._ads486_enter(i.id,'maintenance');
  UPDATE public.ads_invoice SET generation_maintenance=jsonb_set(generation_maintenance,ARRAY[task_index::text],task),updated_at=now() WHERE id=i.id;
  PERFORM public._ads486_leave();
  RETURN reply;
END $$;
REVOKE ALL ON FUNCTION public.ads_invoice_maintenance_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_maintenance_v1(uuid,text,jsonb) TO service_role;

-- Separate Ads-only guards. No replacement of any financial/payment/#413/#404
-- trigger. Private context is owned by postgres, bound to backend+transaction,
-- action+invoice+exact line/transaction IDs; role/GUC spoofing is irrelevant.
CREATE FUNCTION public._ads486_invoice_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE row_id uuid; protected boolean; valid boolean;
BEGIN
  IF TG_OP<>'DELETE' AND (jsonb_typeof(NEW.generation_maintenance) IS DISTINCT FROM 'array' OR
    jsonb_array_length(NEW.generation_maintenance)>2048 OR octet_length(NEW.generation_maintenance::text)>8388608) THEN
    RAISE EXCEPTION USING ERRCODE='P0409',MESSAGE='maintenance_capacity';
  END IF;
  row_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  protected:=CASE WHEN TG_OP='INSERT' THEN
    NEW.generation_contract_version IS NOT NULL OR NEW.generation_revision<>0 OR NEW.generation_cycle<>0
      OR NEW.source_file_sha256 IS NOT NULL OR NEW.source_attestation IS NOT NULL OR NEW.generation_plan IS NOT NULL
      OR NEW.confirmed_revision IS NOT NULL OR NEW.confirmed_preview_hash IS NOT NULL OR NEW.generation_maintenance<>'[]'::jsonb
    WHEN TG_OP='DELETE' THEN OLD.generation_revision<>0 OR OLD.generation_contract_version IS NOT NULL OR OLD.source_attestation IS NOT NULL
    ELSE OLD.generation_revision<>0 OR OLD.generation_contract_version IS NOT NULL OR OLD.source_attestation IS NOT NULL OR
      ROW(NEW.generation_revision,NEW.generation_cycle,NEW.generation_contract_version,NEW.generation_plan,
        NEW.source_file_sha256,NEW.source_attestation,NEW.confirmed_revision,NEW.confirmed_preview_hash,NEW.generation_maintenance)
      IS DISTINCT FROM ROW(OLD.generation_revision,OLD.generation_cycle,OLD.generation_contract_version,OLD.generation_plan,
        OLD.source_file_sha256,OLD.source_attestation,OLD.confirmed_revision,OLD.confirmed_preview_hash,OLD.generation_maintenance) END;
  IF protected THEN
    SELECT EXISTS(SELECT 1 FROM ads486_private.command_context ctx WHERE backend=pg_backend_pid()
      AND transaction_id=txid_current() AND ctx.invoice_id=row_id
      AND ctx.action IN ('save_plan','import','confirm','generate','reopen','revert','attest','set_split','maintenance')) INTO valid;
    IF NOT valid OR TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ads_v1_command_required'; END IF;
    IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.generation_contract_version IS DISTINCT FROM OLD.generation_contract_version AND OLD.generation_contract_version=1) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ads_v1_identity_immutable';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._ads486_invoice_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ads486_invoice_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ads_invoice
  FOR EACH ROW EXECUTE FUNCTION public._ads486_invoice_guard();

CREATE FUNCTION public._ads486_line_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE parent_ids uuid[]; parent public.ads_invoice; line_id uuid;
BEGIN
  parent_ids:=CASE WHEN TG_OP='INSERT' THEN ARRAY[NEW.invoice_id] WHEN TG_OP='DELETE' THEN ARRAY[OLD.invoice_id]
    ELSE ARRAY[OLD.invoice_id,NEW.invoice_id] END;
  line_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  FOR parent IN SELECT * FROM public.ads_invoice WHERE id=ANY(parent_ids) ORDER BY id FOR UPDATE LOOP
    IF parent.generation_revision<>0 OR parent.generation_contract_version=1 OR EXISTS (
      SELECT 1 FROM ads486_private.command_context WHERE backend=pg_backend_pid() AND transaction_id=txid_current()
        AND invoice_id=parent.id) THEN
      IF NOT EXISTS(SELECT 1 FROM ads486_private.command_context ctx WHERE backend=pg_backend_pid()
        AND transaction_id=txid_current() AND ctx.invoice_id=parent.id AND line_id=ANY(ctx.line_ids)
        AND ctx.action IN ('import','save_plan','generate','revert','set_split')) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ads_v1_command_required';
      END IF;
    END IF;
  END LOOP;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id) AND EXISTS(
      SELECT 1 FROM public.ads_invoice WHERE id=ANY(parent_ids) AND generation_revision<>0) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ads_v1_identity_immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._ads486_line_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ads486_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ads_invoice_line
  FOR EACH ROW EXECUTE FUNCTION public._ads486_line_guard();

CREATE FUNCTION public._ads486_transaction_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE t public.transactions; inv uuid; valid boolean; protected boolean;
BEGIN
  t:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  -- Snapshot identity wins. Protect moving OLD out of the group as well as NEW.
  SELECT op.invoice_id INTO inv FROM public.ads_invoice_generation_operation op
    CROSS JOIN LATERAL jsonb_array_elements(op.result_snapshot->'financial_rows') r
    WHERE r->>'id'=t.id::text OR (TG_OP='UPDATE' AND r->>'id'=OLD.id::text) LIMIT 1;
  IF inv IS NULL THEN
    SELECT i.id INTO inv FROM public.ads_invoice i WHERE i.company_id=t.company_id
      AND (i.generation_contract_version=1 OR i.generation_revision<>0)
      AND ((t.category_id='c0000034-0000-0000-0000-000000000001'::uuid AND t.invoice_ref=i.invoice_number)
        OR i.parent_transaction_id=t.parent_transaction_id OR i.parent_transaction_id=t.id) ORDER BY i.id LIMIT 1;
  END IF;
  protected:=inv IS NOT NULL;
  IF protected THEN
    SELECT EXISTS(SELECT 1 FROM ads486_private.command_context ctx WHERE ctx.backend=pg_backend_pid()
      AND ctx.transaction_id=txid_current() AND ctx.invoice_id=inv AND t.id=ANY(ctx.transaction_ids)
      AND ctx.action IN ('generate','revert')) INTO valid;
    -- Canonical payments may advance status and paid fields; cannot mutate the
    -- composition/identity. Those writes block future reversal in the usual way.
    IF NOT valid AND TG_OP='UPDATE' AND OLD.status IN ('approved','paid') AND NEW.status IN ('approved','paid')
      AND NOT(OLD.status='paid' AND NEW.status<>'paid') AND
      (to_jsonb(NEW)-ARRAY['updated_at','paid_amount','status','payment_date'])=
      (to_jsonb(OLD)-ARRAY['updated_at','paid_amount','status','payment_date']) THEN RETURN NEW; END IF;
    IF NOT valid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ads_v1_command_required'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._ads486_transaction_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ads486_transaction_guard BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public._ads486_transaction_guard();

CREATE FUNCTION public._ads486_forecast_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
DECLARE inv uuid;
BEGIN
  IF OLD.transaction_id IS NOT NULL AND (TG_OP='DELETE' OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id) THEN
    SELECT op.invoice_id INTO inv FROM public.ads_invoice_generation_operation op
      CROSS JOIN LATERAL jsonb_array_elements(op.result_snapshot->'financial_rows') r
      WHERE r->>'id'=OLD.transaction_id::text LIMIT 1;
    IF inv IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ads486_private.command_context ctx WHERE
      backend=pg_backend_pid() AND transaction_id=txid_current() AND invoice_id=inv
      AND action='revert' AND OLD.transaction_id=ANY(ctx.transaction_ids)) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ads_v1_command_required';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._ads486_forecast_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ads486_forecast_guard BEFORE UPDATE OR DELETE ON public.event_forecasts
  FOR EACH ROW EXECUTE FUNCTION public._ads486_forecast_guard();


CREATE OR REPLACE FUNCTION public.ads_invoice_line_set_tour_split(_line_id uuid, _parts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE l record; inv record; v_uid uuid := auth.uid(); p jsonb; v_sum numeric := 0; v_ids uuid[] := '{}'; v_eid uuid; v_amt numeric;
BEGIN
  SELECT * INTO l FROM public.ads_invoice_line WHERE id=_line_id;
  SELECT * INTO inv FROM public.ads_invoice WHERE id=l.invoice_id;
  IF inv.generation_contract_version=1 OR inv.generation_revision<>0 THEN
    RETURN public.ads_invoice_generation_v1(inv.id,'set_split',jsonb_build_object(
      'expected_revision',inv.generation_revision,'line_id',_line_id,
      'parts',CASE WHEN _parts IS NULL THEN '[]'::jsonb ELSE
        (SELECT coalesce(jsonb_agg(x||jsonb_build_object('amount',CASE WHEN (x->>'amount')::numeric=round((x->>'amount')::numeric,2)
          THEN to_jsonb(public._ads486_decimal((x->>'amount')::numeric)) ELSE x->'amount' END)),'[]')
          FROM jsonb_array_elements(_parts) x) END));
  END IF;
  SELECT * INTO l FROM public.ads_invoice_line WHERE id = _line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linha não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_uid IS NULL OR NOT (public.is_platform_admin(v_uid) OR (l.company_id = public.current_company_id() AND (
       public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') OR public.has_role(v_uid,'editor') OR public.has_role(v_uid,'accountant')))) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO inv FROM public.ads_invoice WHERE id = l.invoice_id;
  IF inv.status = 'applied' OR inv.parent_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'A fatura já foi lançada: reabre-a antes de repartir.' USING ERRCODE = '42501';
  END IF;
  IF _parts IS NULL OR jsonb_typeof(_parts) <> 'array' OR jsonb_array_length(_parts) = 0 THEN
    UPDATE public.ads_invoice_line SET event_split = NULL, updated_at = now() WHERE id = _line_id;
    RETURN jsonb_build_object('ok', true, 'cleared', true);
  END IF;
  IF l.is_adjustment OR l.event_id IS NULL THEN
    RAISE EXCEPTION 'Só linhas de campanha com evento podem ser repartidas.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE parent_event_id = l.event_id) THEN
    RAISE EXCEPTION 'O evento da linha não é Master de turnê.' USING ERRCODE = '23514';
  END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(_parts) LOOP
    v_eid := (p->>'event_id')::uuid;
    v_amt := round((p->>'amount')::numeric, 2);
    IF v_amt IS NULL OR v_amt < 0 THEN RAISE EXCEPTION 'Valor inválido na repartição.' USING ERRCODE = '23514'; END IF;
    IF v_eid IS DISTINCT FROM l.event_id AND NOT EXISTS (SELECT 1 FROM public.events WHERE id = v_eid AND parent_event_id = l.event_id) THEN
      RAISE EXCEPTION 'Evento % não pertence à turnê.', v_eid USING ERRCODE = '23514';
    END IF;
    IF v_eid = ANY(v_ids) THEN RAISE EXCEPTION 'Evento repetido na repartição.' USING ERRCODE = '23514'; END IF;
    v_ids := v_ids || v_eid;
    v_sum := v_sum + v_amt;
  END LOOP;
  IF round(v_sum, 2) <> round(l.amount, 2) THEN
    RAISE EXCEPTION 'A soma das partes (%) não é o valor da linha (%).', round(v_sum,2), round(l.amount,2) USING ERRCODE = '23514';
  END IF;
  UPDATE public.ads_invoice_line
     SET event_split = (SELECT jsonb_agg(jsonb_build_object('event_id', x->>'event_id', 'amount', round((x->>'amount')::numeric, 2),
                                                            'source', COALESCE(x->>'source', 'manual')))
                          FROM jsonb_array_elements(_parts) x),
         matched_by = v_uid, matched_at = now(), updated_at = now()
   WHERE id = _line_id;
  RETURN jsonb_build_object('ok', true, 'parts', jsonb_array_length(_parts));
END $function$;
REVOKE ALL ON FUNCTION public.ads_invoice_line_set_tour_split(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ads_invoice_line_set_tour_split(uuid,jsonb) TO authenticated, service_role;

-- Critério v1 partilhado pelo campo calculado e contagem. SECURITY INVOKER:
-- preserva a RLS subjacente. Legado é literalmente o critério TikTok de 0106.
-- v1 considera TODAS as linhas, incluindo taxas. Preview é a autoridade de
-- validação financeira; este contador mede apenas a presença de uma escolha.
CREATE OR REPLACE FUNCTION public.ads_invoice_line_is_pending(l public.ads_invoice_line)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public
SET lock_timeout = '2s' SET statement_timeout = '15s'
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
SET lock_timeout = '2s' SET statement_timeout = '15s'
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
      'ads_invoice_revert_v1','ads_invoice_source_attest_v1','ads_invoice_maintenance_v1',
      'ads_invoice_line_set_tour_split','ads_invoice_line_is_pending','ads_invoice_pending_counts')) LOOP
    FOR a IN SELECT * FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) LOOP
      allowed_role := pg_get_userbyid(a.grantee);
      IF a.grantee = f.proowner THEN CONTINUE; END IF;
      IF a.grantee = 0 OR a.is_grantable OR NOT (
        (f.proname IN ('ads_invoice_document_complete_v1','ads_invoice_source_attest_v1','ads_invoice_maintenance_v1') AND allowed_role = 'service_role') OR
        (f.proname IN ('ads_invoice_generation_v1','ads_invoice_import_v1','ads_invoice_reopen_v1','ads_invoice_revert_v1') AND allowed_role = 'authenticated') OR
        (f.proname IN ('ads_invoice_line_set_tour_split','ads_invoice_line_is_pending','ads_invoice_pending_counts') AND allowed_role IN ('authenticated','service_role'))
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unexpected_function_acl', DETAIL = f.proname;
      END IF;
    END LOOP;
  END LOOP;
END $$;
-- Manifesto do catálogo instalado: comparação integral antes do primeiro DROP.
-- Não substitui revisão de dependências dinâmicas/consumidores D2/D3.
CREATE FUNCTION public._ads486_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'schema',(SELECT jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl) FROM pg_namespace WHERE nspname='ads486_private'),
    'functions',(SELECT jsonb_agg(jsonb_build_object('identity',p.oid::regprocedure::text,
      'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),
      'acl',coalesce(to_jsonb(p.proacl),'null'::jsonb)) ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND
      (left(p.proname,8)='_ads486_' OR p.proname IN ('ads_invoice_generation_v1','ads_invoice_import_v1',
       'ads_invoice_reopen_v1','ads_invoice_revert_v1','ads_invoice_source_attest_v1','ads_invoice_maintenance_v1','ads_invoice_document_complete_v1',
       'ads_invoice_line_set_tour_split','ads_invoice_line_is_pending','ads_invoice_pending_counts'))),
    'relations',(SELECT jsonb_agg(jsonb_build_object('identity',c.oid::regclass::text,'kind',c.relkind,
      'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity)
      ORDER BY c.oid::regclass::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE
      n.nspname='ads486_private' OR c.oid IN ('public.ads_invoice'::regclass,'public.ads_invoice_line'::regclass,
      'public.ads_invoice_generation_operation'::regclass)),
    'columns',(SELECT jsonb_agg(jsonb_build_object('relation',c.oid::regclass::text,'number',a.attnum,
      'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,
      'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.oid::regclass::text,a.attnum)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped
      AND (n.nspname='ads486_private' OR c.oid IN ('public.ads_invoice'::regclass,'public.ads_invoice_line'::regclass,
       'public.ads_invoice_generation_operation'::regclass))),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('relation',conrelid::regclass::text,'name',conname,
      'definition',pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint
      WHERE connamespace='ads486_private'::regnamespace OR conrelid IN ('public.ads_invoice'::regclass,
        'public.ads_invoice_line'::regclass,'public.ads_invoice_generation_operation'::regclass)),
    'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid::regclass::text) FROM pg_index
      WHERE indrelid IN ('public.ads_invoice'::regclass,'public.ads_invoice_generation_operation'::regclass)
      OR indrelid IN (SELECT c.oid FROM pg_class c WHERE c.relnamespace='ads486_private'::regnamespace)),
    'policies',(SELECT jsonb_agg(to_jsonb(pol) ORDER BY pol.polrelid,pol.polname) FROM pg_policy pol
      WHERE pol.polrelid IN ('public.ads_invoice'::regclass,'public.ads_invoice_line'::regclass,
        'public.ads_invoice_generation_operation'::regclass)),
    'triggers',(SELECT jsonb_agg(jsonb_build_object('relation',tgrelid::regclass::text,'name',tgname,
      'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgrelid::regclass::text,tgname)
      FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.ads_invoice'::regclass,
      'public.ads_invoice_line'::regclass,'public.ads_invoice_generation_operation'::regclass,
      'public.event_forecasts'::regclass,'public.transactions'::regclass)),
    'dependencies',(SELECT coalesce(jsonb_agg(to_jsonb(dep) ORDER BY dep.classid,dep.objid,dep.objsubid,
      dep.refclassid,dep.refobjid,dep.refobjsubid,dep.deptype),'[]') FROM pg_depend dep WHERE
      (dep.refclassid='pg_class'::regclass AND dep.refobjid IN ('public.ads_invoice'::regclass,
        'public.ads_invoice_line'::regclass,'public.ads_invoice_generation_operation'::regclass)) OR
      (dep.refclassid='pg_proc'::regclass AND dep.refobjid IN (SELECT p.oid FROM pg_proc p
       WHERE left(p.proname,8)='_ads486_' OR p.proname IN ('ads_invoice_generation_v1','ads_invoice_import_v1',
       'ads_invoice_reopen_v1','ads_invoice_revert_v1','ads_invoice_source_attest_v1','ads_invoice_maintenance_v1','ads_invoice_document_complete_v1'))))
  )
$$;
REVOKE ALL ON FUNCTION public._ads486_catalog() FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO ads486_private.installation_manifest(singleton,catalog) VALUES(true,public._ads486_catalog());
-- FINAL_FUNCTION_IDENTITIES
DO $identities$
DECLARE r record; oid_found oid; acl_entry record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('public._ads486_fence(text)','3d3e8caf371a36efbdbceea2bc64a407',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'void',false,false,0,NULL::text,ARRAY['p_action']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_enter(uuid,text)','47763beb455fc5b8122f061f265a7001',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'void',false,false,0,NULL::text,ARRAY['p_invoice','p_action']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_leave()','01cbb72ac92fedc1476de55c6f9b91c5',true,'sql','v',ARRAY['search_path=pg_catalog']::text[],false,false,'void',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_operation_tenant()','8bcb1f053fb84d5bb1671b09b2c12ab8',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_access(uuid)','b1a4448e29fc96446202e32f915ab28a',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'uuid',false,false,0,NULL::text,ARRAY['p_company']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_money(jsonb)','dfa8b1e290461e852bcae22d79cf8d34',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'numeric',false,false,0,NULL::text,ARRAY['p_value']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_decimal(numeric)','131fe9587065cdab7b8b877a96c9a728',false,'sql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'text',false,true,0,NULL::text,ARRAY['p_value']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_uuid(jsonb)','d190b67276a1b9f7281b5fd1cb1b0619',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'uuid',false,false,0,NULL::text,ARRAY['p_value']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_keys(jsonb,text[],text[])','10ba464f855e19e1907bf3dd61f25a17',false,'plpgsql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'void',false,false,1,'''{}''::text[]',ARRAY['p_object','p_allowed','p_required']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_plan(uuid,jsonb)','2765b6c118814c9b3436ae321f7633f3',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice','p_plan']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_policy(uuid)','adc0205392a1e219813afdef7ce8b536',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_company']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_financial_source(uuid)','ddec8e40e472bf09c3f0253198402678',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_no_duplicate(uuid)','a29b403affa83415d062feaf79883f8d',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'void',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_tiktok_proof(uuid)','7623a25f6042a12868124549578fdfc0',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_classify_tiktok(uuid)','a266cc909933c2b55bab9c88cf1a0fef',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'void',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_create_forecast(uuid,jsonb,text)','316632758f60dcebc21486c48ad25e2b',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'uuid',false,false,0,NULL::text,ARRAY['p_company','p_new','p_observation']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_preview(uuid)','f492bdfc4cbc8546339f900b74e8675a',true,'plpgsql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_task(uuid,text,bigint,uuid,jsonb)','e17c2ada734dbb6b80bcee16c7258625',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice','p_action','p_revision','p_operation','p_resources']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_generation_v1(uuid,text,jsonb)','c84a72206abc75838a93fe2c6658b006',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false,'jsonb',false,false,1,'''{}''::jsonb',ARRAY['p_invoice_id','p_action','p_payload']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_reopen_v1(uuid,bigint)','0dd1c819b1a0c452245952d8852398da',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice_id','p_expected_revision']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_line_identity(jsonb)','1b1f494d4d56dbf05cceaf6fe6e4adc0',false,'sql','i',ARRAY['search_path=pg_catalog']::text[],false,false,'jsonb',false,false,0,NULL::text,ARRAY['p_line']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_import_v1(jsonb,jsonb)','d4e2d1ed0233d7577777f1c74927bf5d',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice','p_lines']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_documents(uuid,uuid,jsonb)','d5263b9b46c0bc0d86d75ab34976f945',false,'plpgsql','i',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,false,'boolean',false,false,0,NULL::text,ARRAY['p_operation','p_company','p_documents']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_document_complete_v1(uuid,text,jsonb)','c3c55b670f8244d8294f619a64269b5d',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,true,'jsonb',false,false,0,NULL::text,ARRAY['p_operation_id','p_task_key','p_payload']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_source_attest_v1(uuid,bigint,jsonb)','94708f203014aad9e5557c94a86e4883',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,true,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice_id','p_expected_revision','p_source']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_revert_v1(uuid,uuid,bigint)','15819b03a8e7def422b26b21f1813f0d',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,false,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice_id','p_operation_id','p_expected_revision']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_maintenance_v1(uuid,text,jsonb)','b9fa3f488cafe914f3512d4cf13edeb2',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],false,true,'jsonb',false,false,0,NULL::text,ARRAY['p_invoice_id','p_action','p_payload']::text[],NULL::text[],NULL::text[]),
  ('public._ads486_invoice_guard()','e529bb8cdd9d80b7448b31119df0aaf3',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_line_guard()','fc72daf5ed72a27a2e8c1312337be486',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_transaction_guard()','079e56553642d4bfbafe2d827d8f656a',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public._ads486_forecast_guard()','3ffa6ddf92327cf5c3b3b66d967f5ca6',true,'plpgsql','v',ARRAY['search_path=pg_catalog, public']::text[],false,false,'trigger',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_line_set_tour_split(uuid,jsonb)','ecba641ffe14c7cb199c5ba985944e6e',true,'plpgsql','v',ARRAY['search_path=public, pg_catalog']::text[],true,true,'jsonb',false,false,0,NULL::text,ARRAY['_line_id','_parts']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_line_is_pending(public.ads_invoice_line)','be4273290e0afc349dc1711a89d3ee5a',false,'sql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,true,'boolean',false,false,0,NULL::text,ARRAY['l']::text[],NULL::text[],NULL::text[]),
  ('public.ads_invoice_pending_counts(uuid[])','0252bc2d35269880d6b3e73a8adc9fd3',false,'sql','s',ARRAY['search_path=pg_catalog, public','lock_timeout=2s','statement_timeout=15s']::text[],true,true,'record',true,false,0,NULL::text,ARRAY['p_invoice_ids','invoice_id','total_lines','pending_lines']::text[],ARRAY['uuid[]','uuid','integer','integer']::text[],ARRAY['i','t','t','t']::text[]),
  ('public._ads486_catalog()','25955bb1612c73040d4d8931ffa4aef1',true,'sql','s',ARRAY['search_path=pg_catalog, public']::text[],false,false,'jsonb',false,false,0,NULL::text,NULL::text[],NULL::text[],NULL::text[])
 ) expected(signature,body_md5,secdef,language,volatility,config,authenticated_exec,service_exec,return_type,retset,strict,default_count,default_expression,argument_names,all_argument_types,argument_modes) LOOP
  oid_found:=to_regprocedure(r.signature);
  IF oid_found IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
   WHERE p.oid=oid_found AND md5(p.prosrc)=r.body_md5 AND p.prosecdef=r.secdef AND l.lanname=r.language
    AND p.provolatile::text=r.volatility AND p.proconfig IS NOT DISTINCT FROM r.config
    AND pg_get_userbyid(p.proowner)='postgres' AND format_type(p.prorettype,NULL)=r.return_type AND p.proretset=r.retset
    AND p.proisstrict=r.strict AND p.pronargdefaults=r.default_count
    AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM r.default_expression
    AND p.proargnames IS NOT DISTINCT FROM r.argument_names
    AND (SELECT array_agg(format_type(t,NULL) ORDER BY ord) FROM unnest(p.proallargtypes) WITH ORDINALITY q(t,ord)) IS NOT DISTINCT FROM r.all_argument_types
    AND p.proargmodes::text[] IS NOT DISTINCT FROM r.argument_modes
    AND p.prokind='f' AND p.proparallel='u' AND NOT p.proleakproof) THEN
   RAISE EXCEPTION '0305_function_identity: %',r.signature;
  END IF;
  IF has_function_privilege('anon',oid_found,'EXECUTE') OR
   has_function_privilege('authenticated',oid_found,'EXECUTE') IS DISTINCT FROM r.authenticated_exec OR
   has_function_privilege('service_role',oid_found,'EXECUTE') IS DISTINCT FROM r.service_exec THEN
   RAISE EXCEPTION '0305_effective_acl: %',r.signature;
  END IF;
  FOR acl_entry IN SELECT a.* FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=oid_found AND a.grantee<>p.proowner LOOP
   IF acl_entry.grantee=0 OR acl_entry.is_grantable OR NOT (
    (pg_get_userbyid(acl_entry.grantee)='authenticated' AND r.authenticated_exec) OR
    (pg_get_userbyid(acl_entry.grantee)='service_role' AND r.service_exec)) THEN
    RAISE EXCEPTION '0305_nominal_acl: %',r.signature;
   END IF;
  END LOOP;
 END LOOP;
END $identities$;
COMMIT;
