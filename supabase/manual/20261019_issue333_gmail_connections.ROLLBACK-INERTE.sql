-- #333 fase11b/11c — ROLLBACK INERTE. Só com "Sim" do Pedro.
-- NÃO apaga ligações existentes: aborta se houver qualquer ligação guardada.
-- Para reverter com ligações ativas: cada utilizador desliga primeiro pelo modal
-- ("Desligar Gmail", que revoga no gateway e apaga a própria linha); só depois este rollback corre.
-- Apagar a tabela remove apenas chaves cifradas locais — nunca apaga emails nem revoga na Google.
BEGIN;
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('public.data_entry_gmail_connections') IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.data_entry_gmail_connections;
    IF n > 0 THEN
      RAISE EXCEPTION 'Rollback recusado: existem % ligações Gmail guardadas. Desligar cada utilizador pelo modal primeiro.', n;
    END IF;
  END IF;
END $$;
DROP TABLE IF EXISTS public.data_entry_gmail_pending;
DROP TABLE IF EXISTS public.data_entry_gmail_connections;
COMMIT;
