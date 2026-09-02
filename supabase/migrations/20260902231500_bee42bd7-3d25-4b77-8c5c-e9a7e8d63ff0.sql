REVOKE ALL ON FUNCTION public.enforce_transaction_approval_permission() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_transaction_approval_permission() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_transaction_approval_permission() FROM authenticated;