CREATE OR REPLACE FUNCTION public.check_supplier_iban_duplicate(
  p_iban text,
  p_supplier_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text;
  v_row record;
BEGIN
  IF NOT public.can_view_supplier_bank_data() THEN
    RAISE EXCEPTION 'Sem permissão para validar dados bancários';
  END IF;

  v_norm := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  IF v_norm = '' THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  SELECT id, name, nif, is_active
    INTO v_row
    FROM public.suppliers
   WHERE company_id = public.current_company_id()
     AND (
       upper(regexp_replace(coalesce(iban,   ''), '\s', '', 'g')) = v_norm OR
       upper(regexp_replace(coalesce(iban_2, ''), '\s', '', 'g')) = v_norm OR
       upper(regexp_replace(coalesce(iban_3, ''), '\s', '', 'g')) = v_norm
     )
     AND (p_supplier_id IS NULL OR id <> p_supplier_id)
   ORDER BY (coalesce(is_active, false)) DESC, name
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'is_active', coalesce(v_row.is_active, false),
    'supplier_id', v_row.id,
    'supplier_name', v_row.name,
    'nif', v_row.nif
  );
END;
$function$;