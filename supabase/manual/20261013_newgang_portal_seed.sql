-- DML de sementeira — APLICADO em Live a 2026-10-13 com OK do Pedro (incl. passo 6).
-- Empresa MP 7c858982-6ccd-47ca-bd65-e0dd3eebf01c · evento 407f43fc-790f-4ea7-8b2a-4162805dfb16.

BEGIN;

-- 1) Site
INSERT INTO public.portal_sites (company_id, domain, event_id, brand_key, content, active)
VALUES ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', 'newgangfestival.pt', '407f43fc-790f-4ea7-8b2a-4162805dfb16', 'newgang', '{}'::jsonb, true)
ON CONFLICT (domain) DO NOTHING;

-- 2) História (2023 só com cidade e local; data e line-up a NULL; todas visíveis)
INSERT INTO public.festival_editions (company_id, brand_key, year, city, venue, edition_date, lineup, sort, visible) VALUES
('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang',2023,'Lisboa','Campo Pequeno',NULL,NULL,1,true),
('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang',2023,'Porto','Super Bock Arena',NULL,NULL,2,true),
('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang',2024,'Lisboa','Altice Arena','2024-03-08',
  ARRAY['MC Cabelinho','MC Poze','Oruam','Chefin','Wet Bed Gang','Veigh','TZ da Coronel'],1,true),
('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang',2025,'Lisboa','Campo Pequeno','2025-04-17',
  ARRAY['Veigh','TZ da Coronel','MC IG','Orochi','Mizzy Miles','MC Paiva','G.A.'],1,true),
('7c858982-6ccd-47ca-bd65-e0dd3eebf01c','newgang',2026,'Lisboa','MEO Arena','2026-04-04',
  ARRAY['Orochi','MC Meno K','MC Paiva','Teto','Chefin','TZ da Coronel','Major RD','MC Murilo'],1,true);

-- 3) Regras de pontos
INSERT INTO public.club_point_rules (company_id, site_id, rule_key, label, points)
SELECT s.company_id, s.id, v.k, v.l, v.p FROM public.portal_sites s,
 (VALUES ('join_confirmed','Confirmar inscrição',100),('friend_joined','Amigo confirmou',150),
         ('friend_bought','Amigo comprou bilhete',300),('promo_lot_purchase','Compra em lote promocional',500),
         ('guess_correct','Palpite certo',50),('attended_year','Estive lá (por ano)',100)) v(k,l,p)
WHERE s.domain = 'newgangfestival.pt' ON CONFLICT (site_id, rule_key) DO NOTHING;

-- 4) Níveis (benefícios a definir pelo Pedro)
INSERT INTO public.club_levels (company_id, site_id, name, min_points, benefit)
SELECT s.company_id, s.id, v.n, v.m, NULL FROM public.portal_sites s,
 (VALUES ('Fã',0),('Gang',500),('Lenda',1500)) v(n,m)
WHERE s.domain = 'newgangfestival.pt' ON CONFLICT (site_id, min_points) DO NOTHING;

-- 5) Faixas de prémios (texto do prémio a definir; placeholder '—' editável no CRM)
INSERT INTO public.club_rewards (company_id, site_id, tier_label, rank_from, rank_to, level_name, reward, sort)
SELECT s.company_id, s.id, v.t, v.f, v.u, v.lv, '—', v.o FROM public.portal_sites s,
 (VALUES ('Top 3',1,3,NULL,1),('4–20',4,20,NULL,2),('21–100',21,100,NULL,3),('Todos os Lenda',NULL,NULL,'Lenda',4)) v(t,f,u,lv,o)
WHERE s.domain = 'newgangfestival.pt';

-- 6) OPCIONAL (decisão do Pedro): backfill das inscrições clube_newgang já processadas como membros
--    NÃO confirmados (sem pontos até clicarem no link). Ordem de member_no = ordem de inscrição.
SELECT public.club_upsert_member(s.id, lc.email, split_part(coalesce(lc.name,''),' ',1), lc.phone,
       (SELECT c.id FROM public.contacts c WHERE lower(trim(c.email)) = lower(trim(lc.email)) AND c.company_id = s.company_id LIMIT 1),
       lc.raw->>'referral_code', 'importacao')
  FROM public.lead_capture lc CROSS JOIN public.portal_sites s
 WHERE s.domain = 'newgangfestival.pt' AND lc.source = 'clube_newgang' AND lc.processed AND lc.email IS NOT NULL
   AND lc.company_id = s.company_id
 ORDER BY lc.created_at;

COMMIT;
