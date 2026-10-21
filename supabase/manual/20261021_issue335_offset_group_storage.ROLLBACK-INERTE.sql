-- INERTE rollback: retain schema and every audit/payment; close NEW entry privileges.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regclass('public.transaction_offset_groups') IS NOT NULL THEN
  REVOKE INSERT,UPDATE ON public.transaction_offset_groups FROM authenticated;
 END IF;
 IF to_regclass('public.transaction_offset_items') IS NOT NULL THEN
  REVOKE INSERT ON public.transaction_offset_items FROM authenticated;
 END IF;
END $$;
COMMIT;
