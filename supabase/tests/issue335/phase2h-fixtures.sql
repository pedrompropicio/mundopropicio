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
-- IDs iguais aos dos testes antigos; empresa via metadata (o trigger real cria profile + papel 'user').
INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) VALUES
 ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u10@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Admin local"}', now(), now()),
 ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u11@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Viewer local"}', now(), now()),
 ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u12@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Manager (papel dado na 2b)"}', now(), now()),
 ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u16@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Manager (2e)"}', now(), now()),
 ('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u17@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000001","full_name":"Editor (2e)"}', now(), now()),
 ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u13@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000002","full_name":"Outra empresa"}', now(), now()),
 ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u14@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000002","full_name":"Outra empresa"}', now(), now()),
 ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u15@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000002","full_name":"Outra empresa"}', now(), now()),
 ('00000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u19@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000002","full_name":"Admin B"}', now(), now()),
 ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'u99@local.invalid', '{"company_id":"00000000-0000-0000-0000-000000000002","full_name":"Sem acesso a A"}', now(), now());
RESET ROLE;
SET ROLE service_role;
-- on_auth_user_created criou profile + papel 'user'; promovem-se os papéis de teste.
INSERT INTO public.user_roles(user_id, role, company_id) VALUES
 ('00000000-0000-0000-0000-000000000010', 'admin',   '00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000011', 'viewer',  '00000000-0000-0000-0000-000000000001'),
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
-- Plano de contas local L1>L2>L3 (fixture, não dado de referência).
INSERT INTO public.account_categories(id, company_id, code, name, type, parent_id) VALUES
 ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000001', '335', 'LOCAL L1', 'income', NULL),
 ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000001', '335.1', 'LOCAL L2', 'income', '00000000-0000-0000-0000-000000000050'),
 ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000001', '335.1.01', 'LOCAL L3', 'income', '00000000-0000-0000-0000-000000000051');
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
