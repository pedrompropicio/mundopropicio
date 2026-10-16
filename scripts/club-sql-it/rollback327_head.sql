-- ORDEM SEGURA (rev3): 1) API compatível já deployada (usa club_member_level enquanto existir; só cai para a fórmula
--    antiga se a RPC estiver AUSENTE — PGRST202/42883, nunca em erros genéricos); 2) correr este ficheiro; 3) API antiga é opcional.
--    Não depende de pausar o cron Wallet: antes do COMMIT a RPC serve o canónico; depois do COMMIT a fórmula antiga com os
--    limiares repostos nunca fica abaixo do canónico (guarda abaixo). A ordem inversa (API antiga primeiro) rebaixa — proibida.
-- Uma transação; aborta (nada muda) se o patch não estiver aplicado ou se algum membro descesse de nível.
BEGIN;
DO $rb$ BEGIN
  IF to_regprocedure('public.club_member_level(uuid)') IS NULL OR to_regprocedure('public._club_award_core(uuid,text,text,integer,uuid)') IS NULL THEN
    RAISE EXCEPTION 'rollback #327: o patch não está aplicado (funções novas ausentes)'; END IF;
END $rb$;
-- Retrato do nível canónico ANTES de reverter (para provar que ninguém desce).
CREATE TEMP TABLE _rb327_lv ON COMMIT DROP AS
  SELECT m.id, m.site_id, x.level_name FROM public.club_members m CROSS JOIN LATERAL public.club_member_level(m.id) x;
