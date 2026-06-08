
CREATE OR REPLACE FUNCTION public.check_supplier_iban_duplicate(
  p_iban text,
  p_supplier_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_norm text;
  v_row record;
BEGIN
  v_norm := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  IF v_norm = '' THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  SELECT id, name, nif
    INTO v_row
    FROM public.suppliers
   WHERE company_id = public.current_company_id()
     AND (
       upper(regexp_replace(coalesce(iban,   ''), '\s', '', 'g')) = v_norm OR
       upper(regexp_replace(coalesce(iban_2, ''), '\s', '', 'g')) = v_norm OR
       upper(regexp_replace(coalesce(iban_3, ''), '\s', '', 'g')) = v_norm
     )
     AND (p_supplier_id IS NULL OR id <> p_supplier_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'supplier_id', v_row.id,
    'supplier_name', v_row.name,
    'nif', v_row.nif
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_supplier_iban_duplicate(text, uuid) TO authenticated;
