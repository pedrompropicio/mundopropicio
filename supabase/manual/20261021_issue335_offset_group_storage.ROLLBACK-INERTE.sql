-- INERTE: only pristine zero-history restoration; managed history is never removed.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.transaction_offset_groups) THEN RAISE EXCEPTION 'groups_exist_keep_guards'; END IF; IF to_regprocedure('public.issue335_dispatch()') IS NOT NULL OR to_regprocedure('public.issue335_invariant_counts()') IS NOT NULL THEN RAISE EXCEPTION 'rollback_order: invariants_core_before_storage'; END IF; END $$;
DO $$ BEGIN IF (to_regprocedure('public.issue335_cash_watch()') IS NOT NULL
 OR position('issue335-balance-v2l' in pg_get_functiondef('public._account_true_balance_raw(uuid)'::regprocedure))>0
 OR position('issue335-cash-position-v2l' in pg_get_functiondef('public.get_event_cash_position(uuid,date,date)'::regprocedure))>0
 OR position('issue335-cash-position-invariant-v2l' in pg_get_functiondef('public.get_event_cash_position_invariant(uuid)'::regprocedure))>0
 OR position('issue335-status-v2l' in pg_get_functiondef('public._derive_paid_amount(uuid)'::regprocedure))>0
 OR position('issue335-approval-v2l' in pg_get_functiondef('public.enforce_transaction_approval_permission()'::regprocedure))>0
 OR position('transaction_offset_control' in pg_get_functiondef('public.restore_apply_from_shadow(text,uuid,text[],jsonb)'::regprocedure))>0)
 THEN RAISE EXCEPTION 'rollback_order: consumers_installed'; END IF; END $$;
ALTER TABLE public.transaction_payments DROP COLUMN offset_item_id, DROP COLUMN offset_group_id;
ALTER TABLE public.transaction_offsets DROP COLUMN offset_group_id;
ALTER TABLE public.bank_statement_lines DROP COLUMN offset_group_id;
DROP TABLE public.transaction_offset_items;
DROP TABLE public.transaction_offset_groups;
DROP TABLE public.transaction_offset_control;
COMMIT;
