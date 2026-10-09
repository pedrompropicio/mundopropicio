ALTER TABLE public.supplier_similarity_flags DROP CONSTRAINT supplier_similarity_flags_source_check;
ALTER TABLE public.supplier_similarity_flags ADD CONSTRAINT supplier_similarity_flags_source_check
  CHECK (source = ANY (ARRAY['sponsors_import'::text, 'apply_coala_bp'::text, 'backfill_09_10'::text]));