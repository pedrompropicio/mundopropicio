-- Modelo: conciliacao-bancaria
-- Blocos curtos e separados, prontos a copiar. Só leitura.
-- Parâmetros: {{company_id}}, {{account_id}}, {{statement_id}}, {{period_from}}, {{period_to}}
-- Colunas verificadas em Live a 23/10/2026.

-- 1) Os extratos importados nesta conta.
select s.id, s.file_name, s.period_from, s.period_to,
       s.opening_balance, s.closing_balance, s.n_lines, s.status, s.imported_at
from public.bank_statements s
where s.financial_account_id = '{{account_id}}'
order by s.period_from desc;


-- 2) Estado das linhas do extrato: quantas pré-corte, conciliadas e por explicar.
select l.status, count(*) as n, round(sum(l.amount), 2) as total
from public.bank_statement_lines l
where l.statement_id = '{{statement_id}}'
group by l.status
order by n desc;


-- 3) As linhas por explicar, da maior para a menor.
select l.booking_date, l.description, l.amount, l.balance_after, l.id
from public.bank_statement_lines l
where l.statement_id = '{{statement_id}}'
  and l.status not in ('matched', 'ignored', 'pre_cutoff')
order by abs(l.amount) desc;


-- 4) O lado inverso: transações pagas na conta que não têm linha do banco a explicá-las.
--    É a classe de erro dos pagamentos em numerário lançados no banco.
select t.id,
       coalesce(t.payment_date, t.date)  as data,
       t.description,
       coalesce(t.paid_amount, t.amount) as valor
from public.transactions t
where t.account_id = '{{account_id}}'
  and (t.status = 'paid' or coalesce(t.paid_amount, 0) > 0)
  and coalesce(t.payment_date, t.date) between '{{period_from}}' and '{{period_to}}'
  and not exists (
        select 1 from public.bank_line_transactions bt
         where bt.transaction_id = t.id)
  and not exists (
        select 1 from public.bank_statement_lines l
         where l.matched_transaction_id = t.id
            or l.created_transaction_id = t.id)
order by valor desc;


-- 5) Ponte N:1 — linhas do banco ligadas a mais de uma transação.
--    A soma dos paid_amount tem de bater com abs(amount) da linha a ±0,01.
--    Não existe conciliação parcial: uma diferença aqui é defeito, não é estado.
select l.id as line_id,
       l.booking_date,
       l.description,
       abs(l.amount)                                     as valor_da_linha,
       count(bt.transaction_id)                          as n_transacoes,
       round(sum(coalesce(t.paid_amount, t.amount)), 2)  as soma_das_transacoes,
       round(abs(l.amount) - sum(coalesce(t.paid_amount, t.amount)), 2) as diferenca
from public.bank_statement_lines l
join public.bank_line_transactions bt on bt.line_id = l.id
join public.transactions t on t.id = bt.transaction_id
where l.financial_account_id = '{{account_id}}'
group by l.id, l.booking_date, l.description, l.amount
having count(bt.transaction_id) > 1
   and abs(abs(l.amount) - sum(coalesce(t.paid_amount, t.amount))) > 0.01
order by abs(diferenca) desc;


-- 6) Saldo do sistema na conta até à data, para confrontar com o balance_after do banco.
select round(
         coalesce(fa.initial_balance, 0)
         + coalesce(sum(case when t.type = 'income'  then coalesce(t.paid_amount, t.amount) end), 0)
         - coalesce(sum(case when t.type = 'expense' then coalesce(t.paid_amount, t.amount) end), 0)
       , 2) as saldo_do_sistema
from public.financial_accounts fa
left join public.transactions t
       on t.account_id = fa.id
      and (t.status = 'paid' or coalesce(t.paid_amount, 0) > 0)
      and coalesce(t.payment_date, t.date) <= '{{period_to}}'
where fa.id = '{{account_id}}'
group by fa.initial_balance;


-- 7) O saldo que o banco declara: balance_after da última linha do período.
select l.booking_date, l.description, l.amount, l.balance_after
from public.bank_statement_lines l
where l.financial_account_id = '{{account_id}}'
  and l.booking_date <= '{{period_to}}'
order by l.booking_date desc, l.id desc
limit 5;


-- 8) Documentos anexados a linhas do banco e as suas réplicas na transação.
--    A réplica é o que faz o documento chegar à contabilidade; sem ela é invisível.
select d.id, d.name, d.file_url, d.doc_type, d.uploaded_at, d.line_id
from public.bank_line_documents d
join public.bank_statement_lines l on l.id = d.line_id
where l.financial_account_id = '{{account_id}}'
order by d.uploaded_at desc;
