-- Modelo: acerto-com-socios (nível 2, planilha)
-- Só os blocos DADOS DO ERP mudam entre gerações. Ficheiros de operadores não vêm daqui.
-- Parâmetros: {{event_id}}
-- Só leitura. Todas atacam Live.

-- 1) Os sócios do evento e o que cada um pode fazer.
--    can_pay = false → quem paga é a MP, transação é esperada.
--    can_pay = true  → o sócio paga do bolso dele; a ausência de transação é legítima
--                      e gera crédito a devolver-lhe.
select s.name as socio,
       p.percentage,
       p.loss_percentage,
       p.can_order,
       p.can_pay,
       p.expense_includes_iva
from public.event_partners p
left join public.suppliers s on s.id = p.supplier_id
where p.event_id = '{{event_id}}'
order by p.percentage desc;


-- 2) Despesa do BP por pagador — o bloco que alimenta a planilha.
--    O overhead ENTRA como despesa normal (por isso o OR com is_overhead).
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


-- 3) O mesmo, por grupo de rubrica — é o bloco B do anexo.
select left(c.code, 3)                                                    as grupo,
       case when f.paying_partner_id is null then 'MP' else 'SOCIO' end   as pagador,
       count(*)                                                           as linhas,
       round(sum(f.amount), 2)                                            as s_iva,
       round(sum(round(f.amount * coalesce(f.iva_rate, 0) / 100.0, 2)), 2) as iva
from public.event_forecasts f
join public.account_categories c on c.id = f.category_id
where f.event_id = '{{event_id}}'
  and f.version_id is null
  and f.status = 'approved'
  and f.type = 'expense'
  and coalesce(f.is_transitory, false) = false
  and (coalesce(f.exclude_from_result, false) = false or coalesce(f.is_overhead, false) = true)
group by 1, 2
order by 1, 2;


-- 4) Linhas de overhead — cada uma é uma decisão, não um total.
select f.id, f.description, f.amount, f.iva_rate, f.paying_partner_id
from public.event_forecasts f
where f.event_id = '{{event_id}}'
  and f.version_id is null
  and coalesce(f.is_overhead, false) = true
order by f.amount desc;


-- 5) Linhas com mais de duas casas decimais. Tem de devolver zero.
select f.id, f.description, f.amount
from public.event_forecasts f
where f.event_id = '{{event_id}}'
  and f.version_id is null
  and f.amount <> round(f.amount, 2);


-- 6) Receita lançada dentro do BP de despesa — a armadilha do filtro de tipo.
--    Sem filtrar type='expense', uma linha de receita cai no balde de despesa de um sócio.
select f.id, f.description, f.type, f.amount, f.paying_partner_id
from public.event_forecasts f
where f.event_id = '{{event_id}}'
  and f.version_id is null
  and f.type <> 'expense';


-- 7) Quem pagou de facto, pelas transações (cruza com o bloco 2).
select coalesce(sp.name, 'MP')    as pagador,
       count(*)                   as tx,
       round(sum(t.amount), 2)    as valor
from public.transactions t
left join public.event_partners epp on epp.id = t.paying_partner_id
left join public.suppliers sp on sp.id = epp.supplier_id
where t.event_id = '{{event_id}}'
  and t.type = 'expense'
  and t.status in ('approved', 'paid')
  and coalesce(t.is_transitory, false) = false
  and coalesce(t.exclude_from_result, false) = false
  and t.reversed_at is null
  and coalesce(t.is_hidden, false) = false
group by 1
order by 3 desc;
