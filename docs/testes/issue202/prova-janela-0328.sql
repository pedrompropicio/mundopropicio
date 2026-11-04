-- #202 / 0328 — executar os mesmos SELECT antes e depois, pelo 0 na janela autorizada.
-- Esperado: exclusões totais e referência 7 antes, 11 depois; funções ausentes antes.
-- Não chama purgas; elegíveis é o total por idade, não o limite de 50000 de uma chamada.
SELECT count(*) AS exclusoes_totais,
       (SELECT reference_count FROM public.system_invariants
         WHERE name = 'backup_tabelas_excluidas') AS reference_count
  FROM public.backup_excluded_tables;

SELECT schema_name, table_name, reason
  FROM public.backup_excluded_tables
 ORDER BY schema_name, table_name;

SELECT 'song_link_diag' AS tabela, count(*) AS linhas_totais,
       count(*) FILTER (WHERE created_at < now() - interval '14 days') AS linhas_elegiveis,
       min(created_at) AS linha_mais_antiga
  FROM public.song_link_diag;

SELECT 'song_link_delivery_slots' AS tabela, count(*) AS linhas_totais,
       count(*) FILTER (WHERE delivered_at IS NOT NULL
                          AND delivered_at < now() - interval '30 days') AS linhas_elegiveis,
       min(reserved_at) AS linha_mais_antiga,
       min(delivered_at) AS entrega_mais_antiga,
       count(*) FILTER (WHERE delivered_at IS NULL) AS linhas_nao_entregues
  FROM public.song_link_delivery_slots;

SELECT 'ip_geo_cache' AS tabela, count(*) AS linhas_totais,
       count(*) FILTER (WHERE resolved_at < now() - interval '72 hours') AS linhas_elegiveis,
       min(resolved_at) AS linha_mais_antiga
  FROM public.ip_geo_cache;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig, p.proacl,
       md5(pg_get_functiondef(p.oid)) AS definition_md5,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
       EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_execute
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('purge_song_link_diag', 'purge_song_link_delivery_slots', 'purge_ip_geo_cache')
 ORDER BY p.proname;
