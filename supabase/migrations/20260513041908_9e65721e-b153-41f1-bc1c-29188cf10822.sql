GRANT USAGE ON SCHEMA crm TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crm.funnel_test_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crm.funnel_test_steps TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crm.funnel_test_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crm.funnel_test_steps TO service_role;