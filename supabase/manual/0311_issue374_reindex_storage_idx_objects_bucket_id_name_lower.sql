-- Issue #374 / E2b — Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização 6612284097 (Pedro, 03/11/2026; preparação codigo+testes e ficheiros;
-- válida até 14/11/2026). Aplicação na janela do 0, com Sim próprio; sem merge automático.
-- NÃO é migração drizzle: CONCURRENTLY não corre em transacção; correr cada bloco
-- sozinho no SQL Editor; não juntar instruções ao Bloco 2 nem executar o ficheiro inteiro.
-- O Bloco 2 corre fora de transacção, de DO/função e de strings com várias instruções
-- (transacção implícita). A excepção manual ao PROC-promocao é a do despacho #374.
-- Não executar reconstrução nem modificar Live nesta Issue sem autorização específica.
-- Não fabricar um índice inválido na base efémera; estes ficheiros são apenas preparação.
-- Rollback: supabase/manual/rollback_0311_issue374_reindex_storage_idx_objects_bucket_id_name_lower_comentado.sql
--
-- Origem (provas locais, só leitura): índice gerido pela Supabase (storage-api),
-- owner supabase_storage_admin; não é uma migração do projecto.
-- No diagnóstico sobre main ab6b686 (03/11/2026), git grep do nome em drizzle,
-- supabase/migrations, supabase/manual, supabase/functions e src: 0 ocorrências.
-- supabase/tests/issue335/live/phase2h-catalog-ddl.json: fase 15_indexes,
-- role supabase_storage_admin; definição btree (bucket_id, lower(name) COLLATE "C").
-- supabase/tests/issue335/live/phase2h-differential.json: Live valid=false/ready=true,
-- local valid=true. O motivo textual é «construção concorrente interrompida»;
-- a causa operacional da invalidação não foi investigada nem é provada por essa frase.
-- docs/estudos/saas-e-desenvolvimento/gates-352/review-6445145238-20261027/relatorio.md,
-- R8: só esta diferença de validade é não bloqueante no G2.
-- O nome da migração interna da Supabase não se verifica offline; não é aqui atribuído.
--
-- Diagnóstico 6612273953, fornecido no despacho (03/11/2026; sem nova leitura de Live):
-- único índice inválido na base, indisvalid=false, indisready=true, 6.024 kB;
-- storage.objects tem cerca de 29,6 mil linhas, 28 mil em database-backups (#202).
-- Inválido, não é usado pelo planeador, mas continua a ser mantido em cada escrita.
-- REINDEX INDEX CONCURRENTLY reconstrói este índice inválido (não é TOAST);
-- a variante sobre a tabela salta índices inválidos e não deve ser usada.
-- Usa lock SHARE UPDATE EXCLUSIVE: permite leituras e escritas normais concorrentes.
--
-- Permissões: supabase/tests/issue335/live/phase2h-live-capture.json regista
-- storage.objects owner=supabase_storage_admin e postgres=a*r*w*d*D*x*t*m*/supabase_storage_admin.
-- O privilégio m (MAINTAIN) existe desde PG17 e permite REINDEX INDEX na tabela.
-- Schema storage: owner=supabase_admin, postgres=U* (USAGE).
-- postgres tem super=false, bypass=true e não é membro de supabase_storage_admin.
-- MAINTAIN permite a reconstrução no PG17; não concede o ownership exigido pelo DROP.
-- Se o Bloco 1 der pode_reindex = false ⇒ parar. Parar também perante erro,
-- versao < 170000, ausência do índice/tabela ou resíduos; escalar para o 0/Supabase.
-- Só prosseguir após conferir os três resultados do Bloco 1 e a autorização de aplicação.

-- Bloco 1 — pré-verificação de permissões, estado e resíduos (só leitura).
SELECT current_setting('server_version_num')::int AS versao,
       pg_get_userbyid(c.relowner) AS owner,
       has_table_privilege('storage.objects','MAINTAIN') AS pode_reindex
FROM pg_class c
WHERE c.oid = 'storage.objects'::regclass;

SELECT indisvalid, indisready, pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_index
WHERE indexrelid = 'storage.idx_objects_bucket_id_name_lower'::regclass;

SELECT c.relname, i.indisvalid, i.indisready
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_index i ON i.indexrelid = c.oid
WHERE n.nspname = 'storage'
  AND c.relname LIKE 'idx_objects_bucket_id_name_lower_cc%';

-- Bloco 2 — reconstrução fora de transacção (seleccionar só esta instrução).
REINDEX INDEX CONCURRENTLY storage.idx_objects_bucket_id_name_lower;

-- Bloco 3 — verificação após conclusão do Bloco 2 (só leitura).
-- Esperado: uma linha, indisvalid = true e indisready = true.
SELECT indisvalid, indisready
FROM pg_index
WHERE indexrelid = 'storage.idx_objects_bucket_id_name_lower'::regclass;

-- Esperado: residuos = 0, incluindo qualquer sufixo _ccnew / _ccold.
SELECT count(*) AS residuos
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage'
  AND c.relname LIKE 'idx_objects_bucket_id_name_lower_cc%';

-- Se o Bloco 2 falhar, pode deixar idx_objects_bucket_id_name_lower_ccnew inválido.
-- Parar, inspeccionar o catálogo e seguir o rollback comentado através da Supabase.
-- Não apagar o índice original nem repetir cegamente a reconstrução.
-- Alternativa documentada, NÃO autorizada para execução por este ficheiro:
-- exige o owner supabase_storage_admin ou intervenção do suporte da Supabase;
-- postgres não é owner. Cada instrução concorrente teria de correr isoladamente.
-- DROP INDEX CONCURRENTLY storage.idx_objects_bucket_id_name_lower;
-- CREATE INDEX CONCURRENTLY idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");
