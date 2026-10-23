-- Modelo: conciliacao-cartoes
-- Blocos curtos e separados, prontos a copiar. Só leitura.
-- Parâmetros: {{company_id}}, {{card_account_id}}, {{period_from}}, {{period_to}}
-- Objetos e colunas verificados em Live a 23/10/2026.

-- 1) Os cartões pré-pagos da empresa. Daqui sai o {{card_account_id}}.
select id, name, type, is_accounting, is_active, initial_balance
from public.financial_accounts
where company_id = '{{company_id}}'
  and type = 'prepaid_card'
order by name;


-- 2) Sessões do cartão, da mais recente para trás.
--    opening_balance NULL = abertura calculada na leitura (não é zero).
select s.id,
       s.holder_name,
       s.status,
       s.opening_balance,
       s.opened_at,
       s.closed_at,
       s.closing_balance_confirmed,
       s.integrated_at
from public.card_sessions s
where s.card_account_id = '{{card_account_id}}'
order by s.opened_at desc;


-- 3) Itens da sessão por estado. 'approved' sem transaction_id = por integrar;
--    'submitted' bloqueia o fecho.
select i.status,
       count(*)                                        as n,
       count(*) filter (where i.transaction_id is null) as sem_transacao,
       sum(i.amount)                                    as base_sem_iva
from public.card_session_items i
where i.session_id = '{{session_id}}'
group by i.status
order by i.status;


-- 4) Cargas da sessão e se já têm crédito no cartão.
--    in_transaction_id NULL com a saída paga = invariante carga_sem_credito.
select l.id,
       l.load_date,
       l.amount,
       l.source_account_id,
       l.out_transaction_id,
       l.in_transaction_id
from public.card_session_loads l
where l.session_id = '{{session_id}}'
order by l.load_date;


-- 5) O lado do SISTEMA: movimentos lançados no cartão no período.
select t.type,
       count(*)                                   as n,
       sum(coalesce(t.paid_amount, t.amount))     as total
from public.transactions t
where t.account_id = '{{card_account_id}}'
  and (t.status = 'paid' or coalesce(t.paid_amount, 0) > 0)
  and coalesce(t.payment_date, t.date) between '{{period_from}}' and '{{period_to}}'
group by t.type
order by t.type;


-- 6) O lado do BANCO: linhas do extrato do cartão no mesmo período.
select case when l.amount < 0 then 'debito' else 'credito' end as lado,
       count(*)        as n,
       sum(l.amount)   as total
from public.bank_statement_lines l
where l.financial_account_id = '{{card_account_id}}'
  and l.booking_date between '{{period_from}}' and '{{period_to}}'
group by 1
order by 1;


-- 7) Linha a linha dos dois lados, para encontrar os achados.
--    Banco:
select l.booking_date, l.description, l.amount, l.balance_after, l.status
from public.bank_statement_lines l
where l.financial_account_id = '{{card_account_id}}'
  and l.booking_date between '{{period_from}}' and '{{period_to}}'
order by l.booking_date, l.id;


-- 8) Sistema, linha a linha, para cruzar com o bloco 7.
select coalesce(t.payment_date, t.date) as data,
       t.description,
       t.type,
       coalesce(t.paid_amount, t.amount) as valor,
       t.card_session_id,
       t.id
from public.transactions t
where t.account_id = '{{card_account_id}}'
  and (t.status = 'paid' or coalesce(t.paid_amount, 0) > 0)
  and coalesce(t.payment_date, t.date) between '{{period_from}}' and '{{period_to}}'
order by 1, t.id;


-- 9) Candidatos a duplicado no cartão: mesmo fornecedor, mesmo valor, poucos dias de distância.
--    Foi assim que apareceu uma despesa aprovada que nunca saiu do cartão.
select a.id, b.id as id_irmao, a.description, a.supplier_id,
       coalesce(a.paid_amount, a.amount) as valor,
       coalesce(a.payment_date, a.date)  as data_a,
       coalesce(b.payment_date, b.date)  as data_b
from public.transactions a
join public.transactions b
  on b.account_id = a.account_id
 and b.id <> a.id
 and coalesce(b.paid_amount, b.amount) = coalesce(a.paid_amount, a.amount)
 and coalesce(b.supplier_id, '00000000-0000-0000-0000-000000000000')
   = coalesce(a.supplier_id, '00000000-0000-0000-0000-000000000000')
 and abs(coalesce(b.payment_date, b.date) - coalesce(a.payment_date, a.date)) <= 7
where a.account_id = '{{card_account_id}}'
  and a.id < b.id
order by valor desc;
