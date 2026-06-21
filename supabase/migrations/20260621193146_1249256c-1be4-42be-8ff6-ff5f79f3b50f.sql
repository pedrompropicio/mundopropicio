DROP POLICY IF EXISTS service_role_bypass ON crm.assisted_assembly;
CREATE POLICY service_role_bypass ON crm.assisted_assembly FOR ALL TO service_role USING (true) WITH CHECK (true);