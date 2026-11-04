-- 0320 — #312: rubrica 2.6.15 nas empresas com 2.6 de despesa activa.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Aplicação: 0 · Cowork, na janela, com «Sim» do Pedro.
-- Origem: D-ERP255 (13/10/2026) e D-ERP347/6562678911 (Pedro, 01/11/2026), #312.
-- Autorização de preparação: 6621056041; não autoriza execução.
-- Preserva todas as rubricas existentes, incluindo 2.6.15 com outro nome.
-- Sem pai 2.6 de despesa activo, a empresa não recebe a rubrica.
-- Prova antes/depois: docs/testes/issue312/prova-janela.sql.
-- Rollback: supabase/manual/rollback_0320_issue312_rubrica_2615_outras_empresas_comentado.sql

INSERT INTO public.account_categories (company_id, code, name, type, parent_id, is_active, event_required, allocate_to_active_event)
SELECT p.company_id, '2.6.15', 'Encargos Bancários e Taxas de Transferência', 'expense', p.id, true, true, false
FROM public.account_categories p
WHERE p.code = '2.6' AND p.type = 'expense' AND p.is_active
ON CONFLICT (company_id, code) DO NOTHING;
