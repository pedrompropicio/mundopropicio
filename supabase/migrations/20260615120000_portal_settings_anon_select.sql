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
-- ============================================================

DROP POLICY IF EXISTS portal_settings_select_public ON public.portal_settings;
CREATE POLICY portal_settings_select_public ON public.portal_settings FOR SELECT TO anon USING (true);
