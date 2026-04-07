
CREATE TABLE public.accounting_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  exported_by TEXT NOT NULL DEFAULT 'system',
  transaction_count INTEGER NOT NULL DEFAULT 0,
  document_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accounting exports viewable by admin or manager"
ON public.accounting_exports
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Accounting exports insertable by admin or manager"
ON public.accounting_exports
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Accounting exports deletable by admin"
ON public.accounting_exports
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
