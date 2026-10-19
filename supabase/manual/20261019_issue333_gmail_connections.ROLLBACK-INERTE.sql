-- #333 fase11b — ROLLBACK INERTE. Só com "Sim" do Pedro.
-- Antes: desligar cada utilizador pelo modal ("Desligar Gmail") para revogar no gateway;
-- apagar a tabela apenas remove chaves cifradas locais (não apaga emails nem revoga na Google).
BEGIN;
DROP TABLE IF EXISTS public.data_entry_gmail_pending;
DROP TABLE IF EXISTS public.data_entry_gmail_connections;
COMMIT;
