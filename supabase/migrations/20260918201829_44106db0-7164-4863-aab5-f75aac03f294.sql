-- #214 — Dinâmica de lotes e preços por zona (BI de Vendas, nível do evento).
--
-- Duas funções que devolvem jsonb numa só linha: a série por zona passa os
-- 1.000 registos (Simone: 14 zonas x 191 dias) e o PostgREST corta setof em
-- silêncio (#205, #206). Nada de setof grande.
--
-- Lotação: SÓ event_zone_capacities com capacity_kind = 'released' e a
-- observação mais recente de cada evento (#198). Nunca
-- event_ticket_zones.total_capacity. O join é por texto normalizado entre
-- event_zone_capacities.zone_label e event_ticket_zones.name; quando não casa,
-- a zona aparece com lotação nula e unmatched_capacity = true.
--
-- Guarda de frescura: por zona só existe ticket_sales, que congela durante uma
-- falha de sync. Devolve-se sempre o max(sale_date) e o total dos dois lados
-- (ticket_sales vs espelho ticketline_daily_sales / bol_daily_sales).

create or replace function public.get_zone_price_dynamics(p_event_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
with sales as (
  select z.event_id,
         ts.zone_id,
         z.name                                        as zone_label,
         ts.lot_id,
         ts.sale_date,
         coalesce(ts.quantity, 0)::numeric             as quantity,
         coalesce(ts.total_value, coalesce(ts.quantity, 0) * coalesce(ts.unit_price, 0))::numeric as value,
         ts.unit_price::numeric                        as unit_price,
         ts.source
  from ticket_sales ts
  join event_ticket_zones z on z.id = ts.zone_id
  where z.event_id = any(p_event_ids)
),
ev as (
  select e.id, e.name, e.date::date as event_date
  from events e
  where e.id = any(p_event_ids)
),
-- preço do dia por zona: o do maior volume desse dia (evita ruído quando o
-- import traz duas linhas no mesmo dia).
day_zone as (
  select zone_id, event_id, zone_label, sale_date,
         sum(quantity) as qty,
         sum(value)    as value,
         (array_agg(unit_price order by quantity desc nulls last, unit_price desc))[1] as price
  from sales
  group by 1, 2, 3, 4
),
zone_base as (
  select s.zone_id, s.event_id, s.zone_label,
         min(s.sale_date) as first_sale,
         max(s.sale_date) as last_sale,
         sum(s.quantity)  as sold,
         sum(s.value)     as revenue,
         sum(case when s.sale_date > current_date - 7 then s.quantity else 0 end) as qty7,
         count(distinct s.sale_date) as sale_days,
         bool_or(s.source in ('bol', 'onebox_import')) as snapshot_source,
         string_agg(distinct s.source, ',')            as sources
  from sales s
  group by 1, 2, 3
),
zone_lot as (
  select distinct on (s.zone_id) s.zone_id, l.name as lot_label
  from sales s
  left join event_ticket_lots l on l.id = s.lot_id
  order by s.zone_id, s.sale_date desc nulls last, l.name
),
cur_price as (
  select distinct on (zone_id) zone_id, price
  from day_zone
  order by zone_id, sale_date desc
),
caps as (
  select c.event_id,
         c.zone_label,
         lower(regexp_replace(btrim(c.zone_label), '\s+', ' ', 'g')) as norm,
         c.capacity, c.occupied, c.available, c.observed_on
  from event_zone_capacities c
  join (
    select event_id, max(observed_on) as mx
    from event_zone_capacities
    where capacity_kind = 'released' and event_id = any(p_event_ids)
    group by 1
  ) m on m.event_id = c.event_id and m.mx = c.observed_on
  where c.capacity_kind = 'released' and c.event_id = any(p_event_ids)
),
zone_caps as (
  select zb.zone_id, k.capacity, k.occupied, k.available, k.observed_on, k.zone_label as capacity_label
  from zone_base zb
  left join caps k
    on k.event_id = zb.event_id
   and k.norm = lower(regexp_replace(btrim(zb.zone_label), '\s+', ' ', 'g'))
),
changes as (
  select d.zone_id,
         d.sale_date as changed_on,
         d.price     as price_after,
         lag(d.price) over (partition by d.zone_id order by d.sale_date) as price_before
  from day_zone d
),
changes_rated as (
  select c.zone_id, c.changed_on, c.price_before, c.price_after,
         coalesce((select sum(s.quantity) from sales s
                    where s.zone_id = c.zone_id
                      and s.sale_date between c.changed_on - 14 and c.changed_on - 1), 0) / 14.0 as before_per_day,
         coalesce((select sum(s.quantity) from sales s
                    where s.zone_id = c.zone_id
                      and s.sale_date between c.changed_on and c.changed_on + 13), 0) / 14.0 as after_per_day
  from changes c
  where c.price_before is not null and c.price_before <> c.price_after
),
changes_json as (
  select cr.zone_id,
         jsonb_agg(jsonb_build_object(
           'changed_on',     cr.changed_on,
           'price_before',   round(cr.price_before, 2),
           'price_after',    round(cr.price_after, 2),
           'before_per_day', round(cr.before_per_day, 2),
           'after_per_day',  round(cr.after_per_day, 2),
           'pct_change', case when cr.before_per_day > 0
                              then round(((cr.after_per_day - cr.before_per_day) / cr.before_per_day) * 100, 1)
                              else null end
         ) order by cr.changed_on) as price_changes
  from changes_rated cr
  group by cr.zone_id
),
zones_json as (
  select jsonb_agg(jsonb_build_object(
           'zone_id',            zb.zone_id,
           'event_id',           zb.event_id,
           'zone_label',         zb.zone_label,
           'lot_label',          zl.lot_label,
           'first_sale_date',    zb.first_sale,
           'last_sale_date',     zb.last_sale,
           'sale_days',          zb.sale_days,
           'sold',               zb.sold,
           'revenue',            round(zb.revenue, 2),
           'current_price',      round(cp.price, 2),
           'released_capacity',  zc.capacity,
           'occupied',           zc.occupied,
           'available',          zc.available,
           'capacity_observed_on', zc.observed_on,
           'capacity_label',     zc.capacity_label,
           'unmatched_capacity', (zc.capacity is null),
           'occupancy_pct', case when zc.capacity > 0
                                 then round((coalesce(zc.occupied, 0)::numeric / zc.capacity) * 100, 1)
                                 else null end,
           'per_day_7',          round(zb.qty7 / 7.0, 2),
           'remaining',          case when zc.capacity is not null
                                      then greatest(zc.capacity - coalesce(zc.occupied, 0), 0) end,
           'days_to_sellout', case when zb.qty7 > 0 and zc.capacity is not null
                                   then ceil(greatest(zc.capacity - coalesce(zc.occupied, 0), 0) / (zb.qty7 / 7.0))
                                   else null end,
           'sellout_date', case when zb.qty7 > 0 and zc.capacity is not null
                                then current_date + (ceil(greatest(zc.capacity - coalesce(zc.occupied, 0), 0) / (zb.qty7 / 7.0)))::int
                                else null end,
           'days_to_event', case when e.event_date is not null then (e.event_date - current_date) end,
           'projected_to_event_date', case
              when zb.qty7 > 0 and e.event_date is not null and e.event_date > current_date then
                case when zc.capacity is not null
                     then least(round((zb.qty7 / 7.0) * (e.event_date - current_date)),
                                greatest(zc.capacity - coalesce(zc.occupied, 0), 0))
                     else round((zb.qty7 / 7.0) * (e.event_date - current_date)) end
              else null end,
           'snapshot_source',    zb.snapshot_source,
           'sources',            zb.sources,
           'price_changes',      coalesce(cj.price_changes, '[]'::jsonb)
         ) order by zb.zone_label) as zones
  from zone_base zb
  left join zone_lot    zl on zl.zone_id = zb.zone_id
  left join cur_price   cp on cp.zone_id = zb.zone_id
  left join zone_caps   zc on zc.zone_id = zb.zone_id
  left join changes_json cj on cj.zone_id = zb.zone_id
  left join ev e on e.id = zb.event_id
),
ts_ev as (
  select event_id, max(sale_date) as mx, sum(quantity) as qty
  from sales group by 1
),
mirror as (
  select e.id as event_id,
         case when exists (select 1 from ticketline_daily_sales t where t.event_id = e.id) then 'ticketline'
              when exists (select 1 from bol_daily_sales b where b.event_id = e.id)       then 'bol'
              else null end as mirror_name
  from ev e
),
freshness as (
  select jsonb_agg(jsonb_build_object(
           'event_id',            e.id,
           'event_name',          e.name,
           'event_date',          e.event_date,
           'zone_last_sale_date', t.mx,
           'zone_quantity',       coalesce(t.qty, 0),
           'mirror',              m.mirror_name,
           'mirror_last_sale_date', case m.mirror_name
              when 'ticketline' then (select max(sale_date) from ticketline_daily_sales x where x.event_id = e.id)
              when 'bol'        then (select max(sale_date) from bol_daily_sales x where x.event_id = e.id) end,
           'mirror_quantity', case m.mirror_name
              when 'ticketline' then (select sum(quantity) from ticketline_daily_sales x where x.event_id = e.id)
              when 'bol'        then (select sum(quantity) from bol_daily_sales x where x.event_id = e.id) end,
           'snapshot_only', coalesce((select bool_and(s.source in ('bol', 'onebox_import')) from sales s where s.event_id = e.id), false)
         ) order by e.name) as events
  from ev e
  left join ts_ev t on t.event_id = e.id
  left join mirror m on m.event_id = e.id
)
select jsonb_build_object(
  'generated_at', now(),
  'today',        current_date,
  'events',       coalesce((select events from freshness), '[]'::jsonb),
  'zones',        coalesce((select zones from zones_json), '[]'::jsonb)
);
$fn$;

comment on function public.get_zone_price_dynamics(uuid[]) is
  '#214 — dinamica de lotes e precos por zona. Uma linha jsonb (nunca setof: barreira dos 1.000, #205/#206). Lotacao so de event_zone_capacities released (#198), join por texto normalizado com unmatched_capacity. Inclui guarda de frescura ticket_sales vs espelho.';

revoke all on function public.get_zone_price_dynamics(uuid[]) from public;
revoke all on function public.get_zone_price_dynamics(uuid[]) from anon;
grant execute on function public.get_zone_price_dynamics(uuid[]) to authenticated;

create or replace function public.get_zone_daily_series(p_event_ids uuid[], p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
with sales as (
  select ts.zone_id, z.name as zone_label, ts.sale_date,
         coalesce(ts.quantity, 0)::numeric as quantity,
         coalesce(ts.total_value, coalesce(ts.quantity, 0) * coalesce(ts.unit_price, 0))::numeric as value,
         ts.unit_price::numeric as unit_price
  from ticket_sales ts
  join event_ticket_zones z on z.id = ts.zone_id
  where z.event_id = any(p_event_ids)
    and (p_from is null or ts.sale_date >= p_from)
    and (p_to   is null or ts.sale_date <= p_to)
),
days as (
  select zone_id, zone_label, sale_date,
         sum(quantity) as quantity,
         sum(value)    as value,
         (array_agg(unit_price order by quantity desc nulls last, unit_price desc))[1] as unit_price
  from sales
  group by 1, 2, 3
),
zones as (
  select d.zone_id, d.zone_label,
         jsonb_agg(jsonb_build_object(
           'sale_date',  d.sale_date,
           'quantity',   d.quantity,
           'value',      round(d.value, 2),
           'unit_price', round(d.unit_price, 2)
         ) order by d.sale_date) as dias
  from days d
  group by 1, 2
)
select jsonb_build_object(
  'from',  p_from,
  'to',    p_to,
  'zones', coalesce((
    select jsonb_agg(jsonb_build_object('zone_id', z.zone_id, 'zone_label', z.zone_label, 'dias', z.dias)
                     order by z.zone_label)
    from zones z), '[]'::jsonb)
);
$fn$;

comment on function public.get_zone_daily_series(uuid[], date, date) is
  '#214 — serie diaria por zona (quantidade, valor e preco do dia). Uma linha jsonb, nunca setof.';

revoke all on function public.get_zone_daily_series(uuid[], date, date) from public;
revoke all on function public.get_zone_daily_series(uuid[], date, date) from anon;
grant execute on function public.get_zone_daily_series(uuid[], date, date) to authenticated;