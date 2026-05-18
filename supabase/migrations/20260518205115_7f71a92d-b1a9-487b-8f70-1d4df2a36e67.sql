
-- ============ 1) Novas permissões granulares (defaults) ============
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','view_bp'), ('admin','view_sponsorship'), ('admin','view_ab'), ('admin','view_simulator'),
  ('manager','view_bp'), ('manager','view_sponsorship'), ('manager','view_ab'), ('manager','view_simulator'),
  ('editor','view_bp'), ('editor','view_sponsorship'), ('editor','view_ab'), ('editor','view_simulator')
ON CONFLICT (role, permission) DO NOTHING;
-- viewer e partner ficam SEM as novas perms por default; só ganham via user_permissions override.

-- ============ 2) RLS SELECT gated por has_permission ============
-- event_forecasts (BP) — substitui policy legacy auth.uid() IS NOT NULL
DROP POLICY IF EXISTS "Event forecasts viewable by authenticated" ON public.event_forecasts;
DROP POLICY IF EXISTS event_forecasts_select_view_bp ON public.event_forecasts;
CREATE POLICY event_forecasts_select_view_bp ON public.event_forecasts
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_bp'))
  );

-- sponsorship_pipeline
DROP POLICY IF EXISTS sponsorship_pipeline_select ON public.sponsorship_pipeline;
CREATE POLICY sponsorship_pipeline_select ON public.sponsorship_pipeline
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND (
      public.has_permission(auth.uid(), 'view_sponsorship')
      OR owner_user_id = auth.uid()
    ))
  );

-- sponsorship_pipeline_activities
DROP POLICY IF EXISTS sponsorship_activities_select ON public.sponsorship_pipeline_activities;
CREATE POLICY sponsorship_activities_select ON public.sponsorship_pipeline_activities
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_sponsorship'))
  );

-- event_ab_config / event_ab_zones
DROP POLICY IF EXISTS ab_config_select_same_company ON public.event_ab_config;
CREATE POLICY ab_config_select_view_ab ON public.event_ab_config
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_ab'))
  );

DROP POLICY IF EXISTS ab_zones_select_same_company ON public.event_ab_zones;
CREATE POLICY ab_zones_select_view_ab ON public.event_ab_zones
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_ab'))
  );

-- event_simulator_*
DROP POLICY IF EXISTS simulator_config_select_same_company ON public.event_simulator_config;
CREATE POLICY simulator_config_select_view_sim ON public.event_simulator_config
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_simulator'))
  );

DROP POLICY IF EXISTS simulator_inputs_select_same_company ON public.event_simulator_inputs;
CREATE POLICY simulator_inputs_select_view_sim ON public.event_simulator_inputs
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_simulator'))
  );

DROP POLICY IF EXISTS simulator_zone_select_same_company ON public.event_simulator_zone_config;
CREATE POLICY simulator_zone_select_view_sim ON public.event_simulator_zone_config
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_simulator'))
  );

DROP POLICY IF EXISTS sim_cost_lines_select_same_company ON public.event_simulator_cost_lines;
CREATE POLICY sim_cost_lines_select_view_sim ON public.event_simulator_cost_lines
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_simulator'))
  );

-- ============ 3) Limpeza de policies legacy (FRENTE D) ============
-- event_ticket_lots
DROP POLICY IF EXISTS "Ticket lots viewable by authenticated" ON public.event_ticket_lots;
CREATE POLICY event_ticket_lots_select_tenant ON public.event_ticket_lots
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_events'))
  );

-- event_ticket_office_advances
DROP POLICY IF EXISTS "Advances viewable by authenticated" ON public.event_ticket_office_advances;
CREATE POLICY event_ticket_office_advances_select_tenant ON public.event_ticket_office_advances
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (company_id = public.current_company_id() AND public.has_permission(auth.uid(), 'view_events'))
  );
