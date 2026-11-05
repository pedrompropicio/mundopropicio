-- Issue #666 — prova SELECT-only, a correr ANTES e DEPOIS da 0339, antes do Publish.
-- Antes: catálogo/coluna/políticas/triggers novos ausentes; eventos_com_linha = 0.
-- Depois: catálogo/coluna/políticas/triggers presentes; eventos_com_linha ainda = 0.
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'business_lines';

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'business_lines'
ORDER BY policyname;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('business_lines', 'events')
  AND (table_name = 'business_lines' OR column_name = 'business_line_id')
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND (tablename = 'business_lines' OR indexname = 'idx_events_business_line_id')
ORDER BY tablename, indexname;

SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid = 'public.events'::regclass AND conname = 'events_business_line_id_fkey';

-- PostgreSQL executa por tgname os triggers com o mesmo timing/evento.
SELECT row_number() OVER (ORDER BY tgname) AS ordem_por_nome,
       tgname, tgenabled, (tgtype & 2) <> 0 AS is_before,
       pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE tgrelid = 'public.events'::regclass AND NOT tgisinternal
ORDER BY tgname;

-- to_jsonb permite usar exactamente esta SELECT antes de existir a coluna.
SELECT count(*) AS eventos_com_linha FROM public.events e
WHERE to_jsonb(e)->>'business_line_id' IS NOT NULL;
