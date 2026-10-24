-- #355 / D-ERP307: remoção da coluna ugc_watchdog_config.recipient_phone.
-- JÁ APLICADA em Live a 24/10/2026 ~19:08 UTC por query_database (frente 2, "Sim" do Pedro),
-- porque a ferramenta de migrações do agente recusa DROP COLUMN (política backward-incompatible).
-- Este ficheiro existe só para reprodução (homologação / replay #352); nunca reaplicar em Live.
-- O contacto passa a vir de recipient_profile_id -> notification_optin (edge function ugc-ios-reading-watchdog).
ALTER TABLE public.ugc_watchdog_config DROP COLUMN IF EXISTS recipient_phone;
