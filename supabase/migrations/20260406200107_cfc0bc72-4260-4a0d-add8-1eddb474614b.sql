
DELETE FROM role_permissions WHERE role = 'editor' AND permission = 'manage_events';
INSERT INTO role_permissions (role, permission) VALUES 
  ('editor', 'view_events'),
  ('editor', 'view_reports'),
  ('editor', 'view_report_payment_lists'),
  ('admin', 'view_events'),
  ('manager', 'view_events')
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Events insertable by privileged roles" ON events;
CREATE POLICY "Events insertable by privileged roles" ON events
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Events updatable by privileged roles" ON events;
CREATE POLICY "Events updatable by privileged roles" ON events
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Event forecasts insertable by privileged roles" ON event_forecasts;
CREATE POLICY "Event forecasts insertable by privileged roles" ON event_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Event forecasts updatable by privileged roles" ON event_forecasts;
CREATE POLICY "Event forecasts updatable by privileged roles" ON event_forecasts
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Closing costs insertable by privileged roles" ON event_closing_costs;
CREATE POLICY "Closing costs insertable by privileged roles" ON event_closing_costs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Closing costs updatable by privileged roles" ON event_closing_costs;
CREATE POLICY "Closing costs updatable by privileged roles" ON event_closing_costs
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
