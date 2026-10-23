-- Modelo: bilheteira-por-apuramento
-- Blocos curtos e separados, prontos a copiar. Só leitura.
-- Parâmetros: {{company_id}}, {{ticket_office_account_id}}
-- Objetos verificados em Live a 23/10/2026.

-- 1) As contas de bilheteira da empresa. Daqui sai o {{ticket_office_account_id}}.
select id, name, type, is_accounting, is_active
from public.financial_accounts
where company_id = '{{company_id}}'
  and type = 'ticket_office'
order by name;


-- 2) Posição da conta, pela fonte canónica.
--    NUNCA somar ticket_sales no cliente: o PostgREST corta aos 1.000 em silêncio (#129, #206).
select public._ticket_office_balance_raw('{{ticket_office_account_id}}') as posicao_raw;


-- 3) Vendas por evento nesta bilheteira, pela RPC canónica.
--    É a primeira perna da conta: vendas dos eventos ainda sem apuramento.
select *
from public.get_ticket_office_sales('{{ticket_office_account_id}}');


-- 4) O outro caminho: despesas e transferências lançadas na conta da bilheteira.
--    vendas totais − despesas − transferências tem de dar o mesmo que o bloco 2.
select t.type,
       count(*)                                   as n,
       sum(coalesce(t.paid_amount, t.amount))     as total
from public.transactions t
where t.account_id = '{{ticket_office_account_id}}'
  and (t.status = 'paid' or coalesce(t.paid_amount, 0) > 0)
group by t.type
order by t.type;


-- 5) Apuramentos já registados nesta bilheteira, do mais recente para trás.
--    O saldo que transita é o net_adjusted (ou net_calculated) do último.
select s.id,
       s.event_id,
       s.settlement_date,
       s.gross_revenue,
       s.total_deductions,
       s.net_calculated,
       s.net_adjusted,
       s.net_transferred,
       s.status,
       s.closed_at
from public.ticket_office_settlements s
where s.financial_account_id = '{{ticket_office_account_id}}'
order by s.settlement_date desc nulls last, s.created_at desc;


-- 6) Adiantamentos (repasses) ainda não ligados a nenhum apuramento.
--    Se o apuramento do fornecedor lista N e aqui aparecem N-1, falta ligar um:
--    verificar ANTES de abrir o wizard de fecho.
select a.event_id,
       count(*)              as n_adiantamentos,
       sum(a.amount)         as total,
       min(a.advance_date)   as primeiro,
       max(a.advance_date)   as ultimo
from public.event_ticket_office_advances a
where a.financial_account_id = '{{ticket_office_account_id}}'
  and a.settlement_id is null
group by a.event_id
order by total desc;


-- 7) Conferência das despesas da bilheteira por evento (faturas da própria bilheteira).
--    A soma destas linhas é a parcela "despesas" do bloco 4.
select t.event_id,
       count(*)                               as n,
       sum(coalesce(t.paid_amount, t.amount)) as total
from public.transactions t
where t.account_id = '{{ticket_office_account_id}}'
  and t.type = 'expense'
  and (t.status = 'paid' or coalesce(t.paid_amount, 0) > 0)
group by t.event_id
order by total desc;
