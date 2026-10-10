-- #100 (D-ERP220): leitura e edição do default_budget_mode pela empresa activa.
-- companies UPDATE é só platform_admin (RLS); admin/manager da empresa editam só este campo.
CREATE OR REPLACE FUNCTION public.get_company_default_budget_mode()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT default_budget_mode FROM public.companies WHERE id = public.current_company_id()), 'with_bp')
$$;
REVOKE EXECUTE ON FUNCTION public.get_company_default_budget_mode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_default_budget_mode() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_company_default_budget_mode(_mode text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid := public.current_company_id(); v_n int;
BEGIN
  IF _mode NOT IN ('with_bp','without_bp') THEN
    RAISE EXCEPTION 'Modo orçamental inválido: %', _mode USING ERRCODE = '22023';
  END IF;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Sem empresa activa.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_platform_admin(auth.uid())
          OR public.has_role_in(auth.uid(), 'admin', v_company)
          OR public.has_role_in(auth.uid(), 'manager', v_company)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar o modo orçamental da empresa.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.companies SET default_budget_mode = _mode WHERE id = v_company;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = 'P0002'; END IF;
  RETURN _mode;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_company_default_budget_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_default_budget_mode(text) TO authenticated, service_role;