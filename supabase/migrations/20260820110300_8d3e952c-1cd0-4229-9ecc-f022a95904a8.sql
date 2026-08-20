-- 1) camarim_fund_moves: restrict SELECT to privileged roles
DROP POLICY IF EXISTS "Camarim fund moves viewable by authenticated" ON public.camarim_fund_moves;
CREATE POLICY "Camarim fund moves viewable by privileged roles"
ON public.camarim_fund_moves FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'accountant'::app_role)
  OR public.has_permission(auth.uid(), 'camarim_manage'::text)
);

-- 2) partner_paid_expenses: restrict SELECT to financial/management roles
DROP POLICY IF EXISTS "Authenticated users can view partner paid expenses" ON public.partner_paid_expenses;
CREATE POLICY "Partner paid expenses viewable by privileged roles"
ON public.partner_paid_expenses FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'accountant'::app_role)
  OR public.has_role(auth.uid(), 'editor'::app_role)
  OR public.has_role(auth.uid(), 'viewer'::app_role)
);

-- 3) suppliers: remove bank columns from direct table reads (RPC get_supplier_bank_details remains)
REVOKE SELECT ON public.suppliers FROM authenticated;
GRANT SELECT (
  id, name, nif, contact_name, email, phone, address, payment_terms,
  category, notes, is_active, created_at, updated_at, trade_name,
  is_partner, company_id
) ON public.suppliers TO authenticated;

-- 4) portal_settings: scope anonymous reads to companies flagged as public portal
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS public_portal boolean NOT NULL DEFAULT false;
UPDATE public.companies SET public_portal = true WHERE slug = 'mundo-propicio';

CREATE OR REPLACE FUNCTION public.is_public_portal_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = _company_id AND c.public_portal = true
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_public_portal_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_portal_company(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "portal_settings_select_public" ON public.portal_settings;
CREATE POLICY "portal_settings_select_public"
ON public.portal_settings FOR SELECT TO anon
USING (public.is_public_portal_company(company_id));