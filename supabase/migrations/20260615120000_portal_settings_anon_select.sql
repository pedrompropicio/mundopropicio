-- ============================================================
-- Fix RLS: portal_settings — SELECT para anon (portal público)
-- ============================================================
-- Porquê:
-- A view public.portal_settings_public é security_invoker e faz
-- SELECT de public.portal_settings sem filtro. A tabela tem RLS
-- ativa e SELECT concedido ao anon, mas as políticas existentes
-- (portal_settings_select_company, etc.) só cobrem o role
-- authenticated. Não há política de SELECT para anon, por isso o
-- site público (que lê como anon) recebia ZERO linhas.
--
-- Consequência do bug: o gtm_container_id nunca era lido e o GTM
-- nunca era injetado. O mesmo afetava rodapé, redes sociais, texto
-- "Sobre", cupão e pixel — todos dependem destas definições.
--
-- Correção: política PERMISSIVE de SELECT para anon. As definições
-- expostas pela view portal_settings_public são públicas por
-- natureza (config do portal), pelo que USING (true) é adequado;
-- o isolamento por empresa é feito no filtro de leitura da view/app.
-- Idempotente (DROP POLICY IF EXISTS antes do CREATE).
--
-- GRANT na tabela base: como a view portal_settings_public é
-- security_invoker, o anon precisa de DOIS requisitos para ler —
-- GRANT SELECT na tabela base + política RLS. O GRANT existe
-- atualmente em Live mas não estava versionado em nenhuma migração
-- nem garantido em Test; incluí-lo aqui garante paridade Test↔Live
-- e evita que o pg_dump diff do próximo Publish o remova de Live.
-- GRANT é idempotente.
-- ============================================================

GRANT SELECT ON public.portal_settings TO anon;

DROP POLICY IF EXISTS portal_settings_select_public ON public.portal_settings;
CREATE POLICY portal_settings_select_public ON public.portal_settings FOR SELECT TO anon USING (true);
