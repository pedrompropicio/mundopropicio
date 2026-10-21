SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.artist_ads_breakdowns(uuid, integer, text, text);
CREATE FUNCTION public.artist_ads_breakdowns(p_artist_id uuid, p_days integer DEFAULT 30, p_platform text DEFAULT NULL::text, p_breakdown text DEFAULT NULL::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_country text DEFAULT NULL::text)
 RETURNS TABLE(platform text, breakdown text, breakdown_value text, impressions bigint, clicks bigint, spend numeric, currency text, quota numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'crm'
AS $function$
  with guard as (select public.artist_access_check(p_artist_id,'read','traffic') as company_id),
  conns as (
    select c.id, c.platform, c.selected_ad_account_currency from crm.ad_platform_connections c, guard g
    where c.connection_scope = 'artist' and c.artist_id = p_artist_id and c.company_id = g.company_id
      and (p_platform is null or c.platform = p_platform)
  ),
  cmc as (
    select 'meta'::text platform, s.connection_id, s.external_campaign_id cid, coalesce(s.market_country,'?') mc
      from crm.meta_campaign_snapshot s join conns c on c.id=s.connection_id
    union all select 'google', g.connection_id, g.external_campaign_id, coalesce(g.market_country,'?')
      from crm.google_campaign g join conns c on c.id=g.connection_id
    union all select 'tiktok', t.connection_id, t.external_campaign_id, coalesce(t.market_country,'?')
      from crm.tiktok_campaign_carreira t join conns c on c.id=t.connection_id
  ),
  lv as (
    select b.*, coalesce(b.currency, c.selected_ad_account_currency) cur,
      min(case b.level when 'campaign' then 1 when 'adset' then 2 when 'ad' then 3 else 4 end)
        over (partition by b.connection_id, b.external_campaign_id, b.date_start, b.breakdown) top_rank,
      case b.level when 'campaign' then 1 when 'adset' then 2 when 'ad' then 3 else 4 end my_rank
    from crm.ads_insights_breakdown_daily b join conns c on c.id = b.connection_id
    where b.date_start between coalesce(p_from, current_date - (greatest(coalesce(p_days,30),1) - 1))
                           and coalesce(p_to, current_date)
      and (p_breakdown is null or b.breakdown = p_breakdown)
  ),
  base as (
    select b.platform, b.breakdown, b.breakdown_value, b.cur as currency,
           sum(coalesce(b.impressions,0))::bigint as impressions, sum(coalesce(b.clicks,0))::bigint as clicks,
           sum(coalesce(b.spend_cents,0))/100.0 as spend
    from lv b
    left join cmc k on k.platform=b.platform and k.connection_id=b.connection_id and k.cid=b.external_campaign_id
    where b.my_rank = b.top_rank
      and (p_country is null or coalesce(k.mc,'?') = upper(p_country))
    group by 1,2,3,4
  )
  select b.platform, b.breakdown, b.breakdown_value, b.impressions, b.clicks, b.spend, b.currency,
         round(100.0 * b.impressions / nullif(sum(b.impressions) over (partition by b.platform, b.breakdown, b.currency), 0), 1) as quota
  from base b order by b.platform, b.breakdown, b.currency, b.impressions desc
$function$;
REVOKE ALL ON FUNCTION public.artist_ads_breakdowns(uuid, integer, text, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_breakdowns(uuid, integer, text, text, date, date, text) TO authenticated, service_role;

DO $patch$
DECLARE
  d text := pg_get_functiondef('public.artist_ads_period_report(uuid,date,date,text)'::regprocedure);
  anchor text := $a$        'chegadas', nullif(pc.n,0), 'visitantes', nullif(pc.v,0),$a$;
  addition text := $b$        'metricas_por_moeda', (SELECT coalesce(jsonb_agg(jsonb_build_object('currency',x.currency,'gasto',x.g,'impressoes',x.imp,'cliques',x.clk,
                   'ctr', CASE WHEN x.imp>0 THEN round(x.clk/x.imp*100,4) END,
                   'cpc', CASE WHEN x.clk>0 THEN round(x.g/x.clk,4) END,
                   'cpm', CASE WHEN x.imp>0 THEN round(x.g/x.imp*1000,4) END,
                   'views', x.vw, 'views_metrica', CASE p.platform WHEN 'meta' THEN 'meta_thruplay' WHEN 'google' THEN 'google_views' ELSE 'tiktok_6s' END,
                   'cpv', CASE WHEN x.vw>0 THEN round(x.g/x.vw,4) END) ORDER BY x.currency),'[]'::jsonb)
                   FROM (SELECT currency, round(sum(spend),2) g, sum(imp) imp, sum(clk) clk,
                           sum(CASE p.platform WHEN 'meta' THEN mthru WHEN 'google' THEN gviews ELSE t6s END) vw
                         FROM cdr WHERE cdr.platform=p.platform GROUP BY 1 HAVING sum(spend)>0 OR sum(imp)>0) x),
$b$;
BEGIN
  IF position('metricas_por_moeda' in d) > 0 THEN RAISE EXCEPTION 'guard: metricas_por_moeda já existe'; END IF;
  IF (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 THEN RAISE EXCEPTION 'guard: âncora não encontrada uma única vez'; END IF;
  EXECUTE replace(d, anchor, addition || anchor);
END
$patch$;