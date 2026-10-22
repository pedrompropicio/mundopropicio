-- LOCAL/INERTE 2n-Bloco5 rollback: restores the offset_balance body of issue335_balance_invariant_count exactly.
-- Ordem de instalação única (correcção D, docs/testes/issue335-quadro-final.md): storage → core → approval → status → invariants → balance → cash_position → cash_position_invariant → restore → kill_switch/emergency/reactivation → trigger_watch/cash_watch; ROLLBACK na ordem inversa.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.issue335_balance_invariant_count() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 WITH managed AS(SELECT DISTINCT i.transaction_id FROM transaction_offset_items i JOIN transaction_offset_groups g ON g.id=i.group_id WHERE g.status IN('preparing','applied','reversing') AND EXISTS(SELECT 1 FROM transaction_payments p WHERE p.offset_item_id=i.id AND p.status='paid' AND p.reversed_at IS NULL)),
 accounts AS(SELECT DISTINCT p.account_id FROM transaction_payments p JOIN managed m ON m.transaction_id=p.transaction_id WHERE p.account_id IS NOT NULL),
 expected AS(SELECT a.id,a.initial_balance+coalesce((SELECT sum(CASE WHEN t.type='income' THEN t.paid_amount ELSE -t.paid_amount END) FROM transactions t WHERE t.account_id=a.id AND NOT EXISTS(SELECT 1 FROM managed m WHERE m.transaction_id=t.id) AND (a.initial_balance_date IS NULL OR coalesce(t.payment_date,t.date) IS NULL OR coalesce(t.payment_date,t.date)>a.initial_balance_date)),0)+coalesce((SELECT sum(CASE WHEN t.type='income' THEN p.amount ELSE -p.amount END) FROM transaction_payments p JOIN transactions t ON t.id=p.transaction_id JOIN managed m ON m.transaction_id=t.id WHERE p.account_id=a.id AND p.payment_method<>'compensation' AND p.status='paid' AND p.reversed_at IS NULL AND (a.initial_balance_date IS NULL OR p.payment_date IS NULL OR p.payment_date>a.initial_balance_date)),0)+coalesce((SELECT sum(p.withholding_amount+p.credit_amount) FROM transaction_payments p WHERE p.account_id=a.id AND p.status='paid' AND p.reversed_at IS NULL AND (a.initial_balance_date IS NULL OR p.payment_date IS NULL OR p.payment_date>a.initial_balance_date)),0) total FROM financial_accounts a JOIN accounts x ON x.account_id=a.id)
 SELECT count(*) FROM expected WHERE total IS DISTINCT FROM public._account_true_balance_raw(id)
$$;
UPDATE public.system_invariants SET description='Saldo canónico versus dinheiro das pernas geridas' WHERE name='encontro_saldo_dinheiro_divergente';
DROP FUNCTION public.issue335_cash_watch();
COMMIT;
