CREATE TABLE public.event_bp_review_acks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  acknowledged_by uuid NOT NULL DEFAULT auth.uid(),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  unused_net numeric NOT NULL,
  lines_count integer NOT NULL,
  note text
);

CREATE INDEX idx_event_bp_review_acks_event ON public.event_bp_review_acks (event_id, acknowledged_at DESC);

GRANT SELECT, INSERT ON public.event_bp_review_acks TO authenticated;
GRANT ALL ON public.event_bp_review_acks TO service_role;

ALTER TABLE public.event_bp_review_acks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bp review acks"
ON public.event_bp_review_acks
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "manage_bp can insert bp review acks"
ON public.event_bp_review_acks
FOR INSERT TO authenticated
WITH CHECK (
  acknowledged_by = auth.uid()
  AND public.has_permission_in(auth.uid(), 'manage_bp', company_id)
);

CREATE POLICY "company_isolation_event_bp_review_acks"
ON public.event_bp_review_acks
AS RESTRICTIVE
FOR ALL TO authenticated
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());