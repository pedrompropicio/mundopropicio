-- D-ERP164 — artist_ads_period_report: campanhas Meta com destino ao PERFIL do Instagram
-- (identificado por meta_adset_snapshot.optimization_goal: PROFILE_VISIT / VISIT_INSTAGRAM_PROFILE /
-- PROFILE_AND_PAGE_ENGAGEMENT; destination_type não é gravado) passam a ter resultado = link_click
-- das actions ('cliques_perfil', "Cliques para o perfil"). Cliques (todos) fica ao lado como entrega.
-- actions lidas da coluna actions (fallback raw->'actions'). Mesma assinatura e ACL.
CREATE OR REPLACE FUNCTION public.artist_ads_period_report(p_artist_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  v_company uuid; v_ref text; v_nome text; v_out jsonb; v_plat jsonb; v_mus jsonb; v_lac jsonb; v_tot jsonb;
BEGIN
  v_company := public.artist_ads_assert_access(p_artist_id);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'período inválido' USING ERRCODE='22023'; END IF;
  IF p_to - p_from > 366 THEN RAISE EXCEPTION 'período máximo 366 dias' USING ERRCODE='22023'; END IF;

  SELECT a.name, coalesce(a.reporting_currency, co.currency, 'EUR') INTO v_nome, v_ref
  FROM public.artists a LEFT JOIN public.companies co ON co.id = a.company_id WHERE a.id = p_artist_id;

  WITH conns AS (
    SELECT c.id, c.platform, c.selected_ad_account_id, c.selected_ad_account_name, c.selected_ad_account_currency
    FROM crm.ad_platform_connections c
    WHERE c.connection_scope='artist' AND c.artist_id=p_artist_id AND c.company_id=v_company
  ),
  -- Última prova de que o sync de insights da ligação correu com sucesso (não há histórico por dia).
  conn_sync AS (
    SELECT c.id, greatest(
      CASE WHEN c.platform='meta' THEN (SELECT max(i.last_synced_at) FROM crm.meta_campaign_insights_daily i WHERE i.connection_id=c.id) END,
      CASE WHEN c.platform='meta' THEN (SELECT max(s.last_sync_at) FROM crm.meta_sync_state s
            WHERE s.connection_id=c.id AND s.level='insights_campaign'
              AND (s.last_error_at IS NULL OR s.last_error_at < s.last_sync_at)) END,
      CASE WHEN c.platform='google' THEN (SELECT max(i.last_synced_at) FROM crm.google_campaign_insights_daily i WHERE i.connection_id=c.id) END,
      CASE WHEN c.platform='tiktok' THEN (SELECT max(i.recorded_at) FROM crm.tiktok_insights_daily i WHERE i.connection_id=c.id AND i.source<>'manual') END
    ) ok_ate
    FROM conns c
  ),
  t_lv AS (
    SELECT i.*, bool_or(i.level='campaign') OVER (PARTITION BY i.connection_id, i.external_campaign_id, i.date_start) has_c
    FROM crm.tiktok_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='tiktok'
    WHERE i.level IN ('campaign','adgroup') AND i.date_start BETWEEN p_from AND p_to
  ),
  -- sm6/smc/smi/sml = gasto das linhas em que views 6 s / cliques / impressões foram lidos.
  cd AS (
    SELECT 'meta'::text platform, i.connection_id, i.external_campaign_id cid, i.date_start dia,
      coalesce(i.currency,c.selected_ad_account_currency) currency, i.spend_cents/100.0 spend,
      i.impressions::numeric imp, i.clicks::numeric clk,
      i.video_3s_views::numeric m3s, i.video_thruplays::numeric mthru, i.video_p25_watched::numeric p25,
      i.video_p50_watched::numeric p50, i.video_p75_watched::numeric p75, i.video_p100_watched::numeric p100,
      NULL::numeric gviews, NULL::numeric t2s, NULL::numeric t6s, NULL::numeric likes, NULL::numeric follows,
      i.last_synced_at leitura, 'api'::text src,
      NULL::numeric sm6,
      CASE WHEN i.clicks IS NOT NULL THEN i.spend_cents/100.0 END smc,
      CASE WHEN i.impressions IS NOT NULL THEN i.spend_cents/100.0 END smi,
      lk.lc,
      CASE WHEN lk.lc IS NOT NULL THEN i.spend_cents/100.0 END sml
    FROM crm.meta_campaign_insights_daily i
    LEFT JOIN LATERAL (SELECT sum((a->>'value')::numeric) lc FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(coalesce(i.actions, i.raw->'actions'))='array' THEN coalesce(i.actions, i.raw->'actions') ELSE '[]'::jsonb END) a
        WHERE a->>'action_type'='link_click') lk ON true JOIN conns c ON c.id=i.connection_id AND c.platform='meta'
    WHERE i.date_start BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'google', i.connection_id, i.external_campaign_id, i.date_start,
      coalesce(i.currency,c.selected_ad_account_currency), i.spend_cents/100.0, i.impressions, i.clicks,
      NULL,NULL,NULL,NULL,NULL,NULL,
      CASE WHEN coalesce(i.video_metrics->>'video_views', i.raw->>'video_views') ~ '^[0-9]+(\.0+)?$'
           THEN (coalesce(i.video_metrics->>'video_views', i.raw->>'video_views'))::numeric END,
      NULL,NULL,NULL,NULL, i.last_synced_at, 'api',
      NULL,
      CASE WHEN i.clicks IS NOT NULL THEN i.spend_cents/100.0 END,
      CASE WHEN i.impressions IS NOT NULL THEN i.spend_cents/100.0 END,
      NULL, NULL
    FROM crm.google_campaign_insights_daily i JOIN conns c ON c.id=i.connection_id AND c.platform='google'
    WHERE i.date_start BETWEEN p_from AND p_to
    UNION ALL
    SELECT 'tiktok', i.connection_id, i.external_campaign_id, i.date_start,
      coalesce(max(i.currency),max(c.selected_ad_account_currency)), sum(i.spend_cents)/100.0, sum(i.impressions), sum(i.clicks),
      NULL,NULL,NULL,NULL,NULL,NULL,NULL,
      sum(i.video_views_2s), sum(i.video_views_6s), sum(i.likes), sum(i.follows),
      max(i.recorded_at), CASE WHEN bool_and(i.source='manual') THEN 'manual' ELSE 'api' END,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.video_views_6s IS NOT NULL),0)/100.0,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.clicks IS NOT NULL),0)/100.0,
      coalesce(sum(i.spend_cents) FILTER (WHERE i.impressions IS NOT NULL),0)/100.0,
      NULL, NULL
    FROM t_lv i JOIN conns c ON c.id=i.connection_id
    WHERE (i.has_c AND i.level='campaign') OR (NOT i.has_c AND i.level='adgroup')
    GROUP BY i.connection_id, i.external_campaign_id, i.date_start
  ),
  cdr AS (
    SELECT z.*, (coalesce(z.spend,0)>0 AND z.spend_ref IS NULL) fx_miss FROM (
      SELECT cd.*, CASE WHEN coalesce(cd.spend,0)=0 THEN 0 ELSE public.fx_convert(cd.spend, cd.currency, v_ref, cd.dia) END spend_ref
      FROM cd) z
  ),
  ev AS MATERIALIZED (
    SELECT g.src, public.artist_ads_campaign_key(g.utm_campaign) k, g.n, g.v FROM (
      SELECT lower(coalesce(e.utm_source,'')) src, e.utm_campaign, count(*) n,
        count(DISTINCT (e.ip_hash, e.created_at::date)) v
      FROM public.song_link_events e
      WHERE e.artist_id=p_artist_id AND e.event='arrival'
        AND e.created_at >= p_from::timestamptz AND e.created_at < (p_to+1)::timestamptz
      GROUP BY 1,2) g
  ),
  evk AS (SELECT * FROM ev WHERE length(k) >= 10),
  cm AS (
    SELECT 'meta'::text platform, s.connection_id, s.external_campaign_id cid, s.name nome,
      coalesce(s.effective_status,s.status) st, s.objective objetivo,
      (SELECT string_agg(DISTINCT a.optimization_goal, ',') FROM crm.meta_adset_snapshot a
        WHERE a.connection_id=s.connection_id AND a.external_campaign_id=s.external_campaign_id) otimizacao,
      nullif(s.daily_budget_cents,0)/100.0 orc, s.linked_song_id song, s.last_synced_at leitura_meta
    FROM crm.meta_campaign_snapshot s JOIN conns c ON c.id=s.connection_id
    UNION ALL
    SELECT 'google', g.connection_id, g.external_campaign_id, g.name, g.status, g.advertising_channel_type,
      g.bidding_strategy_type, g.budget_amount_micros/1000000.0, g.linked_song_id, g.last_synced_at
    FROM crm.google_campaign g JOIN conns c ON c.id=g.connection_id
    UNION ALL
    SELECT 'tiktok', t.connection_id, t.external_campaign_id, t.name, t.status, t.objective,
      (SELECT string_agg(DISTINCT coalesce(ag.raw->>'optimization_goal', ag.raw->>'otimizacao'), ',') FROM crm.tiktok_adgroup ag
        WHERE ag.connection_id=t.connection_id AND ag.external_campaign_id=t.external_campaign_id),
      coalesce(nullif(t.budget_cents,0),
        (SELECT nullif(sum(ag.budget_cents),0) FROM crm.tiktok_adgroup ag
          WHERE ag.connection_id=t.connection_id AND ag.external_campaign_id=t.external_campaign_id
            AND upper(coalesce(ag.status,'')) IN ('ENABLE','ACTIVE')))/100.0,
      t.linked_song_id, t.last_synced_at
    FROM crm.tiktok_campaign t JOIN conns c ON c.id=t.connection_id
  ),
  agg AS (
    SELECT platform, connection_id, cid,
      max(currency) currency,
      min(dia) FILTER (WHERE spend>0) d0, max(dia) FILTER (WHERE spend>0) d1,
      min(dia) primeira_linha, max(dia) ultima_linha,
      count(DISTINCT dia) FILTER (WHERE spend>0) dias_entrega,
      round(sum(spend),2) gasto, round(sum(spend_ref),2) gasto_ref,
      count(*) FILTER (WHERE fx_miss) fx_missing,
      sum(imp) imp, sum(clk) clk, sum(lc) lc,
      sum(m3s) m3s, sum(mthru) mthru, sum(p25) p25, sum(p50) p50, sum(p75) p75, sum(p100) p100,
      sum(gviews) gviews, sum(t2s) t2s, sum(t6s) t6s, sum(likes) likes, sum(follows) follows,
      max(leitura) leitura, CASE WHEN bool_and(src='manual') THEN 'manual' ELSE 'api' END src
    FROM cdr GROUP BY 1,2,3
  ),
  camp AS (
    SELECT a.*, m.nome, m.objetivo, m.otimizacao, m.orc, m.song, c.selected_ad_account_id account_id,
      CASE WHEN upper(coalesce(m.st,'')) IN ('ACTIVE','ENABLED','ENABLE','CAMPAIGN_STATUS_ENABLE') THEN 'ativo'
           WHEN upper(coalesce(m.st,'')) IN ('PAUSED','DISABLE','CAMPAIGN_PAUSED','ADSET_PAUSED','CAMPAIGN_STATUS_DISABLE') THEN 'pausado'
           WHEN upper(coalesce(m.st,'')) IN ('REMOVED','DELETED','DELETE','ARCHIVED') THEN 'removido'
           ELSE 'outro' END estado,
      public.artist_ads_campaign_key(m.nome) nkey, cs.ok_ate
    FROM agg a LEFT JOIN cm m ON m.platform=a.platform AND m.connection_id=a.connection_id AND m.cid=a.cid
    JOIN conns c ON c.id=a.connection_id
    LEFT JOIN conn_sync cs ON cs.id=a.connection_id
  ),
  camp2 AS (
    SELECT cp.*,
      CASE
        WHEN cp.platform='tiktok' AND cp.nome ~* 'visualiza' THEN 'views_6s'
        WHEN cp.platform='tiktok' AND cp.nome ~* 'tr[aá]fego' THEN 'chegada_smart_link'
        WHEN cp.platform='meta' AND cp.nome ~* '^\s*\[mp\]' AND coalesce(cp.objetivo,'') ~* 'traffic|link_clicks' THEN 'chegada_smart_link'
        -- Destino perfil do Instagram: optimization_goal dos adsets (destination_type não é gravado).
        WHEN cp.platform='meta' AND coalesce(cp.otimizacao,'') ~* 'VISIT_INSTAGRAM_PROFILE|PROFILE_VISIT|PROFILE_AND_PAGE_ENGAGEMENT' THEN 'cliques_perfil'
        WHEN cp.platform='google' AND coalesce(cp.objetivo,'')='VIDEO' AND coalesce(cp.otimizacao,'')='TARGET_CPM' THEN 'impressoes'
      END rtipo,
      ch.n chegadas, ch.v visitantes
    FROM camp cp
    LEFT JOIN LATERAL (SELECT coalesce(sum(x.n),0) n, coalesce(sum(x.v),0) v FROM evk x
        WHERE CASE cp.platform WHEN 'tiktok' THEN x.src='tiktok'
                               WHEN 'meta' THEN x.src IN ('meta','facebook','instagram','fb','ig')
                               ELSE false END
          AND (x.k = cp.nkey OR cp.nkey LIKE x.k||'%' OR x.k LIKE cp.nkey||'%')) ch ON true
  ),
  -- mcol: medida de que o resultado depende (null = resultado lido em todos os dias com gasto).
  camp2b AS (
    SELECT c2.*,
      CASE c2.rtipo
        WHEN 'views_6s' THEN 's6'
        WHEN 'chegada_smart_link' THEN CASE WHEN c2.chegadas>0 THEN NULL ELSE 'clk' END
        WHEN 'cliques_perfil' THEN 'lc'
        WHEN 'impressoes' THEN 'imp'
      END mcol
    FROM camp2 c2
  ),
  camp2c AS (
    SELECT c.*, coalesce(sm.valor,0) sem_med_valor, sm.dias sem_med_dias,
      round(c.gasto - coalesce(sm.valor,0),2) gasto_medido
    FROM camp2b c
    LEFT JOIN LATERAL (
      SELECT round(sum(x.spend - coalesce(CASE c.mcol WHEN 's6' THEN x.sm6 WHEN 'clk' THEN x.smc WHEN 'lc' THEN x.sml ELSE x.smi END,0)),2) valor,
             array_agg(x.dia ORDER BY x.dia) dias
      FROM cd x
      WHERE c.mcol IS NOT NULL AND x.platform=c.platform AND x.connection_id=c.connection_id AND x.cid=c.cid
        AND coalesce(x.spend,0) - coalesce(CASE c.mcol WHEN 's6' THEN x.sm6 WHEN 'clk' THEN x.smc WHEN 'lc' THEN x.sml ELSE x.smi END,0) > 0.004
    ) sm ON true
  ),
  camp3 AS (
    SELECT c2.*,
      CASE c2.rtipo
        WHEN 'views_6s' THEN jsonb_build_object('nome','views_6s','valor',c2.t6s,'custo',CASE WHEN c2.t6s>0 THEN round(c2.gasto_medido/c2.t6s,6) END)
        WHEN 'chegada_smart_link' THEN
          CASE WHEN c2.chegadas>0 THEN jsonb_build_object('nome','chegada_smart_link','valor',c2.chegadas,'custo',round(c2.gasto_medido/c2.chegadas,4))
               ELSE jsonb_build_object('nome','chegada_smart_link','valor',c2.clk,'custo',CASE WHEN c2.clk>0 THEN round(c2.gasto_medido/c2.clk,4) END) END
        -- Se um dia a API expuser a ação de visita ao perfil do Instagram, ela substitui o link_click aqui.
        WHEN 'cliques_perfil' THEN jsonb_build_object('nome','cliques_perfil','rotulo','Cliques para o perfil','valor',c2.lc,
          'custo',CASE WHEN c2.lc>0 THEN round(c2.gasto_medido/c2.lc,4) END)
        WHEN 'impressoes' THEN jsonb_build_object('nome','impressoes','valor',c2.imp,'custo',CASE WHEN c2.imp>0 THEN round(c2.gasto_medido/(c2.imp/1000.0),4) END)
      END resultado,
      CASE c2.rtipo
        WHEN 'views_6s' THEN 'visualizações de 6 s da plataforma'
        WHEN 'chegada_smart_link' THEN CASE WHEN c2.chegadas>0 THEN 'song_link_events arrival por utm_source+utm_campaign'
                                            ELSE 'fallback: cliques (sem UTM correspondente)' END
        WHEN 'cliques_perfil' THEN 'insights Meta: actions link_click (destino perfil Instagram por optimization_goal)'
        WHEN 'impressoes' THEN 'impressões; custo = CPM'
      END resultado_origem,
      (SELECT array_agg(gs::date ORDER BY gs)
         FROM generate_series(c2.primeira_linha,
                CASE WHEN c2.estado='ativo' THEN least(p_to, current_date-1) ELSE c2.ultima_linha END, '1 day') gs
         WHERE NOT EXISTS (SELECT 1 FROM cd x WHERE x.platform=c2.platform AND x.connection_id=c2.connection_id AND x.cid=c2.cid AND x.dia=gs::date)) sem_linha,
      (SELECT jsonb_build_object('nome', coalesce(p.resumo->'meta'->>'nome', g.resultado_nome),
                                 'valor', coalesce((p.resumo->'meta'->>'valor')::numeric, g.meta_valor))
         FROM (SELECT 1) one
         LEFT JOIN LATERAL (SELECT pp.resumo FROM crm.meta_publish_plan pp
                 WHERE pp.company_id=v_company AND pp.artist_id=p_artist_id
                   AND coalesce(pp.external_campaign_id, pp.meta_campaign_id)=c2.cid
                   AND jsonb_typeof(pp.resumo->'meta')='object' AND (pp.resumo->'meta'->>'valor') IS NOT NULL
                 ORDER BY pp.created_at DESC LIMIT 1) p ON true
         LEFT JOIN LATERAL (SELECT gg.resultado_nome, gg.meta_valor FROM public.artist_ads_campaign_goals gg
                 WHERE gg.company_id=v_company AND gg.platform=c2.platform AND gg.external_campaign_id=c2.cid
                   AND gg.nivel='campaign' AND gg.valido_desde<=p_to
                 ORDER BY gg.valido_desde DESC LIMIT 1) g ON true
         WHERE p.resumo IS NOT NULL OR g.resultado_nome IS NOT NULL) meta_obj,
      (SELECT (gc.reach->k->>'unique_users')::numeric FROM crm.google_campaign gc, jsonb_object_keys(coalesce(gc.reach,'{}'::jsonb)) k
        WHERE c2.platform='google' AND gc.connection_id=c2.connection_id AND gc.external_campaign_id=c2.cid
          AND gc.reach->k->>'periodo' = p_from::text||'..'||p_to::text
          AND (gc.reach->k->>'unique_users') ~ '^[0-9]+$' LIMIT 1) alcance
    FROM camp2c c2
  ),
  -- api: dia sem linha com o sync da ligação a correr com sucesso depois desse dia = sem entrega;
  -- caso contrário = sem leitura. manual: tudo continua em dias_sem_leitura.
  camp4 AS (
    SELECT c.*,
      CASE WHEN c.src='manual' THEN c.sem_linha
           ELSE (SELECT array_agg(d ORDER BY d) FROM unnest(c.sem_linha) d
                 WHERE c.ok_ate IS NULL OR c.ok_ate < (d+1)::timestamptz) END sem_leitura,
      CASE WHEN c.src='manual' THEN NULL
           ELSE (SELECT array_agg(d ORDER BY d) FROM unnest(c.sem_linha) d
                 WHERE c.ok_ate >= (d+1)::timestamptz) END sem_entrega
    FROM camp3 c
  ),
  camp_json AS (
    SELECT c.platform, c.connection_id, c.gasto, jsonb_build_object(
      'campaign_id', c.cid, 'nome', c.nome, 'account_id', c.account_id, 'currency', c.currency,
      'estado_normalizado', c.estado, 'objetivo', c.objetivo, 'otimizacao', c.otimizacao,
      'orcamento_diario', c.orc, 'primeiro_dia', c.d0, 'ultimo_dia', c.d1, 'dias_com_entrega', c.dias_entrega,
      'gasto', c.gasto, 'gasto_ref', c.gasto_ref, 'impressoes', c.imp, 'cliques', c.clk,
      'cliques_link', CASE WHEN c.platform='meta' THEN c.lc END,
      'gasto_sem_medicao', CASE WHEN c.rtipo IS NOT NULL THEN jsonb_build_object('valor', c.sem_med_valor,
                             'dias', coalesce(to_jsonb(c.sem_med_dias),'[]'::jsonb)) END,
      'chegadas_eventos', CASE WHEN c.platform IN ('meta','tiktok') THEN c.chegadas END,
      'visitantes_unicos_dia', CASE WHEN c.platform IN ('meta','tiktok') THEN c.visitantes END,
      'ctr', CASE WHEN c.imp>0 THEN round(c.clk/c.imp*100,4) END,
      'cpc', CASE WHEN c.clk>0 THEN round(c.gasto/c.clk,4) END,
      'cpm', CASE WHEN c.imp>0 THEN round(c.gasto/c.imp*1000,4) END,
      'video', CASE c.platform
        WHEN 'meta' THEN jsonb_build_object('meta_3s',c.m3s,'meta_thruplay',c.mthru,'meta_p25',c.p25,'meta_p50',c.p50,'meta_p75',c.p75,'meta_p100',c.p100)
        WHEN 'google' THEN jsonb_build_object('google_views',c.gviews)
        ELSE jsonb_build_object('tiktok_2s',c.t2s,'tiktok_6s',c.t6s) END,
      'tiktok', CASE WHEN c.platform='tiktok' THEN jsonb_build_object('gostos',c.likes,'seguidores',c.follows) END,
      'resultado', c.resultado,
      'alcance_periodo', c.alcance,
      'meta', c.meta_obj,
      'fonte', jsonb_build_object('data_source', c.src, 'ultimo_dia_com_dados', c.ultima_linha,
               'ultima_leitura', c.leitura, 'dias_sem_leitura', coalesce(to_jsonb(c.sem_leitura),'[]'::jsonb),
               'dias_sem_entrega', coalesce(to_jsonb(c.sem_entrega),'[]'::jsonb),
               'ultimo_sync_ok', c.ok_ate,
               'resultado_origem', c.resultado_origem,
               'nota_resultado', CASE WHEN c.rtipo='cliques_perfil'
                 THEN 'contagem de ações da Meta (janela de atribuição); pode diferir de Cliques (todos)' END,
               'custo_resultado', 'gasto dos dias/grupos em que o resultado foi lido ÷ resultado (exclui gasto_sem_medicao)',
               'metodo_chegadas', CASE WHEN c.platform IN ('meta','tiktok')
                 THEN 'chegadas = carregamentos da página; visitantes = IP anonimizado único por dia' END),
      'linked_song_id', c.song) j,
      c.rtipo, c.resultado_origem, c.nome, c.sem_leitura, c.fx_missing, c.song,
      c.currency, c.sem_med_valor, c.sem_med_dias
    FROM camp4 c
  ),
  plat AS (
    SELECT p.platform,
      jsonb_build_object('platform', p.platform,
        'contas', (SELECT coalesce(jsonb_agg(jsonb_build_object('account_id', c.selected_ad_account_id,
                     'account_name', c.selected_ad_account_name, 'currency', c.selected_ad_account_currency,
                     'gestor', CASE WHEN c.selected_ad_account_name ~* '^\s*mp\M'
                                      OR EXISTS (SELECT 1 FROM cm x WHERE x.connection_id=c.id AND (x.nome ~* '^\s*\[mp\]' OR x.cid LIKE 'manual:mp-%'))
                                    THEN 'mp' ELSE 'externo' END) ORDER BY c.selected_ad_account_name),'[]'::jsonb)
                   FROM conns c WHERE c.platform=p.platform),
        'campanhas', (SELECT coalesce(jsonb_agg(cj.j ORDER BY cj.gasto DESC NULLS LAST),'[]'::jsonb) FROM camp_json cj WHERE cj.platform=p.platform),
        'serie_diaria', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',s.dia,'currency',s.currency,'gasto',s.g,'gasto_ref',s.gr) ORDER BY s.dia, s.currency),'[]'::jsonb)
                   FROM (SELECT dia, currency, round(sum(spend),2) g, round(sum(spend_ref),2) gr FROM cdr WHERE cdr.platform=p.platform GROUP BY 1,2) s)
      ) j
    FROM (SELECT DISTINCT platform FROM conns) p
  )
  SELECT
    (SELECT coalesce(jsonb_agg(j ORDER BY array_position(ARRAY['meta','google','tiktok'], platform)),'[]'::jsonb) FROM plat),
    jsonb_build_object(
      'gasto_ref', (SELECT round(sum(spend_ref),2) FROM cdr),
      'fx_missing_days', (SELECT count(DISTINCT dia) FROM cdr WHERE fx_miss),
      'gasto_por_moeda', (SELECT coalesce(jsonb_agg(jsonb_build_object('currency',currency,'valor',v) ORDER BY currency),'[]'::jsonb)
                          FROM (SELECT currency, round(sum(spend),2) v FROM cdr GROUP BY 1 HAVING sum(spend)>0) z),
      'impressoes', (SELECT sum(imp) FROM cdr), 'cliques', (SELECT sum(clk) FROM cdr),
      'views', jsonb_build_object('meta_3s',(SELECT sum(m3s) FROM cdr),'meta_thruplay',(SELECT sum(mthru) FROM cdr),
        'google_views',(SELECT sum(gviews) FROM cdr),'tiktok_2s',(SELECT sum(t2s) FROM cdr),'tiktok_6s',(SELECT sum(t6s) FROM cdr))),
    (SELECT coalesce(jsonb_agg(l),'[]'::jsonb) FROM (
      SELECT 'Conta '||coalesce(c.selected_ad_account_name,c.selected_ad_account_id)||' ('||c.platform||', '||coalesce(c.selected_ad_account_currency,'?')||'): sem entrega no período' l
        FROM conns c WHERE NOT EXISTS (SELECT 1 FROM cdr WHERE cdr.connection_id=c.id AND cdr.spend>0)
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": resultado '||resultado_origem
        FROM camp_json WHERE resultado_origem LIKE 'fallback%'
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": sem regra de resultado para o objetivo — resultado null' FROM camp_json WHERE rtipo IS NULL
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": dias sem leitura '||array_to_string(sem_leitura, ', ') FROM camp_json WHERE cardinality(sem_leitura)>0
      UNION ALL SELECT 'gasto sem medição: '
             ||CASE currency WHEN 'BRL' THEN 'R$' WHEN 'EUR' THEN '€' WHEN 'USD' THEN 'US$' ELSE coalesce(currency,'?') END||' '
             ||translate(to_char(sem_med_valor,'FM999,999,990.00'), ',.', '.,')
             ||' a '||(SELECT string_agg(to_char(d,'DD/MM'), ', ' ORDER BY d) FROM unnest(sem_med_dias) d)
             ||' — '||coalesce(nome,'?')
        FROM camp_json WHERE sem_med_valor > 0
      UNION ALL SELECT 'Campanha "'||coalesce(nome,'?')||'": '||fx_missing||' dia(s) sem câmbio para '||v_ref FROM camp_json WHERE fx_missing>0
      UNION ALL SELECT 'Alcance do período: não há alcance único gravado para este período (alcance diário não se soma) — alcance_periodo null'
        WHERE EXISTS (SELECT 1 FROM camp3 WHERE alcance IS NULL)
    ) q)
  INTO v_plat, v_tot, v_lac;

  WITH songs AS (
    SELECT DISTINCT s.id, s.title FROM public.artist_songs s
    WHERE s.artist_id=p_artist_id AND s.id IN (
      SELECT (c->>'linked_song_id')::uuid FROM jsonb_array_elements(v_plat) p, jsonb_array_elements(p->'campanhas') c
      WHERE c->>'linked_song_id' IS NOT NULL)
  ),
  m AS (
    SELECT d.* FROM public.artist_song_metrics_daily d JOIN songs s ON s.id=d.song_id
    WHERE d.metric_date BETWEEN p_from AND p_to
  ),
  ouv AS (
    SELECT DISTINCT ON (song_id, metric_date) song_id, metric_date, value FROM m
    WHERE metric='s4a_listeners_28d' ORDER BY song_id, metric_date, (source='s4a_api') DESC, captured_at DESC
  ),
  ugc AS (
    SELECT DISTINCT ON (song_id, metric_date) song_id, metric_date, value, source FROM m
    WHERE metric='ugc_videos' AND platform='tiktok' AND source IN ('ios_shortcut','manual')
    ORDER BY song_id, metric_date, CASE source WHEN 'ios_shortcut' THEN 1 ELSE 2 END, captured_at DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'song_id', s.id, 'titulo', s.title,
      'streams_s4a_periodo', (SELECT sum(value) FROM m WHERE m.song_id=s.id AND metric='s4a_streams_day'),
      'ouvintes_inicio', (SELECT jsonb_build_object('valor',value,'data',metric_date) FROM ouv WHERE ouv.song_id=s.id ORDER BY metric_date LIMIT 1),
      'ouvintes_fim', (SELECT jsonb_build_object('valor',value,'data',metric_date) FROM ouv WHERE ouv.song_id=s.id ORDER BY metric_date DESC LIMIT 1),
      'ugc_inicio', (SELECT jsonb_build_object('valor',value,'data',metric_date,'source',source) FROM ugc WHERE ugc.song_id=s.id ORDER BY metric_date LIMIT 1),
      'ugc_fim', (SELECT jsonb_build_object('valor',value,'data',metric_date,'source',source) FROM ugc WHERE ugc.song_id=s.id ORDER BY metric_date DESC LIMIT 1)
    ) ORDER BY s.title),'[]'::jsonb)
  INTO v_mus FROM songs s;

  v_out := jsonb_build_object(
    'artista', jsonb_build_object('id', p_artist_id, 'nome', v_nome),
    'periodo', jsonb_build_object('de', p_from, 'ate', p_to, 'dias', (p_to - p_from) + 1),
    'gerado_em', now(),
    'ref_currency', v_ref,
    'totais', v_tot,
    'plataformas', v_plat,
    'musica', v_mus,
    'lacunas', v_lac);
  RETURN v_out;
END $function$;

REVOKE ALL ON FUNCTION public.artist_ads_period_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_period_report(uuid, date, date) TO authenticated, service_role;