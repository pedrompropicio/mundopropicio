-- D-ERP199: aviso de fornecedor parecido ao criar (NIF igual ou nome parecido)
CREATE OR REPLACE FUNCTION public.normalize_supplier_name(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(coalesce(p_name, ''))), '[^a-z0-9]+', ' ', 'g'),
      '\m(lda|ltda|unipessoal|sa|s a|sociedade|eireli|ou|llc|inc)\M', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.check_supplier_similar(p_name text, p_nif text, p_supplier_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, name text, nif text, iban text, iban_2 text, iban_3 text, is_active boolean, motivo text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_nif text := upper(regexp_replace(coalesce(p_nif, ''), '[^A-Za-z0-9]', '', 'g'));
  v_name text := public.normalize_supplier_name(p_name);
  v_bank boolean := public.can_view_supplier_bank_data();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH c AS (
    SELECT s.id, s.name, s.nif, s.iban, s.iban_2, s.iban_3, coalesce(s.is_active, false) AS is_active,
      CASE
        WHEN v_nif <> '' AND upper(regexp_replace(coalesce(s.nif, ''), '[^A-Za-z0-9]', '', 'g')) = v_nif THEN 'nif'
        WHEN v_name <> '' AND (
              (least(length(v_name), length(public.normalize_supplier_name(s.name))) >= 4
               AND (position(v_name IN public.normalize_supplier_name(s.name)) > 0
                    OR position(public.normalize_supplier_name(s.name) IN v_name) > 0))
              OR public.similarity(v_name, public.normalize_supplier_name(s.name)) >= 0.6
            ) THEN 'nome'
      END AS motivo
    FROM public.suppliers s
    WHERE s.company_id = v_company
      AND (p_supplier_id IS NULL OR s.id <> p_supplier_id)
  )
  SELECT c.id, c.name, c.nif,
         CASE WHEN v_bank THEN c.iban END,
         CASE WHEN v_bank THEN c.iban_2 END,
         CASE WHEN v_bank THEN c.iban_3 END,
         c.is_active, c.motivo
  FROM c
  WHERE c.motivo IS NOT NULL
  ORDER BY (c.motivo = 'nif') DESC, c.is_active DESC, c.name
  LIMIT 5;
END;
$$;

REVOKE ALL ON FUNCTION public.check_supplier_similar(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_supplier_similar(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_supplier_name(text) TO authenticated, service_role;