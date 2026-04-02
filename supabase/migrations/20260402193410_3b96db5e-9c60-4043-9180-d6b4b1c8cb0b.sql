CREATE TABLE public.forecast_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_id UUID NOT NULL REFERENCES public.event_forecasts(id) ON DELETE CASCADE,
  changed_by TEXT NOT NULL DEFAULT '',
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  observation TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view forecast audit logs"
ON public.forecast_audit_log
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins and managers can insert forecast audit logs"
ON public.forecast_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);

CREATE INDEX idx_forecast_audit_log_forecast_id ON public.forecast_audit_log(forecast_id);
