-- D-ERP201: fila de fornecedores parecidos criados em lote + regra única (adenda D-ERP199)

CREATE OR REPLACE FUNCTION public.normalize_supplier_nif(p_nif text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT CASE WHEN x ~ '^[A-Z]{2}[0-9]+$' THEN substr(x, 3) ELSE x END
    FROM (SELECT upper(regexp_replace(coalesce(p_nif, ''), '[^A-Za-z0-9]', '', 'g')) AS x) s;
$$;
GRANT EXECUTE ON FUNCTION public.normalize_supplier_nif(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._supplier_similar_candidates(p_company_id uuid, p_name text, p_nif text, p_exclude uuid DEFAULT NULL)
RETURNS TABLE(id uuid, name text, nif text, iban text, iban_2 text, iban_3 text, is_active boolean, motivo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
  WITH p AS (SELECT public.normalize_supplier_nif(p_nif) AS nif, public.normalize_supplier_name(p_name) AS nm),
  c AS (
    SELECT s.id, s.name, s.nif, s.iban, s.iban_2, s.iban_3, coalesce(s.is_active, false) AS is_active,
           public.normalize_supplier_name(s.name) AS snm, p.nif AS pnif, p.nm AS pnm
      FROM public.suppliers s, p
     WHERE s.company_id = p_company_id AND (p_exclude IS NULL OR s.id <> p_exclude)
  ), m AS (
    SELECT c.*, CASE
      WHEN c.pnif <> '' AND public.normalize_supplier_nif(c.nif) = c.pnif THEN 'nif'
      WHEN c.pnm <> '' AND c.snm <> '' AND (
           (least(length(c.pnm), length(c.snm)) >= 4 AND (position(c.pnm IN c.snm) > 0 OR position(c.snm IN c.pnm) > 0))
           OR public.similarity(c.pnm, c.snm) >= 0.6) THEN 'nome' END AS motivo
      FROM c
  )
  SELECT m.id, m.name, m.nif, m.iban, m.iban_2, m.iban_3, m.is_active, m.motivo
    FROM m WHERE m.motivo IS NOT NULL
   ORDER BY (m.motivo = 'nif') DESC, m.is_active DESC, m.name
   LIMIT 5;
$$;
REVOKE ALL ON FUNCTION public._supplier_similar_candidates(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._supplier_similar_candidates(uuid, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.check_supplier_similar(p_name text, p_nif text, p_supplier_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, name text, nif text, iban text, iban_2 text, iban_3 text, is_active boolean, motivo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_bank boolean := public.can_view_supplier_bank_data();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.nif,
         CASE WHEN v_bank THEN c.iban END, CASE WHEN v_bank THEN c.iban_2 END, CASE WHEN v_bank THEN c.iban_3 END,
         c.is_active, c.motivo
    FROM public._supplier_similar_candidates(v_company, p_name, p_nif, p_supplier_id) c;
END;
$$;

CREATE TABLE public.supplier_similarity_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  similar_supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN ('nif','nome')),
  source text NOT NULL CHECK (source IN ('sponsors_import','apply_coala_bp')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text CHECK (resolution IN ('diferentes','resolvido')),
  UNIQUE (supplier_id, similar_supplier_id)
);
CREATE INDEX idx_supplier_similarity_flags_open ON public.supplier_similarity_flags (company_id) WHERE resolved_at IS NULL;

GRANT SELECT, UPDATE ON public.supplier_similarity_flags TO authenticated;
GRANT ALL ON public.supplier_similarity_flags TO service_role;
ALTER TABLE public.supplier_similarity_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_similarity_flags_select ON public.supplier_similarity_flags
  FOR SELECT TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'platform_admin'))
         AND public.row_belongs_to_current_company(company_id));
CREATE POLICY supplier_similarity_flags_update ON public.supplier_similarity_flags
  FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'platform_admin'))
         AND public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

-- Criação em lote: NIF igual a UM ativo → reutiliza; restantes candidatos → cria e marca.
CREATE OR REPLACE FUNCTION public._supplier_resolve_or_create(p_company_id uuid, p_name text, p_nif text, p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_nif_active uuid[]; v_flagged int := 0; r record;
BEGIN
  SELECT array_agg(c.id) INTO v_nif_active
    FROM public._supplier_similar_candidates(p_company_id, p_name, p_nif, NULL) c
   WHERE c.motivo = 'nif' AND c.is_active;
  IF coalesce(array_length(v_nif_active, 1), 0) = 1 THEN
    RETURN jsonb_build_object('id', v_nif_active[1], 'created', false, 'reused', true, 'flagged', 0);
  END IF;

  INSERT INTO public.suppliers (name, nif, company_id, is_active)
  VALUES (btrim(p_name), nullif(btrim(coalesce(p_nif, '')), ''), p_company_id, true)
  RETURNING id INTO v_id;

  FOR r IN SELECT c.id, c.motivo FROM public._supplier_similar_candidates(p_company_id, p_name, p_nif, v_id) c LOOP
    INSERT INTO public.supplier_similarity_flags (company_id, supplier_id, similar_supplier_id, motivo, source)
    VALUES (p_company_id, v_id, r.id, r.motivo, p_source) ON CONFLICT DO NOTHING;
    v_flagged := v_flagged + 1;
  END LOOP;
  RETURN jsonb_build_object('id', v_id, 'created', true, 'reused', false, 'flagged', v_flagged);
END;
$$;
REVOKE ALL ON FUNCTION public._supplier_resolve_or_create(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._supplier_resolve_or_create(uuid, text, text, text) TO service_role;

-- Invólucro para o frontend (importação de patrocinadores): empresa activa + papel de quem cria fornecedores.
CREATE OR REPLACE FUNCTION public.supplier_resolve_or_create(p_name text, p_nif text, p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid := public.current_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN RAISE EXCEPTION 'Empresa activa não definida' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')) THEN
    RAISE EXCEPTION 'Sem permissão para criar fornecedores' USING ERRCODE = '42501';
  END IF;
  IF p_source NOT IN ('sponsors_import') THEN RAISE EXCEPTION 'Origem inválida'; END IF;
  RETURN public._supplier_resolve_or_create(v_company, p_name, p_nif, p_source);
END;
$$;
REVOKE ALL ON FUNCTION public.supplier_resolve_or_create(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_resolve_or_create(text, text, text) TO authenticated, service_role;

-- Invariante
INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('supplier_similar_por_rever',
 'Pares de fornecedores parecidos criados em lote (patrocinadores / Coala) ainda por rever',
 'warn', 'empresa', 0,
 'D-ERP201 (09/10/2026). Referência = contagem no dia da criação (tabela nova: 0). Rever em /admin/fornecedores-parecidos.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_suppliers()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  SELECT count(*), COALESCE(jsonb_agg(to_jsonb(x)) FILTER (WHERE x.rn <= 6), '[]'::jsonb)
    INTO c, s
    FROM (SELECT f.id, f.company_id, f.supplier_id, f.similar_supplier_id, f.motivo, f.source,
                 row_number() OVER (ORDER BY f.created_at DESC) rn
            FROM public.supplier_similarity_flags f WHERE f.resolved_at IS NULL) x;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, (c <= i.reference_count), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'supplier_similar_por_rever';
END;
$function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_suppliers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_suppliers() TO service_role;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
  UNION ALL SELECT * FROM public._run_invariant_checks_cards()
  UNION ALL SELECT * FROM public._run_invariant_checks_tenant()
  UNION ALL SELECT * FROM public._run_invariant_checks_duplicate_invoices()
  UNION ALL SELECT * FROM public._run_invariant_checks_camarim()
  UNION ALL SELECT * FROM public._run_invariant_checks_suppliers()
$function$;