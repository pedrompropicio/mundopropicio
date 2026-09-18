-- Prova de que paid_amount / status / payment_date derivam de transaction_payments (#91, D-ERP86).
-- Corre dentro de BEGIN … ROLLBACK: não deixa nada na base.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"d8e502f7-9ceb-4dae-bd73-7291832d0d6f","role":"authenticated"}', true);

-- Transação aprovada real, sem linhas de pagamento e sem isenção.
CREATE TEMP TABLE _alvo ON COMMIT DROP AS
SELECT t.id, t.amount, t.iva_rate,
       round((t.amount * (1 + coalesce(t.iva_rate, 0) / 100.0))::numeric, 2) AS gross
FROM public.transactions t
WHERE t.status = 'approved'
  AND coalesce(t.paid_amount, 0) = 0
  AND t.amount > 0
  AND coalesce(t.currency, 'EUR') = 'EUR'
  AND t.parent_transaction_id IS NULL
  AND coalesce(t.is_reimbursement, false) = false
  AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses e WHERE e.transaction_id = t.id)
LIMIT 1;

-- (i) linha pelo bruto → paid_amount = bruto, status = paid
INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, status, created_by)
SELECT id, gross, CURRENT_DATE, 'paid', 'teste' FROM _alvo;

SELECT 'i' AS caso, t.paid_amount, t.status, t.payment_date, a.gross
FROM public.transactions t JOIN _alvo a ON a.id = t.id;

-- (ii) apagar a linha → paid_amount = 0, status = approved, payment_date NULL
DELETE FROM public.transaction_payments
WHERE transaction_id = (SELECT id FROM _alvo) AND created_by = 'teste';

SELECT 'ii' AS caso, t.paid_amount, t.status, t.payment_date
FROM public.transactions t JOIN _alvo a ON a.id = t.id;

-- (iii) linha parcial → paid_amount = parcial, status = approved
INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, status, created_by)
SELECT id, round(gross / 3, 2), CURRENT_DATE, 'paid', 'teste' FROM _alvo;

SELECT 'iii' AS caso, t.paid_amount, t.status, t.payment_date, round(a.gross / 3, 2) AS esperado
FROM public.transactions t JOIN _alvo a ON a.id = t.id;

-- (iv) filha de rateio: inserir e apagar linha não altera a transação
CREATE TEMP TABLE _filha ON COMMIT DROP AS
SELECT t.id, t.paid_amount, t.status, t.payment_date,
       round((t.amount * (1 + coalesce(t.iva_rate, 0) / 100.0))::numeric, 2) AS gross
FROM public.transactions t
WHERE t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL
LIMIT 1;

INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, status, created_by)
SELECT id, gross, CURRENT_DATE, 'paid', 'teste' FROM _filha;

SELECT 'iv-depois-insert' AS caso,
       t.paid_amount = f.paid_amount AND t.status = f.status
       AND coalesce(t.payment_date, '1900-01-01') = coalesce(f.payment_date, '1900-01-01') AS inalterada
FROM public.transactions t JOIN _filha f ON f.id = t.id;

DELETE FROM public.transaction_payments
WHERE transaction_id = (SELECT id FROM _filha) AND created_by = 'teste';

SELECT 'iv-depois-delete' AS caso,
       t.paid_amount = f.paid_amount AND t.status = f.status
       AND coalesce(t.payment_date, '1900-01-01') = coalesce(f.payment_date, '1900-01-01') AS inalterada
FROM public.transactions t JOIN _filha f ON f.id = t.id;

ROLLBACK;
