INSERT INTO public.role_permissions (role, permission) VALUES
  ('accountant'::app_role, 'view_reports'),
  ('accountant'::app_role, 'view_bp'),
  ('accountant'::app_role, 'view_events'),
  ('accountant'::app_role, 'view_report_suppliers'),
  ('accountant'::app_role, 'view_report_categories'),
  ('accountant'::app_role, 'view_report_cashflow'),
  ('accountant'::app_role, 'view_report_bank_statement'),
  ('accountant'::app_role, 'view_report_contas_pagar'),
  ('accountant'::app_role, 'view_report_payment_lists'),
  ('accountant'::app_role, 'view_report_accounting_export'),
  ('accountant'::app_role, 'view_report_document_pendencies'),
  ('accountant'::app_role, 'view_report_artist_cache')
ON CONFLICT (role, permission) DO NOTHING;