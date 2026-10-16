-- #327 — PROVA DO LEGADO (só leitura, sem PII). Repetir imediatamente antes do cutover; o resultado entra no registo.
-- Prova que: (1) o site aponta para a edição da config; (2) todos os créditos sem edição (event_id NULL) são do site,
-- foram criados dentro da janela de vida desta edição no portal e são anteriores ao patch; (3) contagens por regra.
-- O cutover só retrata créditos NULL do site; o retrato fica imutável em club_legacy_consumption (o ledger não muda).
WITH s AS (SELECT ps.id, ps.event_id, ps.created_at AS site_created FROM portal_sites ps WHERE ps.id = 'f8ce23a5-a27a-4893-9b7a-d6337d84b168'),
ev AS (SELECT e.id, e.name IS NOT NULL AS has_name FROM events e, s WHERE e.id = s.event_id),
p AS (SELECT cp.rule_key, cp.points, cp.created_at FROM club_points cp JOIN club_members cm ON cm.id = cp.member_id, s WHERE cm.site_id = s.id)
SELECT
  (SELECT event_id FROM s) = '407f43fc-790f-4ea7-8b2a-4162805dfb16'::uuid                      AS site_aponta_2027,
  (SELECT count(*) FROM ev)                                                                       AS evento_existe,
  (SELECT min(site_created) FROM s)                                                               AS site_criado_em,
  (SELECT min(created_at) FROM p)                                                                 AS primeiro_credito,
  (SELECT max(created_at) FROM p)                                                                 AS ultimo_credito,
  (SELECT count(*) FROM p WHERE created_at < (SELECT site_created FROM s))                        AS creditos_antes_do_site,
  (SELECT jsonb_object_agg(rule_key, n) FROM (SELECT rule_key, count(*)||'/'||sum(points) n FROM p GROUP BY rule_key) x) AS por_regra,
  (SELECT count(*) FROM club_points cp WHERE NOT EXISTS (SELECT 1 FROM club_members cm WHERE cm.id = cp.member_id)) AS creditos_orfaos,
  (SELECT count(*) FROM club_members cm, s WHERE cm.site_id = s.id AND cm.confirmed_at IS NOT NULL AND cm.referred_by_member_id IS NOT NULL) AS indicados_confirmados,
  (SELECT count(*) FROM portal_sites WHERE event_id = (SELECT event_id FROM s))                   AS sites_no_mesmo_evento;
