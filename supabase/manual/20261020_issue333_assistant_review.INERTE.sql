-- #333 fase12d — persistência de revisão/autorização (versões imutáveis, subconjunto admissível, replay). INERTE.
-- NÃO aplicar sem revisão e "Sim" do Pedro. Aditivo, bloco único, lock_timeout 5s. Sem efeitos financeiros:
-- não toca ticket_office_*, transactions, transaction_payments nem tabelas reservadas #322/#323.
-- Revisão 12d face a 12c:
--  * EXECUTE só service_role (edge data-entry). O cliente nunca envia proposta/efeitos autoritativos ao SQL;
--    o actor vem do JWT verificado no servidor e é revalidado aqui (auth.users ativo, papel admin/manager na empresa, empresa ativa).
--  * Hash recalculado no SQL (forma canónica = canon() do servidor); proposta com hash divergente é recusada.
--  * ACL: os default privileges deste projeto concedem tabelas/funções a anon/authenticated/service_role/sandbox_exec*;
--    revoga-se TUDO de todos os papéis exceto o dono, depois só SELECT a service_role nas tabelas.
--  * Versões e autorizações imutáveis por trigger (UPDATE/DELETE/TRUNCATE recusados).
--  * Autorização = subconjunto explícito de ações desbloqueadas, fechado por dependências; uma por versão.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $g$ BEGIN
  IF to_regclass('public.data_entry_assistant_reviews_333') IS NOT NULL OR to_regclass('public.data_entry_assistant_review_versions_333') IS NOT NULL
     OR to_regclass('public.data_entry_assistant_authorizations_333') IS NOT NULL OR to_regclass('public.data_entry_assistant_review_settings_333') IS NOT NULL
     OR to_regprocedure('public.data_entry_assistant_review_333(text,uuid,uuid,uuid,integer,text,jsonb,text[],uuid)') IS NOT NULL
     OR to_regprocedure('public._de333_canon(jsonb)') IS NOT NULL OR to_regprocedure('public._de333_immutable()') IS NOT NULL
  THEN RAISE EXCEPTION 'reviewed_absent_objects_drift'; END IF;
END $g$;

CREATE TABLE public.data_entry_assistant_review_settings_333 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), enabled boolean NOT NULL DEFAULT false, changed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.data_entry_assistant_review_settings_333 DEFAULT VALUES;

CREATE TABLE public.data_entry_assistant_reviews_333 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, company_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0), effects_hash text NOT NULL CHECK (effects_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.data_entry_assistant_review_versions_333 (
  review_id uuid NOT NULL REFERENCES public.data_entry_assistant_reviews_333(id), version integer NOT NULL CHECK (version > 0),
  effects_hash text NOT NULL CHECK (effects_hash ~ '^[a-f0-9]{64}$'), proposal jsonb NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, version));
CREATE TABLE public.data_entry_assistant_authorizations_333 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL, version integer NOT NULL, effects_hash text NOT NULL,
  action_ids text[] NOT NULL CHECK (cardinality(action_ids) BETWEEN 1 AND 5), replay_key uuid NOT NULL, owner_id uuid NOT NULL, company_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'authorized_inert' CHECK (status = 'authorized_inert'), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (review_id, version) REFERENCES public.data_entry_assistant_review_versions_333(review_id, version),
  UNIQUE (owner_id, company_id, replay_key), UNIQUE (review_id, version));

CREATE FUNCTION public._de333_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $t$
BEGIN RAISE EXCEPTION '#333: immutable_record' USING ERRCODE = '42501'; END $t$;
CREATE TRIGGER de333_versions_immutable BEFORE UPDATE OR DELETE ON public.data_entry_assistant_review_versions_333 FOR EACH ROW EXECUTE FUNCTION public._de333_immutable();
CREATE TRIGGER de333_versions_no_truncate BEFORE TRUNCATE ON public.data_entry_assistant_review_versions_333 FOR EACH STATEMENT EXECUTE FUNCTION public._de333_immutable();
CREATE TRIGGER de333_auth_immutable BEFORE UPDATE OR DELETE ON public.data_entry_assistant_authorizations_333 FOR EACH ROW EXECUTE FUNCTION public._de333_immutable();
CREATE TRIGGER de333_auth_no_truncate BEFORE TRUNCATE ON public.data_entry_assistant_authorizations_333 FOR EACH STATEMENT EXECUTE FUNCTION public._de333_immutable();

-- Forma canónica igual a canon() em assistant-ticketline-proposal.ts: chaves ordenadas (C), sem espaços, primitivos JSON.
CREATE FUNCTION public._de333_canon(j jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public, pg_temp AS $c$
  SELECT CASE jsonb_typeof(j)
    WHEN 'object' THEN '{' || coalesce((SELECT string_agg(to_jsonb(k)::text || ':' || public._de333_canon(v), ',' ORDER BY k COLLATE "C") FROM jsonb_each(j) AS e(k, v)), '') || '}'
    WHEN 'array' THEN '[' || coalesce((SELECT string_agg(public._de333_canon(v), ',' ORDER BY o) FROM jsonb_array_elements(j) WITH ORDINALITY AS e(v, o)), '') || ']'
    ELSE j::text END
$c$;

CREATE FUNCTION public.data_entry_assistant_review_333(p_action text, p_actor uuid, p_company uuid, p_review uuid, p_expected_version integer, p_hash text, p_proposal jsonb, p_action_ids text[], p_replay uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE r public.data_entry_assistant_reviews_333; v public.data_entry_assistant_review_versions_333;
  a public.data_entry_assistant_authorizations_333; open_ids text[]; sel text[]; x jsonb;
BEGIN
  IF p_action = 'probe' THEN
    RETURN jsonb_build_object('schema', '333-12d', 'enabled', coalesce((SELECT enabled FROM public.data_entry_assistant_review_settings_333 WHERE singleton), false));
  END IF;
  IF p_actor IS NULL OR p_company IS NULL THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  IF NOT coalesce((SELECT enabled FROM public.data_entry_assistant_review_settings_333 WHERE singleton), false) THEN RAISE EXCEPTION '#333: review_closed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= now()))
     OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company AND status = 'active')
     OR coalesce(public._effective_permissions_for(p_actor, p_company, '{}'::text[])->>'role', '') NOT IN ('admin', 'manager')
  THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION '#333: stale_version' USING ERRCODE = '22023'; END IF;
  IF p_action = 'save' THEN
    IF p_proposal IS NULL OR p_proposal->>'company_id' IS DISTINCT FROM p_company::text OR p_proposal->'effects'->>'company' IS DISTINCT FROM p_company::text
       OR p_proposal->>'effects_hash' IS DISTINCT FROM p_hash
       OR encode(sha256(convert_to(public._de333_canon(jsonb_build_object('effects', p_proposal->'effects', 'actions', p_proposal->'actions')), 'UTF8')), 'hex') <> p_hash
    THEN RAISE EXCEPTION '#333: hash_mismatch' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(p_proposal->'actions') <> 'array' OR jsonb_array_length(p_proposal->'actions') <> 5
       OR (SELECT array_agg(e->>'id' ORDER BY e->>'id') FROM jsonb_array_elements(p_proposal->'actions') e) IS DISTINCT FROM ARRAY['a1','a2','a3','a4','a5']
    THEN RAISE EXCEPTION '#333: actions_blocked' USING ERRCODE = 'P0001'; END IF;
    IF p_review IS NULL THEN
      INSERT INTO public.data_entry_assistant_reviews_333(owner_id, company_id, version, effects_hash) VALUES (p_actor, p_company, 1, p_hash) RETURNING * INTO r;
    ELSE
      SELECT * INTO r FROM public.data_entry_assistant_reviews_333 WHERE id = p_review FOR UPDATE;
      IF NOT FOUND OR r.owner_id <> p_actor OR r.company_id <> p_company THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
      IF r.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION '#333: stale_version' USING ERRCODE = '40001'; END IF;
      UPDATE public.data_entry_assistant_reviews_333 SET version = version + 1, effects_hash = p_hash, updated_at = clock_timestamp() WHERE id = r.id RETURNING * INTO r;
    END IF;
    INSERT INTO public.data_entry_assistant_review_versions_333(review_id, version, effects_hash, proposal, created_by) VALUES (r.id, r.version, p_hash, p_proposal, p_actor);
    RETURN jsonb_build_object('review_id', r.id, 'version', r.version, 'effects_hash', r.effects_hash);
  ELSIF p_action = 'authorize' THEN
    SELECT * INTO r FROM public.data_entry_assistant_reviews_333 WHERE id = p_review FOR UPDATE;
    IF NOT FOUND OR r.owner_id <> p_actor OR r.company_id <> p_company THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
    SELECT * INTO a FROM public.data_entry_assistant_authorizations_333 WHERE owner_id = p_actor AND company_id = p_company AND replay_key = p_replay;
    IF FOUND THEN
      IF a.review_id = p_review AND a.version = p_expected_version AND a.effects_hash = p_hash AND a.action_ids = p_action_ids
      THEN RETURN jsonb_build_object('authorization_id', a.id, 'replayed', true, 'status', a.status, 'action_ids', to_jsonb(a.action_ids)); END IF;
      RAISE EXCEPTION '#333: replay_conflict' USING ERRCODE = '23505';
    END IF;
    IF r.version IS DISTINCT FROM p_expected_version OR r.effects_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION '#333: stale_version' USING ERRCODE = '40001'; END IF;
    SELECT * INTO v FROM public.data_entry_assistant_review_versions_333 WHERE review_id = r.id AND version = r.version;
    IF p_action_ids IS NULL OR cardinality(p_action_ids) = 0 OR (SELECT count(DISTINCT e) FROM unnest(p_action_ids) e) <> cardinality(p_action_ids)
    THEN RAISE EXCEPTION '#333: actions_blocked' USING ERRCODE = 'P0001'; END IF;
    SELECT coalesce(array_agg(e->>'id'), '{}') INTO open_ids FROM jsonb_array_elements(v.proposal->'actions') e WHERE e->'blocked_reason' = 'null'::jsonb;
    sel := p_action_ids;
    IF NOT (sel <@ open_ids) THEN RAISE EXCEPTION '#333: actions_blocked' USING ERRCODE = 'P0001'; END IF;
    FOR x IN SELECT e FROM jsonb_array_elements(v.proposal->'actions') e WHERE e->>'id' = ANY (sel) LOOP
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(x->'depends_on') d WHERE NOT (d = ANY (sel))) THEN RAISE EXCEPTION '#333: actions_blocked' USING ERRCODE = 'P0001'; END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.data_entry_assistant_authorizations_333 WHERE review_id = r.id AND version = r.version) THEN RAISE EXCEPTION '#333: replay_conflict' USING ERRCODE = '23505'; END IF;
    INSERT INTO public.data_entry_assistant_authorizations_333(review_id, version, effects_hash, action_ids, replay_key, owner_id, company_id)
    VALUES (r.id, r.version, p_hash, p_action_ids, p_replay, p_actor, p_company) RETURNING * INTO a;
    RETURN jsonb_build_object('authorization_id', a.id, 'replayed', false, 'status', a.status, 'action_ids', to_jsonb(a.action_ids));
  END IF;
  RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '22023';
END $f$;

-- ACL: revogar de TODOS os papéis com privilégios (inclui os herdados de default ACL), depois conceder o mínimo.
DO $acl$ DECLARE o text; g text; BEGIN
  FOREACH o IN ARRAY ARRAY['public.data_entry_assistant_review_settings_333','public.data_entry_assistant_reviews_333','public.data_entry_assistant_review_versions_333','public.data_entry_assistant_authorizations_333'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', o);
    FOR g IN SELECT DISTINCT a.grantee::regrole::text FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = o::regclass AND a.grantee <> 0 AND a.grantee <> c.relowner LOOP
      EXECUTE format('REVOKE ALL ON %s FROM %s', o, g); END LOOP;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', o);
    EXECUTE format('GRANT SELECT ON %s TO service_role', o);
  END LOOP;
  FOREACH o IN ARRAY ARRAY['public.data_entry_assistant_review_333(text,uuid,uuid,uuid,integer,text,jsonb,text[],uuid)','public._de333_canon(jsonb)','public._de333_immutable()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', o);
    FOR g IN SELECT DISTINCT a.grantee::regrole::text FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = o::regprocedure AND a.grantee <> 0 AND a.grantee <> p.proowner LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', o, g); END LOOP;
  END LOOP;
  GRANT EXECUTE ON FUNCTION public.data_entry_assistant_review_333(text,uuid,uuid,uuid,integer,text,jsonb,text[],uuid) TO service_role;
END $acl$;
COMMIT;
