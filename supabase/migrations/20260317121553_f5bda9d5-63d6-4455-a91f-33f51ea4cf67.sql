
-- Audit log table for tracking transaction changes
CREATE TABLE public.transaction_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  changed_by text NOT NULL DEFAULT 'system',
  changed_at timestamptz NOT NULL DEFAULT now(),
  field_name text NOT NULL,
  old_value text,
  new_value text
);

ALTER TABLE public.transaction_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit log is viewable by everyone" ON public.transaction_audit_log FOR SELECT TO anon USING (true);
CREATE POLICY "Audit log can be inserted by everyone" ON public.transaction_audit_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Audit log is viewable by authenticated" ON public.transaction_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Audit log can be inserted by authenticated" ON public.transaction_audit_log FOR INSERT TO authenticated WITH CHECK (true);
