-- INERTE: only pristine zero-history restoration; managed history is never removed.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.transaction_offset_groups) THEN RAISE EXCEPTION 'groups_exist_keep_guards'; END IF; END $$;
ALTER TABLE public.transaction_payments DROP COLUMN offset_item_id, DROP COLUMN offset_group_id;
ALTER TABLE public.transaction_offsets DROP COLUMN offset_group_id;
ALTER TABLE public.bank_statement_lines DROP COLUMN offset_group_id;
DROP TABLE public.transaction_offset_items;
DROP TABLE public.transaction_offset_groups;
COMMIT;
