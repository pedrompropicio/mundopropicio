-- #202-c — prova de janela, só leitura. Preparada; não executada em Live.
-- §1: todos os globais running, incluindo os históricos sem marca.
SELECT br.id, br.run_date, br.started_at, br.folder_path, br.file_name,
       count(o.id) AS objects, max(o.created_at) - br.started_at AS ultima_escrita_apos_inicio,
       (SELECT array_agg(s.name ORDER BY s.created_at DESC, s.name)
          FROM (SELECT x.name, x.created_at FROM storage.objects x
                 WHERE x.bucket_id = 'database-backups' AND starts_with(x.name, br.folder_path || '/')
                 ORDER BY x.created_at DESC, x.name LIMIT 3) s) AS ultimos_3_nomes,
       coalesce(bool_or(o.name = br.folder_path || '/manifest.json'), false) AS manifest_presente,
       coalesce(bool_or(o.name = br.folder_path || '/storage-manifest.json'), false) AS storage_manifest_presente
  FROM public.backup_runs br LEFT JOIN storage.objects o
    ON o.bucket_id = 'database-backups' AND starts_with(o.name, br.folder_path || '/')
 WHERE br.scope = 'global' AND br.status = 'running'
 GROUP BY br.id, br.run_date, br.started_at, br.folder_path, br.file_name
 ORDER BY br.started_at;

-- §2: respostas recentes do pg_net (limite e intervalo explícitos).
SELECT id, status_code, timed_out, error_msg, created
  FROM net._http_response WHERE created > now() - interval '6 hours'
 ORDER BY created DESC LIMIT 30;

-- §3: o backup_empresa_em_falta esteve vermelho? Histórico sem amostras.
SELECT ir.id, ir.ran_at, ir.drift_count, e AS backup_empresa_em_falta
  FROM public.invariant_runs ir CROSS JOIN LATERAL jsonb_array_elements(ir.results) e
 WHERE ir.ran_at > now() - interval '30 days' AND e->>'name' = 'backup_empresa_em_falta'
 ORDER BY ir.ran_at DESC LIMIT 40;

-- §4: esperado false e 2 ANTES da aplicação da 0322.
SELECT has_column_privilege('service_role', 'public.data_entry_gmail_pending', 'created_at', 'SELECT') AS created_at_select,
       (SELECT reference_count FROM public.system_invariants WHERE name = 'backup_tabelas_excluidas') AS reference_count;

-- §5: esperado 21 UNION ALL e cache_contracts antes da 0322; conferir definição completa.
SELECT (SELECT count(*) FROM regexp_matches(d.definition, '\mUNION\s+ALL\M', 'gi')) AS union_all_count,
       d.definition LIKE '%public._run_invariant_checks_cache_contracts()%' AS cache_contracts_presente,
       d.definition
  FROM (SELECT pg_get_functiondef('public._run_invariant_checks_all()'::regprocedure) AS definition) d;

-- §6: limpeza separada, nunca executar nesta prova. COMMIT só após «Corro?».
-- BEGIN;
-- UPDATE public.backup_runs SET status='error', finished_at=now(), error_text='202-c: run global preso (isolate terminou sem fechar a linha)' WHERE scope='global' AND status='running' AND started_at < now()-interval '2 hours';
-- esperado 11–12; COMMIT só após «Corro?».
-- COMMIT;
