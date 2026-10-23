-- Modelo: dre-gerencial
-- Blocos curtos e separados, prontos a copiar. Só leitura.
-- Parâmetros: {{company_id}}, {{period_from}}, {{period_to}}
-- Colunas de account_categories verificadas em Live a 23/10/2026:
--   id, code, name, type, parent_id, is_active, event_required, company_id,
--   allocate_to_active_event, ebitda_class

-- 1) Receita por rubrica no período (sem a bilheteira, que vem de ticket_sales).
select c.code, c.name,
       count(*)                as n,
       round(sum(t.amount), 2) as s_iva
from public.transactions t
join public.account_categories c on c.id = t.category_id
where t.company_id = '{{company_id}}'
  and t.type = 'income'
  and t.status in ('approved', 'paid')
  and coalesce(t.is_transitory, false) = false
  and coalesce(t.exclude_from_result, false) = false
  and t.reversed_at is null
  and coalesce(t.is_hidden, false) = false
  and coalesce(t.payment_date, t.date) between '{{period_from}}' and '{{period_to}}'
group by c.code, c.name
order by s_iva desc;


-- 2) Custos corporativos por grupo 10.x — a espinha da secção 4.
select left(c.code, 4)         as grupo,
       min(c.name)             as exemplo,
       count(*)                as n,
       round(sum(t.amount), 2) as s_iva
from public.transactions t
join public.account_categories c on c.id = t.category_id
where t.company_id = '{{company_id}}'
  and c.code like '10.%'
  and t.status in ('approved', 'paid')
  and coalesce(t.is_transitory, false) = false
  and coalesce(t.exclude_from_result, false) = false
  and t.reversed_at is null
  and coalesce(t.is_hidden, false) = false
  and coalesce(t.payment_date, t.date) between '{{period_from}}' and '{{period_to}}'
group by 1
order by 1;


-- 3) Custo de evento pelo BP aprovado (fonte por omissão, não as transações).
select e.id, e.name,
       count(*)                                        as linhas,
       round(sum(f.amount), 2)                         as s_iva,
       round(sum(f.amount * coalesce(f.iva_rate,0) / 100.0), 2) as iva
from public.event_forecasts f
join public.events e on e.id = f.event_id
where e.company_id = '{{company_id}}'
  and f.version_id is null
  and f.type = 'expense'
  and f.status = 'approved'
group by e.id, e.name
order by s_iva desc;


-- 4) O que ficou de fora por decisão: contas gerenciais (is_accounting = false)
--    e transações marcadas exclude_from_result.
select fa.name                                     as conta,
       fa.is_accounting,
       count(*) filter (where coalesce(t.exclude_from_result,false)) as excluidas,
       count(*)                                    as n,
       round(sum(t.amount), 2)                     as total
from public.transactions t
join public.financial_accounts fa on fa.id = t.account_id
where t.company_id = '{{company_id}}'
  and (fa.is_accounting = false or coalesce(t.exclude_from_result, false) = true)
  and coalesce(t.payment_date, t.date) between '{{period_from}}' and '{{period_to}}'
group by fa.name, fa.is_accounting
order by total desc;


-- 5) DETECTOR: transações cuja natureza não bate com a da rubrica.
--    Estas caem fora de TODAS as secções da DRE, em silêncio.
--    O relatório traz sempre este resultado, mesmo quando é zero.
select c.code,
       c.name,
       c.type                  as tipo_da_rubrica,
       t.type                  as tipo_da_transacao,
       count(*)                as n,
       round(sum(t.amount), 2) as total
from public.transactions t
join public.account_categories c on c.id = t.category_id
where t.company_id = '{{company_id}}'
  and t.status in ('approved', 'paid')
  and t.type <> c.type
  and coalesce(t.payment_date, t.date) between '{{period_from}}' and '{{period_to}}'
group by c.code, c.name, c.type, t.type
order by total desc;


-- 6) Conta corrente de sócio: o que entrou e o que saiu, para decompor.
--    O modelo é separar transferências em salários, ajudas de custo e facturas avulsas,
--    ficando o que sobra como distribuição de resultado ou adiantamento.
select t.type,
       c.code,
       c.name,
       count(*)                                    as n,
       round(sum(coalesce(t.paid_amount, t.amount)), 2) as total
from public.transactions t
join public.financial_accounts fa on fa.id = t.account_id
left join public.account_categories c on c.id = t.category_id
where fa.id = '{{conta_corrente_socio_id}}'
  and (t.status = 'paid' or coalesce(t.paid_amount, 0) > 0)
group by t.type, c.code, c.name
order by total desc;


-- 7) Trava de segurança para qualquer reclassificação entre rubricas 10.x:
--    correr ANTES e DEPOIS. O total tem de ser idêntico.
select round(sum(t.amount), 2) as total_custos_corporativos
from public.transactions t
join public.account_categories c on c.id = t.category_id
where t.company_id = '{{company_id}}'
  and c.code like '10.%'
  and t.type = 'expense'
  and t.status in ('approved', 'paid')
  and coalesce(t.is_transitory, false) = false
  and coalesce(t.exclude_from_result, false) = false
  and t.reversed_at is null;
