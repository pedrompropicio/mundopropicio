-- 0316 — Issue #311 E2b: defaults da exportação de públicos do MP Audience.
-- Autorização 6618986172 — Pedro, 04/11/2026: ninguém perde acesso.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Ordem na janela: prova §1–§3 antes; migração primeiro, depois Publish do código.
-- Repetir a prova §3–§4 após a migração; esperado em §3: 0 linhas.
-- Rollback: supabase/manual/rollback_0316_issue311_audience_export_marketing_comentado.sql

INSERT INTO public.role_permissions (role, permission) VALUES
  ('marketing_manager'::public.app_role, 'crm.audience.export'),
  -- ninguém perde (snapshot 567bbef0)
  ('content_manager'::public.app_role, 'crm.audience.export')
ON CONFLICT (role, permission) DO NOTHING;
