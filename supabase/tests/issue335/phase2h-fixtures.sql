-- #335 fase 2h — fixtures sobre o harness FIEL (gerado do catálogo de Live). LOCAL ONLY.
-- Nenhum trigger é desligado; não se usa session_replication_role.
-- Papéis de escrita escolhidos como em produção:
--   auth.users  -> supabase_auth_admin (é o papel do serviço Auth; dispara on_auth_user_created real)
--   public.*    -> service_role (como as edge functions), com RLS em bypass mas TODOS os triggers activos
\set ON_ERROR_STOP on
BEGIN;
SET ROLE service_role;
INSERT INTO public.companies(id, legal_name, display_name, slug, status) VALUES
 ('00000000-0000-0000-0000-000000000001', 'Local 335 A, Lda', 'Local A', 'local-335-a', 'active'),
 ('00000000-0000-0000-0000-000000000002', 'Local 335 B, Lda', 'Local B', 'local-335-b', 'active');
RESET ROLE;
SET ROLE supabase_auth_admin;
INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'admin@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Admin local"}', now(), now()),
 ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'viewer@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Viewer local"}', now(), now()),
 ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'editor@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Editor local"}', now(), now()),
 ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'manager@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Manager local"}', now(), now()),
 ('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'outro@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000002","full_name":"Outra empresa"}', now(), now());
RESET ROLE;
SET ROLE service_role;
-- on_auth_user_created criou profile + papel 'user'; promovem-se os papéis de teste.
INSERT INTO public.user_roles(user_id, role, company_id) VALUES
 ('00000000-0000-0000-0000-000000000010', 'admin',   '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000011', 'viewer',  '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000012', 'editor',  '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000013', 'manager', '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000019', 'admin',   '00000000-0000-0000-0000-000000000002');
-- Dados de referência de permissões: copiados do CÓDIGO versionado (não de linhas de Live):
-- supabase/migrations/20260902231429_5aa81920-cf05-4440-92fb-c6f7f44e98ac.sql
INSERT INTO public.role_permissions(role, permission) VALUES
 ('admin', 'approve_transactions'), ('manager', 'approve_transactions'),
 ('admin', 'raise_budget'), ('manager', 'raise_budget')
ON CONFLICT (role, permission) DO NOTHING;
INSERT INTO public.suppliers(id, company_id, name) VALUES
 ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Fornecedor local 335');
INSERT INTO public.financial_accounts(id, company_id, name, type) VALUES
 ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'LOCAL banco', 'bank'),
 ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'LOCAL caixa', 'cash');
INSERT INTO public.bank_statements(id, company_id, financial_account_id, file_name) VALUES
 ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000030', 'local-335.csv');
COMMIT;
-- Prova de que os triggers reais correram (falha o ficheiro se não):
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE id IN ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000019')) <> 2
  THEN RAISE EXCEPTION 'on_auth_user_created não criou profiles'; END IF;
  IF (SELECT count(*) FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000010') < 2
  THEN RAISE EXCEPTION 'papéis em falta'; END IF;
END $$;
