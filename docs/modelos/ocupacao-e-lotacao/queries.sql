-- Modelo: ocupacao-e-lotacao
-- Blocos curtos e separados, prontos a copiar. Só leitura.
-- Parâmetros: {{event_id}}
-- Colunas de event_zone_capacities verificadas em Live a 23/10/2026:
--   event_id, zone_label, capacity, available, blocked, occupied,
--   capacity_kind, source, observed_on, is_premium

-- 1) Qual é a observação mais recente do evento. Tudo o resto sai desta data.
select max(observed_on) as ultima_observacao,
       count(distinct observed_on) as n_observacoes
from public.event_zone_capacities
where event_id = '{{event_id}}';


-- 2) Os números da sala, SEMPRE da última observação.
--    Nunca "a última linha de cada zona": isso traz zonas que mudaram de nome e duplica a sala.
with ult as (
  select max(observed_on) as d
  from public.event_zone_capacities
  where event_id = '{{event_id}}'
)
select ult.d                              as observacao,
       count(*)                           as zonas,
       sum(z.capacity)                    as carga_total,
       sum(z.occupied)                    as ocupado,
       sum(z.blocked)                     as bloqueado,
       sum(z.available)                   as por_vender,
       round(100.0 * sum(z.occupied) / nullif(sum(z.capacity) - sum(z.blocked), 0), 1)
                                          as ocupacao_pct_sobre_libertado
from public.event_zone_capacities z, ult
where z.event_id = '{{event_id}}'
  and z.observed_on = ult.d
group by ult.d;


-- 3) Por zona, na mesma observação.
with ult as (
  select max(observed_on) as d
  from public.event_zone_capacities
  where event_id = '{{event_id}}'
)
select z.zone_label, z.capacity, z.occupied, z.blocked, z.available,
       z.capacity_kind, z.is_premium, z.source
from public.event_zone_capacities z, ult
where z.event_id = '{{event_id}}'
  and z.observed_on = ult.d
order by z.capacity desc, z.zone_label;


-- 4) DETECTOR de zonas fantasma: zonas que existiram noutra observação
--    e JÁ NÃO aparecem na mais recente. São as que inflacionam a carga se
--    alguma leitura usar "a última linha de cada zona".
with ult as (
  select max(observed_on) as d
  from public.event_zone_capacities
  where event_id = '{{event_id}}'
),
atuais as (
  select z.zone_label
  from public.event_zone_capacities z, ult
  where z.event_id = '{{event_id}}' and z.observed_on = ult.d
)
select z.observed_on,
       z.zone_label,
       z.capacity,
       z.occupied
from public.event_zone_capacities z
where z.event_id = '{{event_id}}'
  and z.zone_label not in (select zone_label from atuais)
order by z.observed_on desc, z.capacity desc;


-- 5) Quanto é que as fantasmas somam — o número que entra no relatório.
with ult as (
  select max(observed_on) as d
  from public.event_zone_capacities
  where event_id = '{{event_id}}'
),
atuais as (
  select z.zone_label
  from public.event_zone_capacities z, ult
  where z.event_id = '{{event_id}}' and z.observed_on = ult.d
),
fantasmas as (
  select distinct on (z.zone_label) z.zone_label, z.capacity
  from public.event_zone_capacities z
  where z.event_id = '{{event_id}}'
    and z.zone_label not in (select zone_label from atuais)
  order by z.zone_label, z.observed_on desc
)
select count(*) as zonas_fantasma, coalesce(sum(capacity), 0) as lugares_a_mais
from fantasmas;


-- 6) Evolução da carga por observação — para explicar um salto na percentagem.
--    Uma ocupação que sobe sem venda nenhuma é mudança de carga, não é sucesso.
select observed_on,
       count(*)        as zonas,
       sum(capacity)   as carga,
       sum(occupied)   as ocupado
from public.event_zone_capacities
where event_id = '{{event_id}}'
group by observed_on
order by observed_on desc;
