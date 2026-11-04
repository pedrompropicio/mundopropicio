-- #419 / 0318 — prova da janela; PREPARADA, NÃO EXECUTADA em homolog/Live.
-- Aplicar só pelo PROC-promocao com Sim, depois da 0298.
-- Executar §0 e §1 ANTES, §2 e §3 DEPOIS da aplicação autorizada da 0318.
-- Todo o SQL activo é SELECT; §4 é um roteiro comentado exclusivo de homolog.
-- Universo: inventário integral de linhas, sem corte temporal, para comparar a mesma
-- população antes/depois; não é diagnóstico de pagamentos históricos (D-ERP289).
-- Referência fornecida de 01/11: G1 sem ponte 0; G2 total 5/sem ponte 0;
-- G3 sem ligação 0; compensation: 42 D-ERP86, 9 backfill, 6 offset_id,
-- 4 offset_group_id, 4 base D-ERP157, 3 manuais. Não é uma nova medição.

-- §0 — colunas de B e contexto das RPCs; presente=false é lacuna explícita.
-- offset_group_id não está na captura de 31/10: é opcional para a 0318,
-- que usa to_jsonb; confirmar a sua presença antes de provar o caminho #335.
SELECT required.tabela, required.coluna, a.attname IS NOT NULL AS presente,
       format_type(a.atttypid, a.atttypmod) AS tipo
FROM (VALUES ('transaction_payments', 'payment_method'),
  ('transaction_payments', 'offset_id'), ('transaction_payments', 'offset_group_id'),
  ('transaction_payments', 'transaction_id'), ('transaction_payments', 'created_by'))
  required(tabela, coluna)
LEFT JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || required.tabela)
  AND a.attname = required.coluna AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY required.tabela, required.coluna;

SELECT p.oid::regprocedure::text AS funcao, pg_get_userbyid(p.proowner) AS dono,
       p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('save_ticket_office_settlement', 'launch_from_bank_lines')
ORDER BY funcao;

-- §1 — antes: guardar este resultado; comparar exactamente com §3.
WITH compensation AS (
  SELECT CASE
    WHEN p.offset_id IS NOT NULL THEN 'compensation_offset_id'
    WHEN (to_jsonb(p)->>'offset_group_id') IS NOT NULL THEN 'compensation_offset_group_id'
    WHEN p.created_by = 'backfill D-ERP86' THEN 'compensation_backfill_D_ERP86'
    WHEN p.created_by = 'backfill' THEN 'compensation_backfill'
    WHEN p.created_by = 'base D-ERP157' THEN 'compensation_base_D_ERP157'
    ELSE 'compensation_manual_sem_ligacao'
  END AS origem
  FROM public.transaction_payments p
  WHERE p.payment_method = 'compensation'
)
SELECT 'G1_sem_ponte' AS medida, count(*) AS quantidade
FROM public.transactions t
JOIN public.account_categories c ON c.id = t.category_id
JOIN public.financial_accounts a ON a.id = t.account_id
WHERE t.type = 'income' AND c.code = '10.1.01' AND a.mirror_partner_aporte
  AND NOT EXISTS (SELECT 1 FROM public.partner_aporte_mirror m WHERE m.aporte_transaction_id = t.id)
UNION ALL
SELECT 'G2_total', count(*) FROM public.transactions t
JOIN public.account_categories c ON c.id = t.category_id
WHERE t.type = 'income' AND c.code = '10.12.01'
UNION ALL
SELECT 'G2_sem_ponte', count(*) FROM public.transactions t
JOIN public.account_categories c ON c.id = t.category_id
WHERE t.type = 'income' AND c.code = '10.12.01'
  AND NOT EXISTS (SELECT 1 FROM public.shared_cost_mirror m WHERE m.mirror_transaction_id = t.id)
UNION ALL
SELECT 'G3_sem_ligacao', count(*) FROM public.transactions t
WHERE t.type = 'income' AND t.transitory_reason = 'carga_cartao'
  AND NOT EXISTS (SELECT 1 FROM public.card_session_loads l WHERE l.in_transaction_id = t.id)
UNION ALL
SELECT origens.origem, count(c.origem)
FROM (VALUES ('compensation_backfill_D_ERP86'), ('compensation_backfill'),
  ('compensation_offset_id'), ('compensation_offset_group_id'),
  ('compensation_base_D_ERP157'), ('compensation_manual_sem_ligacao')) origens(origem)
LEFT JOIN compensation c ON c.origem = origens.origem
GROUP BY origens.origem
ORDER BY medida;

-- §2 — depois: triggers, segurança, definições e ACL; não aplicar nada aqui.
SELECT t.tgname, t.tgrelid::regclass::text AS tabela, t.tgenabled,
       pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
WHERE NOT t.tgisinternal AND t.tgrelid IN (
  'public.transactions'::regclass, 'public.transaction_payments'::regclass)
  AND t.tgname IN ('zz_guard_automatism_rows', 'zz_guard_manual_compensation_leg',
    'trg_sync_partner_aporte_mirror', 'trg_sync_shared_cost_mirror',
    'trg_card_load_on_out_paid', 'zz_materialize_paid_amount_payment',
    'trg_apply_transaction_offsets')
ORDER BY t.tgname;

-- Esperado: G1–G3 prosecdef=true; G4 prosecdef=false; search_path=public;
-- anon/authenticated sem EXECUTE nas duas funções; trigger não precisa desse grant.
SELECT p.oid::regprocedure::text AS funcao, pg_get_userbyid(p.proowner) AS dono,
       p.prosecdef, p.proconfig, md5(pg_get_functiondef(p.oid)) AS md5,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('guard_automatism_rows', 'guard_manual_compensation_leg')
ORDER BY funcao;

-- §3 — depois: repetição literal de §1; todos os resultados devem ser iguais.
WITH compensation AS (
  SELECT CASE
    WHEN p.offset_id IS NOT NULL THEN 'compensation_offset_id'
    WHEN (to_jsonb(p)->>'offset_group_id') IS NOT NULL THEN 'compensation_offset_group_id'
    WHEN p.created_by = 'backfill D-ERP86' THEN 'compensation_backfill_D_ERP86'
    WHEN p.created_by = 'backfill' THEN 'compensation_backfill'
    WHEN p.created_by = 'base D-ERP157' THEN 'compensation_base_D_ERP157'
    ELSE 'compensation_manual_sem_ligacao'
  END AS origem
  FROM public.transaction_payments p
  WHERE p.payment_method = 'compensation'
)
SELECT 'G1_sem_ponte' AS medida, count(*) AS quantidade
FROM public.transactions t
JOIN public.account_categories c ON c.id = t.category_id
JOIN public.financial_accounts a ON a.id = t.account_id
WHERE t.type = 'income' AND c.code = '10.1.01' AND a.mirror_partner_aporte
  AND NOT EXISTS (SELECT 1 FROM public.partner_aporte_mirror m WHERE m.aporte_transaction_id = t.id)
UNION ALL
SELECT 'G2_total', count(*) FROM public.transactions t
JOIN public.account_categories c ON c.id = t.category_id
WHERE t.type = 'income' AND c.code = '10.12.01'
UNION ALL
SELECT 'G2_sem_ponte', count(*) FROM public.transactions t
JOIN public.account_categories c ON c.id = t.category_id
WHERE t.type = 'income' AND c.code = '10.12.01'
  AND NOT EXISTS (SELECT 1 FROM public.shared_cost_mirror m WHERE m.mirror_transaction_id = t.id)
UNION ALL
SELECT 'G3_sem_ligacao', count(*) FROM public.transactions t
WHERE t.type = 'income' AND t.transitory_reason = 'carga_cartao'
  AND NOT EXISTS (SELECT 1 FROM public.card_session_loads l WHERE l.in_transaction_id = t.id)
UNION ALL
SELECT origens.origem, count(c.origem)
FROM (VALUES ('compensation_backfill_D_ERP86'), ('compensation_backfill'),
  ('compensation_offset_id'), ('compensation_offset_group_id'),
  ('compensation_base_D_ERP157'), ('compensation_manual_sem_ligacao')) origens(origem)
LEFT JOIN compensation c ON c.origem = origens.origem
GROUP BY origens.origem
ORDER BY medida;

-- §4 — SÓ HOMOLOG, roteiro INACTIVO: não descomentar/executar nesta preparação.
-- Escolher transaction_id e company_id válidos e autorizados da mesma empresa,
-- substituir os dois UUIDs abaixo e obter contexto de sessão/RLS de homolog.
-- Confirmar current_user=authenticated; qualquer erro diferente de G4 invalida a prova.
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT current_user;
-- INSERT INTO public.transaction_payments
--   (transaction_id, company_id, amount, payment_date, payment_method, status, created_by)
-- VALUES ('00000000-0000-0000-0000-000000000419',
--         '00000000-0000-0000-0000-000000000419', 0.01, CURRENT_DATE,
--         'compensation', 'paid', 'prova homolog #419');
-- Esperado: P0001 — A compensação faz-se pelo assistente de encontro de contas (#337).
-- ROLLBACK;
