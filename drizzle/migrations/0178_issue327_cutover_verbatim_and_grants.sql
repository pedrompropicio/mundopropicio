-- #327 correção pós-aplicação (mesma autorização): (1) club_points_cutover reposto VERBATIM do PENDENTE rev3
-- (0177 omitiu 2 linhas de comentário dentro do corpo; md5 divergia do testado — sem diferença funcional);
-- (2) as 6 tabelas novas herdaram privilégios por omissão do schema (anon e escrita de authenticated). O desenho é
-- SELECT só para authenticated (RLS staff+empresa) e escrita só via service_role/RPC: retirar o excesso.
CREATE OR REPLACE FUNCTION public.club_points_cutover(p_config uuid, p_expected_levels jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c club_points_config; s uuid; ev uuid; before jsonb; after jsonb; rb jsonb; ra jsonb; nf int; nm int; nl int := 0; k text; BEGIN
  SELECT site_id INTO s FROM club_points_config WHERE id = p_config;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover: config inexistente'; END IF;
  PERFORM _club_site_lock(s, true);                 -- espera pelos créditos em curso; novos esperam por nós
  SELECT * INTO c FROM club_points_config WHERE id = p_config FOR UPDATE;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'cutover: config não está em draft'; END IF;
  SELECT event_id INTO ev FROM portal_sites WHERE id = s;
  IF ev IS DISTINCT FROM c.event_id THEN RAISE EXCEPTION 'cutover: site aponta para % e a config para %', ev, c.event_id; END IF;
  SELECT jsonb_object_agg(name, min_points) INTO before FROM club_levels WHERE site_id = s;
  IF before IS DISTINCT FROM p_expected_levels THEN RAISE EXCEPTION 'cutover: níveis atuais % <> esperados %', before, p_expected_levels; END IF;
  IF c.legacy_counts THEN
    INSERT INTO club_legacy_consumption(company_id, site_id, event_id, config_id, member_id, rule_key, points, rows_counted, first_at, last_at)
    SELECT c.company_id, s, c.event_id, c.id, p.member_id, p.rule_key, sum(p.points)::int, count(*)::int, min(p.created_at), max(p.created_at)
      FROM club_points p JOIN club_members cm ON cm.id = p.member_id
     WHERE cm.site_id = s AND p.event_id IS NULL
       AND p.rule_key IN ('join_confirmed','friend_joined','crew_complete','promo_lot_purchase')
       AND NOT EXISTS (SELECT 1 FROM club_points v WHERE v.member_id = p.member_id AND v.rule_key = 'void' AND v.ref_id = p.rule_key || ':' || p.ref_id)
     GROUP BY p.member_id, p.rule_key
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS nl = ROW_COUNT;
    -- Indicados confirmados antes do patch (sem registo de contagem): entram na contagem desta edição.
    INSERT INTO club_referral_events(company_id, site_id, member_id, referee_id, event_id, credited_points, source, created_at)
    SELECT x.company_id, s, x.referred_by_member_id, x.id, c.event_id,
           coalesce((SELECT sum(p.points) FROM club_points p WHERE p.member_id = x.referred_by_member_id AND p.rule_key = 'friend_joined' AND p.ref_id = x.id::text AND p.event_id IS NULL),0)::int,
           'legacy_snapshot', x.confirmed_at
      FROM club_members x
     WHERE x.site_id = s AND x.confirmed_at IS NOT NULL AND x.referred_by_member_id IS NOT NULL AND x.referred_by_member_id <> x.id
    ON CONFLICT (member_id, referee_id) DO NOTHING;
  END IF;
  INSERT INTO club_level_floors(member_id, config_id, company_id, site_id, level_id, level_name, points_at_cutover)
  SELECT cm.id, c.id, cm.company_id, s, l.id, l.name, t.pts
    FROM club_members cm
    CROSS JOIN LATERAL (SELECT coalesce(sum(points),0)::bigint pts FROM club_points WHERE member_id = cm.id) t
    CROSS JOIN LATERAL (SELECT * FROM club_levels l WHERE l.site_id = s AND l.min_points <= t.pts ORDER BY l.min_points DESC LIMIT 1) l
   WHERE cm.site_id = s AND l.min_points > 0
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS nf = ROW_COUNT;
  SELECT count(*) INTO nm FROM club_members WHERE site_id = s;
  FOR k IN SELECT jsonb_object_keys(c.levels) LOOP
    UPDATE club_levels SET min_points = (c.levels->>k)::int WHERE site_id = s AND name = k;
    IF NOT FOUND THEN RAISE EXCEPTION 'cutover: nível % não existe', k; END IF;
  END LOOP;
  SELECT jsonb_object_agg(name, min_points) INTO after FROM club_levels WHERE site_id = s;
  -- Regras visíveis (site, crew_cfg, CRM) = valores que o motor paga. Só as 4 regras aprovadas; as restantes intactas.
  SELECT jsonb_object_agg(rule_key, jsonb_build_object('points', points, 'active', active)) INTO rb FROM club_point_rules WHERE site_id = s;
  UPDATE club_point_rules SET points = CASE rule_key WHEN 'join_confirmed' THEN c.join_points WHEN 'friend_joined' THEN c.referral_points
           WHEN 'crew_complete' THEN c.crew_points WHEN 'promo_lot_purchase' THEN c.purchase_points END
   WHERE site_id = s AND rule_key IN ('join_confirmed','friend_joined','crew_complete','promo_lot_purchase');
  SELECT jsonb_object_agg(rule_key, jsonb_build_object('points', points, 'active', active)) INTO ra FROM club_point_rules WHERE site_id = s;
  UPDATE club_points_config SET status = 'retired' WHERE site_id = s AND status = 'active';
  UPDATE club_points_config SET status = 'active', effective_at = clock_timestamp() WHERE id = c.id;
  INSERT INTO club_points_cutover_log(config_id, company_id, site_id, site_event_id, levels_before, levels_after, rules_before, rules_after,
                                      members_total, floors_created, legacy_rows)
    VALUES (c.id, c.company_id, s, ev, before, after, coalesce(rb,'{}'), coalesce(ra,'{}'), nm, nf, nl);
  RETURN jsonb_build_object('levels_before', before, 'levels_after', after, 'rules_before', rb, 'rules_after', ra,
                            'members', nm, 'floors', nf, 'legacy_rows', nl);
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['club_points_config','club_level_floors','club_points_cutover_log','club_legacy_consumption','club_referral_events','club_purchase_evidence'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;