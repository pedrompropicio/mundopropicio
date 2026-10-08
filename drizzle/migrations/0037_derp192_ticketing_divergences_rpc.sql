-- D-ERP192: os avisos de divergência passam para o ecrã (Dashboard). Lê a MESMA detecção da vigia
-- (ticketline_crosscheck_signals, D-ERP191) — sem segunda regra — e só devolve eventos da empresa activa.
CREATE OR REPLACE FUNCTION public.get_ticketing_divergences()
RETURNS TABLE(config_id uuid, event_id uuid, event_name text, bilheteira text, condicao text,
              our_qty bigint, our_value numeric, portal_qty bigint, portal_value numeric,
              diff_qty bigint, diff_value numeric, dias int, last_read date,
              sum_xlsx bigint, sum_ours bigint, sum_pdf bigint, series text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $f$
  with s as (
    select * from public.ticketline_crosscheck_signals()
     where (cond_e or cond_g) and public.row_belongs_to_current_company(company_id)
  ), last as (
    select distinct on (x.config_id) x.*
      from public.ticketline_crosscheck_runs x
     where x.config_id in (select s.config_id from s)
     order by x.config_id, x.checked_on desc
  ), streak as (
    select x.config_id, count(*)::int as dias
      from public.ticketline_crosscheck_runs x
      join last l on l.config_id = x.config_id
     where x.status = 'divergente'
       and x.checked_on > coalesce((select max(y.checked_on) from public.ticketline_crosscheck_runs y
                                     where y.config_id = x.config_id and y.status <> 'divergente'), '1900-01-01')
     group by x.config_id
  )
  select s.config_id, s.event_id, s.event_name, 'Ticketline'::text,
         case when s.cond_g then 'g' else 'e' end,
         l.our_qty::bigint, l.our_value, l.portal_qty::bigint, l.portal_value,
         l.diff_qty::bigint, l.diff_value, coalesce(st.dias, 1), l.checked_on,
         s.sum_xlsx, s.sum_ours, s.sum_pdf, s.series
    from s join last l on l.config_id = s.config_id
    left join streak st on st.config_id = s.config_id
   order by s.event_name
$f$;
REVOKE EXECUTE ON FUNCTION public.get_ticketing_divergences() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ticketing_divergences() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticketing_divergences() TO authenticated, service_role;