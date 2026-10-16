-- #327 — CUTOVER (INERTE, NÃO APLICADO). Só depois de: (1) PENDENTE aplicado por migração versionada; (2) patch da API
-- deployado; (3) "Sim" do Pedro para ESTE passo. Uma transação; aborta se algo não bater certo.
-- Efeito: pisos de nível para quem hoje é Crew/Goat; Crew 500→750 e Goat 1500→3000; regras novas ativas.
-- Não cria, edita, apaga nem recalcula linhas de club_points.
BEGIN;
DO $$ DECLARE n int; BEGIN
  IF (SELECT event_id FROM portal_sites WHERE id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168') IS DISTINCT FROM '407f43fc-790f-4ea7-8b2a-4162805dfb16' THEN
    RAISE EXCEPTION 'site/evento não batem'; END IF;
  SELECT count(*) INTO n FROM club_points_config WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168' AND version = '2027-v1' AND status = 'draft'
     AND event_id = '407f43fc-790f-4ea7-8b2a-4162805dfb16' AND join_points = 100 AND referral_points = 75 AND referral_cap = 750
     AND crew_points = 100 AND purchase_points = 200 AND NOT purchase_enabled AND legacy_counts
     AND levels = '{"Gang":0,"Crew":750,"Goat":3000}'::jsonb;
  IF n <> 1 THEN RAISE EXCEPTION 'config 2027-v1 em draft não encontrada com os valores aprovados'; END IF;
  IF EXISTS (SELECT 1 FROM club_points_config WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168' AND status = 'active') THEN
    RAISE EXCEPTION 'já existe config ativa'; END IF;
END $$;
-- Retrato antes (agregados, sem PII): reconsultar na hora; não confiar em contagens antigas.
SELECT count(*) AS membros, count(*) FILTER (WHERE t.pts >= 500) AS ge500, count(*) FILTER (WHERE t.pts >= 1500) AS ge1500
  FROM club_members cm CROSS JOIN LATERAL (SELECT coalesce(sum(points),0) pts FROM club_points WHERE member_id = cm.id) t
 WHERE cm.site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168';
SELECT public.club_points_cutover(
  (SELECT id FROM club_points_config WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168' AND version = '2027-v1'),
  '{"Gang":0,"Crew":500,"Goat":1500}'::jsonb);
-- Verificação: 3 níveis com os novos limiares; 1 config ativa; pisos = membros que eram ≥500.
SELECT name, min_points FROM club_levels WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168' ORDER BY min_points;
SELECT version, status, effective_at FROM club_points_config WHERE site_id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168';
SELECT levels_before, levels_after, members_total, floors_created FROM club_points_cutover_log ORDER BY done_at DESC LIMIT 1;
COMMIT;
