-- ============================================================================
-- #158 — Remoção das políticas RLS legacy PERMISSIVE `auth.uid() IS NOT NULL`
-- Frente fecho-e-socios · épico #146 · auditoria AUD-estanqueidade-socios-2026-09-13
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_staff_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role IN (
          'admin','platform_admin','manager','editor','viewer','accountant',
          'producer','field_producer','content_manager','marketing_manager'
        )
        AND (ur.role = 'platform_admin'::app_role OR ur.company_id = public.current_company_id())
    )
  );
$$;

REVOKE ALL ON FUNCTION public.has_staff_role(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_staff_role(uuid) TO authenticated, service_role;

DO $legacy$
DECLARE r record; v_new text; v_count int := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, p.polname, p.polcmd
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polpermissive
      AND (
        pg_get_expr(p.polqual, p.polrelid) ILIKE '%auth.uid() IS NOT NULL%'
        OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%auth.uid() IS NOT NULL%'
      )
    ORDER BY c.relname, p.polname
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.polname, r.tbl);

    IF r.polcmd = 'r' THEN
      v_new := r.tbl || '_select_privileged_roles';
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (public.has_staff_role(auth.uid()))',
        v_new, r.tbl);
    ELSIF r.polcmd = 'a' THEN
      v_new := r.tbl || '_insert_privileged_roles';
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.has_staff_role(auth.uid()))',
        v_new, r.tbl);
    ELSE
      RAISE EXCEPTION 'Política legacy com comando inesperado: %.% (%)', r.tbl, r.polname, r.polcmd;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  IF v_count <> 51 THEN
    RAISE EXCEPTION 'Esperava 51 políticas legacy, encontrei %', v_count;
  END IF;
  RAISE NOTICE 'Políticas legacy substituídas: %', v_count;
END
$legacy$;

CREATE POLICY account_categories_select_partner ON public.account_categories
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'partner'::app_role));

CREATE POLICY role_permissions_select_own_roles ON public.role_permissions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = role_permissions.role
  ));

DO $prova$
DECLARE
  v_staff jsonb := '{"account_categories":191,"blog_posts":23,"bp_orphan_attachments":0,"camarim_integrations":3,"camarim_item_documents":35,"camarim_item_reviews":0,"camarim_items":35,"camarim_session_events":2,"camarim_sessions":3,"cities":47,"event_bp_review_acks":0,"event_cache_city_settlements":2,"event_cache_configs":5,"event_cache_deductions":4,"event_cache_extras":0,"event_cache_payments":0,"event_cache_tiers":3,"event_closing_costs":0,"event_courtesies":0,"event_dates":24,"event_forecast_formalidade_log":502,"event_forecast_partners":0,"event_partner_extras":0,"event_partners":8,"event_sessions":74,"event_ticket_type_zones":251,"event_ticket_types":264,"event_ticket_zones":294,"events":52,"forecast_audit_log":384,"partner_advance_expenses":1,"payment_list_documents":12,"payment_list_items":459,"payment_list_sepa_exports":15,"payment_lists":65,"press_clippings":14,"quotations":0,"recurring_transactions":2,"role_permissions":148,"supplier_credit_usages":0,"supplier_credits":0,"supplier_documents":0,"ticket_import_logs":14,"ticket_office_settlements":3,"transaction_audit_log":1707,"transaction_payments":165,"venue_reservations":56,"venues":92}'::jsonb;
  v_zero text[] := ARRAY[
    'blog_posts','bp_orphan_attachments','camarim_integrations','camarim_item_documents',
    'camarim_item_reviews','camarim_items','camarim_session_events','camarim_sessions','cities',
    'event_bp_review_acks','event_cache_city_settlements','event_cache_configs',
    'event_cache_deductions','event_cache_extras','event_cache_payments','event_cache_tiers',
    'event_closing_costs','event_courtesies','event_dates','event_forecast_formalidade_log',
    'event_forecast_partners','event_partner_extras','event_partners','event_ticket_types',
    'event_ticket_type_zones','event_ticket_office_assignments','forecast_audit_log',
    'partner_advance_expenses','payment_list_documents','payment_list_items',
    'payment_list_sepa_exports','payment_lists','press_clippings','quotations',
    'recurring_transactions','supplier_credit_usages','supplier_credits','supplier_documents',
    'ticket_import_logs','ticket_office_settlements','transaction_audit_log',
    'transaction_payments','undo_actions','venue_reservations','venues'
  ];
  k text; v_exp int; v_got int; t text;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims',
    '{"sub":"d8e502f7-9ceb-4dae-bd73-7291832d0d6f","role":"authenticated","email":"pedroneto@mundopropicio.com"}', true);

  FOR k, v_exp IN SELECT key, value::int FROM jsonb_each_text(v_staff) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', k) INTO v_got;
    IF v_got < v_exp THEN
      RAISE EXCEPTION 'REGRESSÃO staff em %: antes % linhas, agora %', k, v_exp, v_got;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"699c117d-a376-4760-8869-852faa87cb6b","role":"authenticated","email":"lobo@vybbe.com.br"}', true);

  FOREACH t IN ARRAY v_zero LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_got;
    IF v_got <> 0 THEN
      RAISE EXCEPTION 'FUGA ao sócio em %: % linhas visíveis', t, v_got;
    END IF;
  END LOOP;

  EXECUTE 'SELECT count(*) FROM public.events' INTO v_got;
  IF v_got >= 52 THEN
    RAISE EXCEPTION 'FUGA ao sócio em events: % linhas visíveis', v_got;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'Prova #158 OK';
END
$prova$;