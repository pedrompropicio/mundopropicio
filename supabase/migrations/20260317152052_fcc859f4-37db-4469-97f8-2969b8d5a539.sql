ALTER TABLE public.payment_lists DROP CONSTRAINT payment_lists_status_check;
ALTER TABLE public.payment_lists ADD CONSTRAINT payment_lists_status_check 
CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'revision', 'partially_approved'));