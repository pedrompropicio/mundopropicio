CREATE TABLE public.coala_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '7d831e59-6e82-427b-95a0-64904aae5dd2',
  campaign text NOT NULL DEFAULT 'eb2027_invite',
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  confirm_url text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('pt','en')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','confirmed')),
  message_id text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (company_id, campaign, email)
);
CREATE TABLE public.coala_list_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '7d831e59-6e82-427b-95a0-64904aae5dd2',
  email text NOT NULL,
  list_joined boolean NOT NULL,
  marketing_opt_in boolean NOT NULL,
  text_version text NOT NULL,
  method text NOT NULL,
  locale text,
  invite_id uuid REFERENCES public.coala_invites(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coala_list_consents_email_idx ON public.coala_list_consents (company_id, email, created_at DESC);
CREATE TABLE public.coala_send_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '7d831e59-6e82-427b-95a0-64904aae5dd2',
  function_name text NOT NULL,
  daily_cap int,
  queued int NOT NULL DEFAULT 0,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coala_invites, public.coala_list_consents, public.coala_send_runs TO authenticated;
GRANT ALL ON public.coala_invites, public.coala_list_consents, public.coala_send_runs TO service_role;
ALTER TABLE public.coala_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coala_list_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coala_send_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY coala_invites_read ON public.coala_invites FOR SELECT TO authenticated
  USING (public.row_belongs_to_current_company(company_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY coala_list_consents_read ON public.coala_list_consents FOR SELECT TO authenticated
  USING (public.row_belongs_to_current_company(company_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));
CREATE POLICY coala_send_runs_read ON public.coala_send_runs FOR SELECT TO authenticated
  USING (public.row_belongs_to_current_company(company_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')));

CREATE OR REPLACE VIEW public.coala_list_members WITH (security_invoker = true) AS
  SELECT lower(btrim(lc.email)) AS email
    FROM public.lead_capture lc
   WHERE lc.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2'
     AND lc.email IS NOT NULL AND btrim(lc.email) <> ''
     AND lc.source IS DISTINCT FROM 'diag_test'
  UNION
  SELECT ci.email FROM public.coala_invites ci
   WHERE ci.company_id = '7d831e59-6e82-427b-95a0-64904aae5dd2' AND ci.status = 'confirmed';
REVOKE ALL ON public.coala_list_members FROM anon;
GRANT SELECT ON public.coala_list_members TO authenticated, service_role;