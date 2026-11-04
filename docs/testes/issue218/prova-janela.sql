-- #218 / 0314 — prova para a janela do 0. PREPARADA, NÃO EXECUTADA.
-- Só SELECT; o modelo de backfill da §5 permanece comentado.
-- Referências Live fornecidas pelo Pedro em 04/11/2026, não medições desta execução.

-- §1 — antes: coluna = 0; depois da migração: coluna = 1.
SELECT count(*) AS coluna_is_final_close
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bp_versions' AND column_name = 'is_final_close';

-- Referência em 04/11: 177 versões; confirmar na janela.
SELECT count(*) AS total_bp_versions FROM public.bp_versions;

-- §2 — original: uma só linha, 8 argumentos; não criar sobrecargas.
SELECT p.oid::regprocedure AS assinatura, p.pronargs, p.prosecdef,
       pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_bp_snapshot';

-- Nova depois da migração: uma linha, 3 argumentos, prosecdef = t;
-- authenticated = t, anon = f, service_role = t.
SELECT p.oid::regprocedure AS assinatura, p.pronargs, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_final_close_bp_snapshot';

-- §3a — todas as candidatas; a descrição só serve para revisão humana, nunca backfill automático.
SELECT b.id, b.event_id, e.name AS evento, e.status, e.parent_event_id,
       b.version_number, b.state, b.cascaded_from_version_id, b.description
FROM public.bp_versions b JOIN public.events e ON e.id = b.event_id
WHERE b.description ILIKE 'Versão final do fecho%'
ORDER BY b.event_id, b.version_number DESC, b.id;

-- §3b — IDs propostos ao 0: uma por evento, a maior version_number entre as candidatas.
SELECT DISTINCT ON (b.event_id)
       b.id, b.event_id, e.name AS evento, e.status, e.parent_event_id,
       b.version_number, b.state, b.cascaded_from_version_id, b.description
FROM public.bp_versions b JOIN public.events e ON e.id = b.event_id
WHERE b.description ILIKE 'Versão final do fecho%'
ORDER BY b.event_id, b.version_number DESC, b.id;

-- §3c — controlo amplo: 3 em 04/11, inclui «estado anterior ao Fechamento Final», que NÃO é final.
SELECT count(*) AS descricoes_com_final
FROM public.bp_versions WHERE description ILIKE '%final%';

-- §4 — executar só DEPOIS da migração e ANTES do backfill: finais = 0.
SELECT count(*) FILTER (WHERE is_final_close) AS finais FROM public.bp_versions;

-- §5 — MODELO INERTE: o 0 confirma os IDs da §3b e obtém confirmação antes de o usar.
-- UPDATE public.bp_versions SET is_final_close = true WHERE id IN ('__ID__');
