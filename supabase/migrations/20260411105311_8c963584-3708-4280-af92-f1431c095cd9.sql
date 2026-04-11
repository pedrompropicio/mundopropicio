
-- Step 1: Add contact fields to financial_accounts
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email_contact text;

-- Step 2: Migrate contact data from ticket_offices to their linked financial_accounts
UPDATE public.financial_accounts fa
SET
  contact_name = to2.contact_name,
  phone = to2.phone,
  email_contact = to2.email
FROM public.ticket_offices to2
WHERE to2.financial_account_id = fa.id
  AND to2.financial_account_id IS NOT NULL;

-- Step 3: event_ticket_office_assignments - add new FK column, migrate, drop old
ALTER TABLE public.event_ticket_office_assignments
  ADD COLUMN financial_account_id uuid;

UPDATE public.event_ticket_office_assignments eta
SET financial_account_id = to2.financial_account_id
FROM public.ticket_offices to2
WHERE to2.id = eta.ticket_office_id;

-- Drop old FK and column
ALTER TABLE public.event_ticket_office_assignments
  DROP CONSTRAINT IF EXISTS event_ticket_office_assignments_ticket_office_id_fkey;

ALTER TABLE public.event_ticket_office_assignments
  DROP COLUMN ticket_office_id;

-- Add new FK
ALTER TABLE public.event_ticket_office_assignments
  ADD CONSTRAINT event_ticket_office_assignments_financial_account_id_fkey
  FOREIGN KEY (financial_account_id) REFERENCES public.financial_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.event_ticket_office_assignments
  ALTER COLUMN financial_account_id SET NOT NULL;

-- Step 4: ticket_import_logs - add new FK column, migrate, drop old
ALTER TABLE public.ticket_import_logs
  ADD COLUMN financial_account_id uuid;

UPDATE public.ticket_import_logs til
SET financial_account_id = to2.financial_account_id
FROM public.ticket_offices to2
WHERE to2.id = til.ticket_office_id;

ALTER TABLE public.ticket_import_logs
  DROP CONSTRAINT IF EXISTS ticket_import_logs_ticket_office_id_fkey;

ALTER TABLE public.ticket_import_logs
  DROP COLUMN ticket_office_id;

ALTER TABLE public.ticket_import_logs
  ADD CONSTRAINT ticket_import_logs_financial_account_id_fkey
  FOREIGN KEY (financial_account_id) REFERENCES public.financial_accounts(id);

-- Step 5: ticket_sales - add new FK column, migrate, drop old
ALTER TABLE public.ticket_sales
  ADD COLUMN financial_account_id uuid;

UPDATE public.ticket_sales ts
SET financial_account_id = to2.financial_account_id
FROM public.ticket_offices to2
WHERE to2.id = ts.ticket_office_id;

ALTER TABLE public.ticket_sales
  DROP CONSTRAINT IF EXISTS ticket_sales_ticket_office_id_fkey;

ALTER TABLE public.ticket_sales
  DROP COLUMN IF EXISTS ticket_office_id;

ALTER TABLE public.ticket_sales
  ADD CONSTRAINT ticket_sales_financial_account_id_fkey
  FOREIGN KEY (financial_account_id) REFERENCES public.financial_accounts(id);

-- Step 6: Drop ticket_offices table (all data migrated)
DROP TABLE IF EXISTS public.ticket_offices CASCADE;
