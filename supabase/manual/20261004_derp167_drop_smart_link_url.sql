-- D-ERP167 — DROP COLUMN artist_songs.smart_link_url
-- JÁ APLICADO EM LIVE a 04/10/2026 pelo chat 2, com autorização expressa do Pedro
-- (0 valores em 29 linhas; lock_timeout 5s). Ficheiro documental/idempotente —
-- NÃO reexecutar é inócuo (IF EXISTS). A guarda da Lovable Cloud recusou o
-- registo em supabase/migrations, por isso fica aqui.

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.artist_songs DROP COLUMN IF EXISTS smart_link_url;
COMMIT;
