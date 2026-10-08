-- D-ERP191: a conferência do portal de Produtores passa a usar a VARIAÇÃO diária do occupation.xlsx
-- (event_zone_capacities) contra a variação das nossas vendas (our_qty gravado pela ticketline-crosscheck,
-- regra de src/lib/ticketline-cutoff.ts). O total do PDF fica informativo e alimenta o sinal novo (g):
-- PDF parado enquanto o xlsx do mesmo evento se mexe (defeito do fornecedor, Issue #267).
CREATE OR REPLACE FUNCTION public.ticketline_crosscheck_signals(_as_of date DEFAULT ((now() AT TIME ZONE 'Europe/Lisbon')::date))
RETURNS TABLE(config_id uuid, company_id uuid, event_id uuid, event_name text, as_of date,
              n_days int, sum_xlsx bigint, sum_ours bigint, sum_pdf bigint,
              cond_e boolean, cond_g boolean, series text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $f$
  with occ as (
    select z.event_id, z.observed_on::date as d, sum(z.occupied)::bigint as occ
      from public.event_zone_capacities z
     where z.capacity_kind = 'released' and z.source = 'ticketline_occupation'
       and z.observed_on::date between _as_of - 3 and _as_of
     group by 1, 2
  ), r as (
    select x.config_id, x.company_id, x.event_id, e.name as event_name, x.checked_on as d,
           x.portal_qty::bigint as pq, x.our_qty::bigint as oq
      from public.ticketline_crosscheck_runs x
      join public.ticketline_sync_config c on c.id = x.config_id and c.enabled
      join public.events e on e.id = x.event_id
     where e.date >= _as_of
       and x.checked_on between _as_of - 3 and _as_of
       and x.status in ('ok','divergente')
  ), d as (
    select r.*, o.occ,
           r.pq - lag(r.pq) over w as dp,
           r.oq - lag(r.oq) over w as dn,
           o.occ - lag(o.occ) over w as dx,
           r.d - lag(r.d) over w as gap
      from r left join occ o on o.event_id = r.event_id and o.d = r.d
    window w as (partition by r.config_id order by r.d)
  ), v as (
    select * from d
     where d.d > _as_of - 3 and d.gap = 1
       and d.dx is not null and d.dn is not null and d.dp is not null
  )
  select v.config_id, v.company_id, v.event_id, v.event_name, _as_of,
         count(*)::int, sum(v.dx)::bigint, sum(v.dn)::bigint, sum(v.dp)::bigint,
         count(*) = 3 and bool_and(abs(v.dx - v.dn) >= 5
                                   and abs(v.dx - v.dn) >= 0.5 * greatest(abs(v.dx), abs(v.dn))),
         count(*) = 3 and sum(v.dx) >= 10 and sum(v.dp) <= 0.2 * sum(v.dx),
         string_agg(to_char(v.d,'DD/MM') || ' xlsx ' || v.dx || ' / nossas ' || v.dn || ' / PDF ' || v.dp, '; ' order by v.d)
    from v
   group by v.config_id, v.company_id, v.event_id, v.event_name
$f$;
REVOKE ALL ON FUNCTION public.ticketline_crosscheck_signals(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketline_crosscheck_signals(date) TO service_role;

DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.check_ticketing_sync_health()'::regprocedure);
  v_a int; v_b int;
  v_block text := $blk$  -- (e) divergência de VARIAÇÃO xlsx vs nossas vendas; (g) PDF parado com xlsx a mexer (D-ERP191)
  for r in
    select s.* from public.ticketline_crosscheck_signals() s where s.cond_e or s.cond_g
  loop
    if r.cond_e then
      v_detail := format('Variação diária do Mapa de Ocupação (xlsx) diferente da nossa em 3 dias seguidos: %s', r.series);
      v_items := v_items || jsonb_build_object('evento', r.event_name, 'bilheteira', 'Ticketline', 'condicao', 'e',
        'detalhe', v_detail, 'desdeQuando', to_char(r.as_of,'DD/MM/YYYY'), 'config_id', r.config_id, 'company_id', r.company_id);
      v_alerts := v_alerts || jsonb_build_object('evento', r.event_name, 'bilheteira', 'Ticketline', 'condicao', 'e',
        'detalhe', v_detail, 'desdeQuando', to_char(r.as_of,'DD/MM/YYYY'), 'company_id', r.company_id);
      v_alert_keys := v_alert_keys || jsonb_build_object('config_id', r.config_id, 'sync_type', 'ticketline_crosscheck');
      v_lines := v_lines || format('%s · Ticketline · condição (e) · %s', r.event_name, v_detail) || E'\n';
    end if;
    if r.cond_g then
      v_detail := format('PDF do portal mexeu %s bilhetes em 3 dias enquanto o xlsx do mesmo evento mexeu %s (nossas vendas: %s). Problema do fornecedor: %s',
        r.sum_pdf, r.sum_xlsx, r.sum_ours, r.series);
      v_items := v_items || jsonb_build_object('evento', r.event_name, 'bilheteira', 'Ticketline', 'condicao', 'g',
        'detalhe', v_detail, 'desdeQuando', to_char(r.as_of,'DD/MM/YYYY'), 'config_id', r.config_id, 'company_id', r.company_id);
      v_alerts := v_alerts || jsonb_build_object('evento', r.event_name, 'bilheteira', 'Ticketline', 'condicao', 'g',
        'detalhe', v_detail, 'desdeQuando', to_char(r.as_of,'DD/MM/YYYY'), 'company_id', r.company_id);
      v_alert_keys := v_alert_keys || jsonb_build_object('config_id', r.config_id, 'sync_type', 'ticketline_pdf_stale');
      v_lines := v_lines || format('%s · Ticketline · condição (g) · %s', r.event_name, v_detail) || E'\n';
    end if;
  end loop;

$blk$;
  v_spam_old text := $s$    if v_last_notified is not null and v_last_notified > now() - interval '12 hours' then
      continue;
    end if;$s$;
  v_spam_new text := $s$    if v_k->>'sync_type' in ('ticketline_crosscheck','ticketline_pdf_stale') then
      -- leitura do portal é diária: um envio por dia (Lisboa), depois da leitura
      if v_last_notified is not null
         and (v_last_notified at time zone 'Europe/Lisbon')::date >= (now() at time zone 'Europe/Lisbon')::date then
        continue;
      end if;
    elsif v_last_notified is not null and v_last_notified > now() - interval '12 hours' then
      continue;
    end if;$s$;
BEGIN
  IF position('ticketline_crosscheck_signals' in v_def) > 0 THEN RETURN; END IF;
  v_a := position('  -- (e) divergência com o portal de Produtores' in v_def);
  v_b := position('  if jsonb_array_length(v_items) > 0 then' in v_def);
  IF v_a = 0 OR v_b = 0 OR v_b < v_a OR position(v_spam_old in v_def) = 0 THEN
    RAISE EXCEPTION 'D-ERP191: definição de check_ticketing_sync_health() não bate com o esperado';
  END IF;
  v_def := substr(v_def, 1, v_a - 1) || v_block || substr(v_def, v_b);
  v_def := replace(v_def, v_spam_old, v_spam_new);
  v_def := replace(v_def, '(e) divergência com o portal de Produtores · (f) 6 corridas seguidas sem sucesso',
    '(e) variação xlsx ≠ nossas vendas · (f) 6 corridas seguidas sem sucesso · (g) PDF do portal parado com xlsx a mexer (fornecedor)');
  EXECUTE v_def;
END
$mig$;

REVOKE ALL ON FUNCTION public.check_ticketing_sync_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ticketing_sync_health() TO service_role;