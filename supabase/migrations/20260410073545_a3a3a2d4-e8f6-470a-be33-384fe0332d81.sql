
-- Add reimbursement fields to transactions
ALTER TABLE public.transactions
ADD COLUMN is_reimbursement boolean NOT NULL DEFAULT false,
ADD COLUMN reimbursement_to text;

-- Create index for reimbursement queries
CREATE INDEX idx_transactions_reimbursement ON public.transactions (is_reimbursement) WHERE is_reimbursement = true;

-- Create reimbursement_notes table
CREATE TABLE public.reimbursement_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  employee_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_amount numeric NOT NULL DEFAULT 0,
  payment_transaction_id uuid REFERENCES public.transactions(id),
  approved_by text,
  approved_at timestamp with time zone,
  paid_at timestamp with time zone,
  notes text,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create reimbursement_note_items table
CREATE TABLE public.reimbursement_note_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reimbursement_note_id uuid NOT NULL REFERENCES public.reimbursement_notes(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(transaction_id)
);

-- Enable RLS
ALTER TABLE public.reimbursement_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_note_items ENABLE ROW LEVEL SECURITY;

-- RLS for reimbursement_notes
CREATE POLICY "Reimbursement notes viewable by authenticated"
ON public.reimbursement_notes FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Reimbursement notes insertable by privileged roles"
ON public.reimbursement_notes FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'editor')
);

CREATE POLICY "Reimbursement notes updatable by privileged roles"
ON public.reimbursement_notes FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'editor')
);

CREATE POLICY "Reimbursement notes deletable by admin or manager"
ON public.reimbursement_notes FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'manager')
);

-- RLS for reimbursement_note_items
CREATE POLICY "Reimbursement note items viewable by authenticated"
ON public.reimbursement_note_items FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Reimbursement note items insertable by privileged roles"
ON public.reimbursement_note_items FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'editor')
);

CREATE POLICY "Reimbursement note items deletable by privileged roles"
ON public.reimbursement_note_items FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'manager') OR
  has_role(auth.uid(), 'editor')
);

-- Trigger for updated_at
CREATE TRIGGER update_reimbursement_notes_updated_at
BEFORE UPDATE ON public.reimbursement_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate sequential reimbursement code
CREATE OR REPLACE FUNCTION public.generate_reimbursement_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  current_year text;
  next_seq integer;
BEGIN
  current_year := EXTRACT(YEAR FROM now())::text;
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(SPLIT_PART(code, '-', 2), '/', 1) AS integer)
  ), 0) + 1
  INTO next_seq
  FROM public.reimbursement_notes
  WHERE code LIKE 'R-%/' || current_year;

  NEW.code := 'R-' || LPAD(next_seq::text, 3, '0') || '/' || current_year;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_reimbursement_code
BEFORE INSERT ON public.reimbursement_notes
FOR EACH ROW
WHEN (NEW.code IS NULL OR NEW.code = '')
EXECUTE FUNCTION public.generate_reimbursement_code();
