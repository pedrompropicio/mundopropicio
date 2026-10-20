-- #333 fase12c — persistência de prévia/revisão/autorização exata com replay idempotente. INERTE.
-- NÃO aplicar sem revisão e "Sim" do Pedro. Aditivo, bloco único, lock_timeout 5s. Sem efeitos financeiros:
-- não toca ticket_office_*, transactions, transaction_payments nem tabelas reservadas #322/#323.
-- Gate próprio fechado (enabled=false); autorização fica 'authorized_inert' (executor inexistente).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $g$ BEGIN
  IF to_regclass('public.data_entry_assistant_reviews_333') IS NOT NULL OR to_regprocedure('public.data_entry_assistant_review_333(text,uuid,integer,text,jsonb,text[],uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'reviewed_absent_objects_drift'; END IF;
END $g$;

CREATE TABLE public.data_entry_assistant_review_settings_333 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), enabled boolean NOT NULL DEFAULT false, changed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.data_entry_assistant_review_settings_333 DEFAULT VALUES;

CREATE TABLE public.data_entry_assistant_reviews_333 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, company_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0), effects_hash text NOT NULL CHECK (effects_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
-- Versões imutáveis: cada edição cria nova versão; autorizações apontam para (review, version, hash).
CREATE TABLE public.data_entry_assistant_review_versions_333 (
  review_id uuid NOT NULL REFERENCES public.data_entry_assistant_reviews_333(id), version integer NOT NULL,
  effects_hash text NOT NULL, proposal jsonb NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, version));
CREATE TABLE public.data_entry_assistant_authorizations_333 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL, version integer NOT NULL, effects_hash text NOT NULL,
  action_ids text[] NOT NULL, replay_key uuid NOT NULL, owner_id uuid NOT NULL, company_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'authorized_inert' CHECK (status = 'authorized_inert'), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (review_id, version) REFERENCES public.data_entry_assistant_review_versions_333(review_id, version),
  UNIQUE (owner_id, company_id, replay_key), UNIQUE (review_id, version));

REVOKE ALL ON public.data_entry_assistant_review_settings_333, public.data_entry_assistant_reviews_333,
  public.data_entry_assistant_review_versions_333, public.data_entry_assistant_authorizations_333 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.data_entry_assistant_review_settings_333, public.data_entry_assistant_reviews_333,
  public.data_entry_assistant_review_versions_333, public.data_entry_assistant_authorizations_333 TO service_role;
ALTER TABLE public.data_entry_assistant_review_settings_333 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_entry_assistant_reviews_333 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_entry_assistant_review_versions_333 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_entry_assistant_authorizations_333 ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.data_entry_assistant_review_333(p_action text, p_review uuid, p_expected_version integer, p_hash text, p_proposal jsonb, p_action_ids text[], p_replay uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE u uuid := auth.uid(); co uuid := public.current_company_id(); r public.data_entry_assistant_reviews_333; v public.data_entry_assistant_review_versions_333;
  a public.data_entry_assistant_authorizations_333; unblocked text[];
BEGIN
  IF u IS NULL OR co IS NULL THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  IF NOT coalesce((SELECT enabled FROM public.data_entry_assistant_review_settings_333 WHERE singleton), false) THEN RAISE EXCEPTION '#333: review_closed' USING ERRCODE = '42501'; END IF;
  IF coalesce(public._effective_permissions_for(u, co, '{}'::text[])->>'role', '') NOT IN ('admin', 'manager') THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION '#333: stale_version' USING ERRCODE = '22023'; END IF;
  IF p_action = 'save' THEN
    IF p_proposal->>'effects_hash' IS DISTINCT FROM p_hash OR p_proposal->>'company_id' IS DISTINCT FROM co::text THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
    IF p_review IS NULL THEN
      INSERT INTO public.data_entry_assistant_reviews_333(owner_id, company_id, version, effects_hash) VALUES (u, co, 1, p_hash) RETURNING * INTO r;
    ELSE
      SELECT * INTO r FROM public.data_entry_assistant_reviews_333 WHERE id = p_review FOR UPDATE;
      IF NOT FOUND OR r.owner_id <> u OR r.company_id <> co THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
      IF r.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION '#333: stale_version' USING ERRCODE = '40001'; END IF;
      UPDATE public.data_entry_assistant_reviews_333 SET version = version + 1, effects_hash = p_hash, updated_at = clock_timestamp() WHERE id = r.id RETURNING * INTO r;
    END IF;
    INSERT INTO public.data_entry_assistant_review_versions_333(review_id, version, effects_hash, proposal, created_by) VALUES (r.id, r.version, p_hash, p_proposal, u);
    RETURN jsonb_build_object('review_id', r.id, 'version', r.version, 'effects_hash', r.effects_hash);
  ELSIF p_action = 'authorize' THEN
    SELECT * INTO r FROM public.data_entry_assistant_reviews_333 WHERE id = p_review FOR UPDATE;
    IF NOT FOUND OR r.owner_id <> u OR r.company_id <> co THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
    SELECT * INTO a FROM public.data_entry_assistant_authorizations_333 WHERE owner_id = u AND company_id = co AND replay_key = p_replay;
    IF FOUND THEN
      IF a.review_id = p_review AND a.version = p_expected_version AND a.effects_hash = p_hash AND a.action_ids = p_action_ids
      THEN RETURN jsonb_build_object('authorization_id', a.id, 'replayed', true, 'status', a.status); END IF;
      RAISE EXCEPTION '#333: replay_conflict' USING ERRCODE = '23505';
    END IF;
    IF r.version IS DISTINCT FROM p_expected_version OR r.effects_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION '#333: stale_version' USING ERRCODE = '40001'; END IF;
    SELECT * INTO v FROM public.data_entry_assistant_review_versions_333 WHERE review_id = r.id AND version = r.version;
    SELECT coalesce(array_agg(x->>'id' ORDER BY x->>'id'), '{}') INTO unblocked FROM jsonb_array_elements(v.proposal->'actions') x WHERE x->'blocked_reason' = 'null'::jsonb;
    IF p_action_ids IS NULL OR cardinality(p_action_ids) = 0 OR (SELECT count(DISTINCT e) FROM unnest(p_action_ids) e) <> cardinality(p_action_ids)
       OR (SELECT array_agg(e ORDER BY e) FROM unnest(p_action_ids) e) IS DISTINCT FROM unblocked OR jsonb_array_length(v.proposal->'actions') <> cardinality(unblocked)
    THEN RAISE EXCEPTION '#333: actions_blocked' USING ERRCODE = 'P0001'; END IF;
    -- Uma autorização por versão: outra chave para a mesma versão é conflito explícito, nunca segunda autorização.
    IF EXISTS (SELECT 1 FROM public.data_entry_assistant_authorizations_333 WHERE review_id = r.id AND version = r.version) THEN RAISE EXCEPTION '#333: replay_conflict' USING ERRCODE = '23505'; END IF;
    INSERT INTO public.data_entry_assistant_authorizations_333(review_id, version, effects_hash, action_ids, replay_key, owner_id, company_id)
    VALUES (r.id, r.version, p_hash, p_action_ids, p_replay, u, co) RETURNING * INTO a;
    RETURN jsonb_build_object('authorization_id', a.id, 'replayed', false, 'status', a.status);
  END IF;
  RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '22023';
END $f$;
REVOKE ALL ON FUNCTION public.data_entry_assistant_review_333(text,uuid,integer,text,jsonb,text[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.data_entry_assistant_review_333(text,uuid,integer,text,jsonb,text[],uuid) TO authenticated;
COMMIT;
