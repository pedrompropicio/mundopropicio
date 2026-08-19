-- 1) Bank columns of suppliers are no longer readable by the generic API roles.
REVOKE SELECT ON TABLE public.suppliers FROM authenticated;
REVOKE SELECT ON TABLE public.suppliers FROM anon;
REVOKE ALL ON TABLE public.suppliers FROM anon;

GRANT SELECT (
  id, name, nif, contact_name, email, phone, address, payment_terms,
  category, notes, is_active, created_at, updated_at, trade_name,
  is_partner, company_id
) ON public.suppliers TO authenticated;

GRANT ALL ON TABLE public.suppliers TO service_role;

-- 2) Explicit role gate for bank data.
CREATE OR REPLACE FUNCTION public.can_view_supplier_bank_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'platform_admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'editor'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role);
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_supplier_bank_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_supplier_bank_data() TO authenticated;

-- 3) Single read path for bank data: role check + tenant isolation.
CREATE OR REPLACE FUNCTION public.get_supplier_bank_details(p_supplier_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  nif text,
  iban text,
  swift_bic text,
  iban_2 text,
  swift_bic_2 text,
  iban_3 text,
  swift_bic_3 text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.nif, s.iban, s.swift_bic, s.iban_2, s.swift_bic_2, s.iban_3, s.swift_bic_3
    FROM public.suppliers s
   WHERE public.can_view_supplier_bank_data()
     AND s.company_id = public.current_company_id()
     AND (p_supplier_ids IS NULL OR s.id = ANY (p_supplier_ids));
$$;

REVOKE EXECUTE ON FUNCTION public.get_supplier_bank_details(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_supplier_bank_details(uuid[]) TO authenticated;

-- 4) Duplicate-IBAN check must keep working now that the columns are revoked.
CREATE OR REPLACE FUNCTION public.check_supplier_iban_duplicate(p_iban text, p_supplier_id uuid DEFAULT NULL::uuid)
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
$function$;

REVOKE EXECUTE ON FUNCTION public.check_supplier_iban_duplicate(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_supplier_iban_duplicate(text, uuid) TO authenticated;