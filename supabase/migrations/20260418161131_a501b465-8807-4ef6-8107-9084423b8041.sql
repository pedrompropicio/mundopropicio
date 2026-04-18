CREATE TABLE public.undo_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  performed_by UUID NOT NULL,
  performed_by_name TEXT,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reverted_at TIMESTAMP WITH TIME ZONE,
  reverted_by UUID,
  reverted_by_name TEXT,
  revert_reason TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX idx_undo_actions_entity ON public.undo_actions (entity_type, entity_id, performed_at DESC);
CREATE INDEX idx_undo_actions_performer ON public.undo_actions (performed_by, performed_at DESC);
CREATE INDEX idx_undo_actions_active ON public.undo_actions (performed_at DESC) WHERE reverted_at IS NULL;

ALTER TABLE public.undo_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Undo actions viewable by authenticated"
  ON public.undo_actions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Undo actions insertable by privileged roles"
  ON public.undo_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

CREATE POLICY "Undo actions revertable by author or privileged"
  ON public.undo_actions
  FOR UPDATE
  TO authenticated
  USING (
    performed_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    performed_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Undo actions deletable by admin"
  ON public.undo_actions
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));