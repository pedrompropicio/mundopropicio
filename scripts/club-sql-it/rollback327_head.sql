-- ORDEM: 1) reverter a API (edge newgang-portal para a versão sem club_member_level/club_rules_public/referrals);
--        2) só depois correr este ficheiro. Com a API nova ainda ativa, as RPCs removidas aqui dariam erro explícito.
-- Uma transação; aborta (nada muda) se o patch não estiver aplicado ou se algum membro descesse de nível.
BEGIN;
DO $rb$ BEGIN
  IF to_regprocedure('public.club_member_level(uuid)') IS NULL OR to_regprocedure('public._club_award_core(uuid,text,text,integer,uuid)') IS NULL THEN
    RAISE EXCEPTION 'rollback #327: o patch não está aplicado (funções novas ausentes)'; END IF;
END $rb$;
-- Retrato do nível canónico ANTES de reverter (para provar que ninguém desce).
CREATE TEMP TABLE _rb327_lv ON COMMIT DROP AS
  SELECT m.id, m.site_id, x.level_name FROM public.club_members m CROSS JOIN LATERAL public.club_member_level(m.id) x;
