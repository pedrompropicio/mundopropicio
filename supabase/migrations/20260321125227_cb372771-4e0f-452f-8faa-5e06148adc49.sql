
CREATE TABLE public.system_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  changed_by text NOT NULL DEFAULT 'system',
  old_data jsonb,
  new_data jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System audit log insertable by authenticated"
  ON public.system_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "System audit log viewable by admin or manager"
  ON public.system_audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE INDEX idx_system_audit_entity ON public.system_audit_log (entity_type, entity_id);
CREATE INDEX idx_system_audit_created ON public.system_audit_log (created_at DESC);
