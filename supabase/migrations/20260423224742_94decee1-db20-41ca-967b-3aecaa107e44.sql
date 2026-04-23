-- Alinhar status_check com o modelo de domínio do código
ALTER TABLE public.camarim_items DROP CONSTRAINT IF EXISTS camarim_items_status_check;
ALTER TABLE public.camarim_items ADD CONSTRAINT camarim_items_status_check
  CHECK (status = ANY (ARRAY['draft','submitted','approved','rejected','pending_review','integrated']));

-- Alinhar payment_origin_check (UI usa "card" em vez de "company_card")
ALTER TABLE public.camarim_items DROP CONSTRAINT IF EXISTS camarim_items_payment_origin_check;
ALTER TABLE public.camarim_items ADD CONSTRAINT camarim_items_payment_origin_check
  CHECK (payment_origin = ANY (ARRAY['advance','card','out_of_pocket']));