ALTER TABLE public.camarim_items DROP CONSTRAINT IF EXISTS camarim_items_bp_scope_check;
ALTER TABLE public.camarim_items ADD CONSTRAINT camarim_items_bp_scope_check
  CHECK (bp_scope = ANY (ARRAY['master_common'::text, 'local_city'::text, 'mixed'::text]));

ALTER TABLE public.camarim_items DROP CONSTRAINT IF EXISTS camarim_items_status_check;
ALTER TABLE public.camarim_items ADD CONSTRAINT camarim_items_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'pending_review'::text, 'integrated'::text, 'split'::text]));