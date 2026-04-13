
CREATE TABLE public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_activity_log_user_created ON public.user_activity_log (user_id, created_at DESC);
CREATE INDEX idx_user_activity_log_created ON public.user_activity_log (created_at DESC);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

-- Users can insert their own activity
CREATE POLICY "Users can insert own activity"
  ON public.user_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only admins can read all activity
CREATE POLICY "Admins can read all activity"
  ON public.user_activity_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Auto-cleanup: admins can delete old records
CREATE POLICY "Admins can delete activity"
  ON public.user_activity_log FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
