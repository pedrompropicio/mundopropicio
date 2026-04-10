-- Add supplier_id to reimbursement_notes
ALTER TABLE public.reimbursement_notes
ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_reimbursement_notes_supplier_id ON public.reimbursement_notes(supplier_id);