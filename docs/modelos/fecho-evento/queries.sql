-- Modelo: fecho-evento (o documento)
-- A conferência corre antes, pelo docs/procedimentos/PROC-fecho-evento.md.
-- Estas queries alimentam o DOCUMENTO: são as que produzem os totais que ele mostra.
-- Parâmetros: {{event_id}}
-- Só leitura. Todas atacam Live.

-- 1) Bloqueios antes de qualquer coisa. Se houver `hard`, o documento não se gera.
select public.event_close_blockers('{{event_id}}');


-- 2) Receita da bilheteira. Liga por zone_id — ticket_sales NÃO tem event_id.
select count(*)                              as n,
       sum(ts.quantity)                      as bilhetes,
       round(sum(ts.total_value), 2)         as c_iva,
       round(sum(ts.total_value) / 1.06, 2)  as s_iva
from public.ticket_sales ts
join public.event_ticket_zones z on z.id = ts.zone_id
where z.event_id = '{{event_id}}';


-- 3) Restantes receitas, por rubrica.
select c.code, c.name, t.status, count(*) as n, round(sum(t.amount), 2) as valor
from public.transactions t
left join public.account_categories c on c.id = t.category_id
where t.event_id = '{{event_id}}'
  and t.type = 'income'
group by c.code, c.name, t.status
order by c.code;


-- 4) Despesas do BP aprovado: s/IVA, IVA e c/IVA.
--    O c/IVA é o valor que entra na repartição.
select count(*)                                             as linhas,
       round(sum(amount), 2)                                as s_iva,
       round(sum(amount * iva_rate / 100.0), 2)             as iva,
       round(sum(amount * (1 + iva_rate / 100.0)), 2)       as c_iva
from public.event_forecasts
where event_id = '{{event_id}}'
  and version_id is null
  and type = 'expense'
  and status = 'approved';


-- 5) Despesa por quem paga — a base do anexo e do acerto.
--    Mesmo filtro do documento: não transitória, e o overhead entra.
select case when f.paying_partner_id is null then 'MP' else 'SOCIO' end as pagador,
       count(*)                                                          as linhas,
       round(sum(f.amount), 2)                                           as s_iva,
       round(sum(round(f.amount * coalesce(f.iva_rate, 0) / 100.0, 2)), 2) as iva
from public.event_forecasts f
where f.event_id = '{{event_id}}'
  and f.version_id is null
  and f.status = 'approved'
  and f.type = 'expense'
  and coalesce(f.is_transitory, false) = false
  and (coalesce(f.exclude_from_result, false) = false or coalesce(f.is_overhead, false) = true)
group by 1;


-- 6) Linhas com mais de duas casas decimais. Tem de devolver zero linhas.
--    Um milésimo faz a quota de um sócio arredondar para lados diferentes em dois documentos.
select f.id, f.description, f.amount
from public.event_forecasts f
where f.event_id = '{{event_id}}'
  and f.version_id is null
  and f.amount <> round(f.amount, 2);


-- 7) IVA em taxas públicas. Zero linhas = limpo.
select c.code, f.description, f.amount, f.iva_rate
from public.event_forecasts f
join public.account_categories c on c.id = f.category_id
where f.event_id = '{{event_id}}'
  and f.version_id is null
  and f.iva_rate <> 0
  and (f.description ilike '%psp%' or f.description ilike '%polic%'
    or f.description ilike '%bombeir%' or f.description ilike '%licenc%'
    or f.description ilike '%marinha%' or f.description ilike '%camara%'
    or f.description ilike '%taxa%');


-- 8) Movimento desde a data da última geração do documento.
--    Se houve movimento, regerar antes de mostrar a alguém.
select date_trunc('day', created_at)::date as dia,
       count(*)                            as tx,
       round(sum(amount), 2)               as valor
from public.transactions
where event_id = '{{event_id}}'
  and type = 'expense'
  and created_at >= '{{desde}}'
group by 1
order by 1;
