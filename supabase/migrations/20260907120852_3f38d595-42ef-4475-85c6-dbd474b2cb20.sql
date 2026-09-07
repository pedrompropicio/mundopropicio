ALTER TABLE public.ads_invoice_line DROP CONSTRAINT ads_invoice_line_match_source_check;
ALTER TABLE public.ads_invoice_line ADD CONSTRAINT ads_invoice_line_match_source_check
  CHECK (match_source = ANY (ARRAY['erp_link'::text,'fuzzy'::text,'manual'::text,'none'::text,'regra'::text,'fora_sistema'::text]));
ALTER TABLE public.ads_invoice_line ADD CONSTRAINT ads_invoice_line_fora_sistema_no_event
  CHECK (match_source <> 'fora_sistema' OR event_id IS NULL);