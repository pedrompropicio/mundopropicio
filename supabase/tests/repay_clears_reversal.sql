-- #101 — pagar → estornar → repagar na mesma transação deixa reversed_at NULL.
-- Corre dentro de BEGIN … ROLLBACK (sessão privilegiada; estorno simulado por UPDATE,
-- como faz reverse_transaction ao nível da transação).
BEGIN;
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT t.id, round(t.amount * (1 + coalesce(t.iva_rate, 0) / 100.0), 2) AS gross, t.account_id, t.company_id
  FROM public.transactions t
 WHERE t.type = 'expense' AND t.status = 'paid' AND t.reversed_at IS NULL AND t.account_id IS NOT NULL
   AND t.parent_transaction_id IS NULL AND NOT coalesce(t.is_reimbursement, false)
   AND EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = t.id AND p.status = 'paid')
   AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
 LIMIT 1;

-- estorno: pagamento sai, transação carimbada
UPDATE public.transaction_payments SET status = 'reversed', reversed_at = now(), reversal_kind = 'cash_refund'
 WHERE transaction_id = (SELECT id FROM _t) AND status = 'paid';
UPDATE public.transactions SET reversed_at = now(), reversal_reason = 'teste #101' WHERE id = (SELECT id FROM _t);
SELECT 'estornada' AS passo, status, reversed_at IS NOT NULL AS carimbo FROM public.transactions WHERE id = (SELECT id FROM _t);

-- repagamento na mesma transação
INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, account_id, payment_method, created_by, company_id)
SELECT id, gross, current_date, account_id, 'transfer', 'teste #101', company_id FROM _t;

SELECT 'repaga' AS passo, t.status, t.reversed_at IS NULL AS carimbo_limpo,
       (t.status IN ('paid', 'approved') AND t.reversed_at IS NULL) AS conta_no_fecho,
       (SELECT count(*) FROM public.transaction_audit_log a WHERE a.transaction_id = t.id AND a.field_name = 'reversed_at' AND a.new_value LIKE 'Repaga%') AS auditoria,
       (SELECT count(*) FROM public.system_audit_log s WHERE s.entity_type = 'transactions' AND s.entity_id = t.id::text AND s.created_at >= now()) AS audit_sistema
  FROM public.transactions t WHERE t.id = (SELECT id FROM _t);
ROLLBACK;
