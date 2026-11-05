-- #314 / 0323 — PROVA PREPARADA, NÃO EXECUTADA. Autorização de preparação: 6629854062.
-- Só SELECT. Correr antes e depois da aplicação numa janela autorizada pelo PROC-promocao.
-- Guardar os dois resultados: os hashes devem mudar; proacl e prosecdef devem manter-se.
-- Não identifica contas/fechos reais nem corrige dados. Com violação prévia, a 0323 deve abortar.

-- §1 — Pré-condição (esperado: 0, antes e depois).
SELECT count(*) AS pernas_pagas_sem_conta
FROM public.transactions
WHERE status = 'paid' AND account_id IS NULL
  AND (operation_key LIKE 'TRF-FECHO-%' OR operation_key LIKE 'DEVOL-SALA-%');

-- Distribuição das pernas dos pares, por família, estado e presença de conta.
SELECT CASE WHEN operation_key LIKE 'TRF-FECHO-%' THEN 'TRF-FECHO-' ELSE 'DEVOL-SALA-' END AS familia,
       status, account_id IS NULL AS conta_nula,
       count(*) AS pernas, count(DISTINCT operation_key) AS pares
FROM public.transactions
WHERE operation_key LIKE 'TRF-FECHO-%' OR operation_key LIKE 'DEVOL-SALA-%'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- §2 — Executar a mesma leitura ANTES e DEPOIS; comparar ACL e SECURITY DEFINER.
SELECT p.oid::regprocedure::text AS assinatura,
       md5(pg_get_functiondef(p.oid)) AS md5_definicao,
       p.proacl, p.prosecdef
FROM pg_proc p
WHERE p.oid IN (
  'public.create_settlement_transfer(uuid,uuid,uuid,numeric,date,boolean)'::regprocedure,
  'public.save_ticket_office_settlement(uuid,jsonb,boolean,jsonb,jsonb,text,text,text)'::regprocedure
)
ORDER BY 1;

-- §3 — Antes: 0 linhas. Depois: 1 linha, tgdeferrable e tginitdeferred = true,
-- tgenabled = O, função e definição iguais ao candidato da 0323.
SELECT t.tgname, t.tgdeferrable, t.tginitdeferred, t.tgenabled,
       t.tgfoid::regprocedure::text AS funcao, pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
WHERE t.tgrelid = 'public.transactions'::regclass
  AND NOT t.tgisinternal
  AND t.tgname = 'trg_settlement_pair_paid_requires_account';

-- ACL da função nova: depois, anon e authenticated = false; SECURITY DEFINER = true.
SELECT p.oid::regprocedure::text AS assinatura, p.prosecdef, p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
WHERE p.oid = to_regprocedure('public.enforce_settlement_pair_paid_requires_account()');
