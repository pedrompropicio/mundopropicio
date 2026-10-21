-- INERTE: no registration/application authorized in Live.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.issue335_invariant_counts()
RETURNS TABLE(name text,current_count bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH active AS(SELECT * FROM public.transaction_offset_groups WHERE status='applied'),
 totals AS(SELECT group_id,sum(CASE WHEN type='income' THEN open_amount ELSE -open_amount END) net,
 sum(CASE WHEN type='income' THEN compensation_amount ELSE -compensation_amount END) comp,sum(cash_amount) cash FROM public.transaction_offset_items GROUP BY group_id)
 SELECT 'encontro_desequilibrado',count(*) FROM active g LEFT JOIN totals t ON t.group_id=g.id WHERE t.net IS DISTINCT FROM g.movement_amount OR t.comp IS DISTINCT FROM 0::numeric OR t.cash IS DISTINCT FROM abs(g.movement_amount)
 UNION ALL SELECT 'encontro_pernas_divergentes',count(*) FROM public.transaction_offset_items i JOIN active g ON g.id=i.group_id WHERE
  i.cash_amount IS DISTINCT FROM COALESCE((SELECT sum(p.amount) FROM public.transaction_payments p WHERE p.offset_item_id=i.id AND p.payment_method='transfer' AND p.status='paid' AND p.reversed_at IS NULL),0) OR
  i.compensation_amount IS DISTINCT FROM COALESCE((SELECT sum(p.amount) FROM public.transaction_payments p WHERE p.offset_item_id=i.id AND p.payment_method='compensation' AND p.status='paid' AND p.reversed_at IS NULL),0)
 UNION ALL SELECT 'encontro_reversao_parcial',count(*) FROM public.transaction_offset_groups g WHERE (g.status='reversed' AND EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.offset_group_id=g.id AND (p.status<>'reversed' OR p.reversed_at IS NULL))) OR (g.status='applied' AND EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.offset_group_id=g.id AND (p.status<>'paid' OR p.reversed_at IS NOT NULL)))
 UNION ALL SELECT 'encontro_dinheiro_sem_conta',count(*) FROM public.transaction_payments p JOIN active g ON g.id=p.offset_group_id WHERE (p.payment_method='compensation' AND p.account_id IS NOT NULL) OR (p.payment_method='transfer' AND (p.account_id IS DISTINCT FROM g.account_id OR p.account_id IS NULL))
 UNION ALL SELECT 'encontro_vinculo_bancario_divergente',count(*) FROM public.bank_statement_lines b JOIN active g ON g.id=b.offset_group_id WHERE b.status<>'matched' OR b.amount<>g.movement_amount OR b.financial_account_id IS DISTINCT FROM g.account_id OR EXISTS(SELECT 1 FROM public.bank_line_transactions l WHERE l.line_id=b.id AND NOT EXISTS(SELECT 1 FROM public.transaction_offset_items i WHERE i.group_id=g.id AND i.transaction_id=l.transaction_id AND i.cash_amount>0)) OR EXISTS(SELECT 1 FROM public.transaction_offset_items i WHERE i.group_id=g.id AND i.cash_amount>0 AND NOT EXISTS(SELECT 1 FROM public.bank_line_transactions l WHERE l.line_id=b.id AND l.transaction_id=i.transaction_id));
$$;
REVOKE ALL ON FUNCTION public.issue335_invariant_counts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue335_invariant_counts() TO service_role;
-- Registry records are additive and require separate authorization C.
INSERT INTO public.system_invariants(name,description,severity,scope,reference_count,notes)
SELECT name,name,'error','empresa',0,'#335 bilateral; local/inert candidate' FROM public.issue335_invariant_counts() ON CONFLICT(name) DO NOTHING;
COMMIT;
