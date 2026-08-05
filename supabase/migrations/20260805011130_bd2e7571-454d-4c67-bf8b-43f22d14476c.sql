ALTER TABLE public.lead_capture ADD COLUMN IF NOT EXISTS company_id uuid;
CREATE INDEX IF NOT EXISTS idx_lead_capture_company_id ON public.lead_capture(company_id);
UPDATE public.lead_capture
   SET company_id = (raw->>'company_id')::uuid
 WHERE company_id IS NULL
   AND raw ? 'company_id'
   AND (raw->>'company_id') ~ '^[0-9a-f-]{36}$';