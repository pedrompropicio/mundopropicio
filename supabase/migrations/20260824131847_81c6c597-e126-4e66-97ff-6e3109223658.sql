CREATE TABLE public.consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  decision text NOT NULL CHECK (decision IN ('accept_all','reject_all','custom','dismissed')),
  ms_to_decision integer NULL,
  locale text NULL,
  path text NULL,
  device text NULL CHECK (device IS NULL OR device IN ('mobile','desktop','tablet')),
  marketing_granted boolean NULL,
  functional_granted boolean NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.consent_log TO anon;
GRANT SELECT ON public.consent_log TO authenticated;
GRANT ALL ON public.consent_log TO service_role;

ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_log_insert_anon
  ON public.consent_log
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY consent_log_select_admin
  ON public.consent_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE INDEX consent_log_created_at_idx ON public.consent_log (created_at DESC);