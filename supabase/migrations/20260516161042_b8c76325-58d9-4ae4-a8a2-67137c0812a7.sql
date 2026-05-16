
-- pg_trgm para fuzzy match
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ───────────────────────────────────────────────────────────────────
-- 1. Função de normalização (idêntica conceitualmente ao normTxt do parser)
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.norm_coala_desc(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(unaccent(COALESCE(s, ''))),
          '[[:cntrl:][:punct:]•·●○◦‣⁃▪▫■□◆◇★☆]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  )
$$;

-- ───────────────────────────────────────────────────────────────────
-- 2. Tabela de aprendizado
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE public.coala_supplier_category_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  description_normalized text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.account_categories(id) ON DELETE CASCADE,
  confirmed_count int NOT NULL DEFAULT 1,
  matched_via text NOT NULL DEFAULT 'inline_edit',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coala_scm_unique UNIQUE (company_id, supplier_id, description_normalized),
  CONSTRAINT coala_scm_matched_via_chk
    CHECK (matched_via IN ('inline_edit', 'audit_ia', 'manual', 'wizard'))
);

CREATE INDEX idx_coala_scm_company_supplier
  ON public.coala_supplier_category_map (company_id, supplier_id);
CREATE INDEX idx_coala_scm_desc_trgm
  ON public.coala_supplier_category_map
  USING gin (description_normalized public.gin_trgm_ops);

-- Trigger valida L3 (parent não-NULL e avô não-NULL)
CREATE OR REPLACE FUNCTION public.coala_scm_validate_l3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_parent uuid; v_grand uuid;
BEGIN
  SELECT parent_id INTO v_parent FROM public.account_categories WHERE id = NEW.category_id;
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'category_id % não é L3 (sem parent)', NEW.category_id;
  END IF;
  SELECT parent_id INTO v_grand FROM public.account_categories WHERE id = v_parent;
  IF v_grand IS NULL THEN
    RAISE EXCEPTION 'category_id % não é L3 (parent é L1)', NEW.category_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_coala_scm_validate_l3
  BEFORE INSERT OR UPDATE OF category_id ON public.coala_supplier_category_map
  FOR EACH ROW EXECUTE FUNCTION public.coala_scm_validate_l3();

-- ───────────────────────────────────────────────────────────────────
-- 3. RLS
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE public.coala_supplier_category_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY coala_scm_select ON public.coala_supplier_category_map
  FOR SELECT TO authenticated
  USING (
    company_id = current_company_id()
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE POLICY coala_scm_insert ON public.coala_supplier_category_map
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = current_company_id()
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE POLICY coala_scm_update ON public.coala_supplier_category_map
  FOR UPDATE TO authenticated
  USING (
    company_id = current_company_id()
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  )
  WITH CHECK (
    company_id = current_company_id()
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE POLICY coala_scm_delete ON public.coala_supplier_category_map
  FOR DELETE TO authenticated
  USING (
    (
      company_id = current_company_id()
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
      )
    )
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

-- ───────────────────────────────────────────────────────────────────
-- 4. RPC: set_coala_match_source (per-tx config used by trigger)
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_coala_match_source(source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF source NOT IN ('inline_edit','audit_ia','manual','wizard') THEN
    RAISE EXCEPTION 'invalid source %', source;
  END IF;
  PERFORM set_config('app.coala_match_source', source, true);
END $$;
GRANT EXECUTE ON FUNCTION public.set_coala_match_source(text) TO authenticated;

-- ───────────────────────────────────────────────────────────────────
-- 5. Trigger AFTER UPDATE em transactions → upsert na learning map
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.coala_capture_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallback_id uuid;
  v_desc_norm text;
  v_src text;
  v_actor uuid;
BEGIN
  -- só interessa quando categoria mudou para algo válido
  IF NEW.category_id IS NULL OR NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  -- ignorar se for a categoria fallback "A Classificar"
  SELECT id INTO v_fallback_id
    FROM public.account_categories
   WHERE company_id = NEW.company_id
     AND code IN ('0.0.99','2.6.08')
   ORDER BY (code = '0.0.99') DESC
   LIMIT 1;
  IF v_fallback_id IS NOT NULL AND NEW.category_id = v_fallback_id THEN
    RETURN NEW;
  END IF;

  v_desc_norm := public.norm_coala_desc(NEW.description);
  IF v_desc_norm IS NULL OR length(v_desc_norm) < 3 THEN RETURN NEW; END IF;

  v_src := COALESCE(NULLIF(current_setting('app.coala_match_source', true), ''), 'inline_edit');
  v_actor := auth.uid();

  INSERT INTO public.coala_supplier_category_map AS m (
    company_id, supplier_id, description_normalized, category_id,
    confirmed_count, matched_via, created_by, last_used_at
  ) VALUES (
    NEW.company_id, NEW.supplier_id, v_desc_norm, NEW.category_id,
    1, v_src, v_actor, now()
  )
  ON CONFLICT (company_id, supplier_id, description_normalized) DO UPDATE
    SET category_id   = EXCLUDED.category_id,
        confirmed_count = CASE
          WHEN m.category_id = EXCLUDED.category_id THEN m.confirmed_count + 1
          ELSE 1
        END,
        matched_via   = EXCLUDED.matched_via,
        last_used_at  = now(),
        updated_at    = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- nunca bloquear UPDATE de transações por falha do aprendizado
  RAISE WARNING 'coala_capture_category_change failed: %', SQLERRM;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_coala_capture_category_change
  AFTER INSERT OR UPDATE OF category_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.coala_capture_category_change();

-- ───────────────────────────────────────────────────────────────────
-- 6. RPC: revoke_coala_learning
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_coala_learning(rule_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.coala_supplier_category_map WHERE id = rule_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END $$;
GRANT EXECUTE ON FUNCTION public.revoke_coala_learning(uuid) TO authenticated;
