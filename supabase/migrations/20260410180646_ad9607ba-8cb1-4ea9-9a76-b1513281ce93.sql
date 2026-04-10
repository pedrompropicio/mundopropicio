
-- Trash / recycle bin table
CREATE TABLE public.trash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  entity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_data jsonb DEFAULT NULL,
  deleted_by text NOT NULL DEFAULT 'system',
  deleted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  restored_at timestamptz DEFAULT NULL
);

CREATE INDEX idx_trash_entity_type ON public.trash (entity_type);
CREATE INDEX idx_trash_expires_at ON public.trash (expires_at) WHERE restored_at IS NULL;
CREATE INDEX idx_trash_deleted_at ON public.trash (deleted_at DESC);

ALTER TABLE public.trash ENABLE ROW LEVEL SECURITY;

-- View: admin and manager
CREATE POLICY "Trash viewable by admin or manager"
  ON public.trash FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Insert: admin and manager (soft-delete writes here)
CREATE POLICY "Trash insertable by admin or manager"
  ON public.trash FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Update: admin and manager (for marking as restored)
CREATE POLICY "Trash updatable by admin or manager"
  ON public.trash FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Permanent delete: admin only
CREATE POLICY "Trash permanently deletable by admin"
  ON public.trash FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
