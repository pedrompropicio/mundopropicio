-- #333 fase12f — cenário sintético LOCAL (PG descartável). Nada disto existe no Cloud.
-- U1 manager em C1 (Pedro sintético), U2 manager em C2, U3 viewer em C1.
INSERT INTO auth.users(id, email) VALUES ('11111111-1111-1111-1111-111111111111','u1@local.test'),('33333333-3333-3333-3333-333333333333','u2@local.test'),('77777777-7777-7777-7777-777777777777','u3@local.test');
INSERT INTO public.companies(id, legal_name, display_name, slug) VALUES ('22222222-2222-2222-2222-222222222222','C1','C1','c1'),('44444444-4444-4444-4444-444444444444','C2','C2','c2');
INSERT INTO public.profiles(id, company_id, active_company_id) VALUES ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','44444444-4444-4444-4444-444444444444'),('77777777-7777-7777-7777-777777777777','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222');
INSERT INTO public.user_roles(user_id, role, company_id) VALUES ('11111111-1111-1111-1111-111111111111','manager','22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333','manager','44444444-4444-4444-4444-444444444444'),('77777777-7777-7777-7777-777777777777','viewer','22222222-2222-2222-2222-222222222222');
-- role_permissions iguais às lidas no projeto para manage_accounts/approve_transactions.
INSERT INTO public.role_permissions(role, permission) VALUES ('admin','approve_transactions'),('admin','manage_accounts'),('manager','approve_transactions'),('manager','manage_accounts');
INSERT INTO public.account_categories(id, code, name, type, company_id) VALUES ('b32df086-c995-4747-a3f9-bfefa0063d0a','10.3.01','Transferências internas','expense','22222222-2222-2222-2222-222222222222'),
  ('c0000000-0000-4000-8000-000000000001','2.1.01','Despesa operacional','expense','22222222-2222-2222-2222-222222222222');
INSERT INTO public.financial_accounts(id, name, type, company_id) VALUES ('0f000000-0000-4000-8000-000000000001','Bilheteira T','ticket_office','22222222-2222-2222-2222-222222222222'),
  ('0b000000-0000-4000-8000-000000000001','Banco B','bank','22222222-2222-2222-2222-222222222222'),('0b000000-0000-4000-8000-000000000002','Banco B2','bank','22222222-2222-2222-2222-222222222222'),
  ('0c000000-0000-4000-8000-000000000001','Banco C2','bank','44444444-4444-4444-4444-444444444444');
