
DO $$ BEGIN
  CREATE TYPE public.sponsorship_stage AS ENUM (
    'lead','contacted','proposal_sent','negotiating','closed','barter','lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sponsorship_doc_status AS ENUM (
    'awaiting','invoice_sent','invoice_received','post_event'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.sponsorship_activity_kind AS ENUM (
    'note','stage_change','doc_status_change','sync','system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sponsorship_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  stage public.sponsorship_stage NOT NULL DEFAULT 'lead',
  doc_status public.sponsorship_doc_status,
  proposed_amount numeric(14,2) DEFAULT 0,
  confirmed_amount numeric(14,2) DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  iva_rate numeric(5,2) DEFAULT 23,
  is_barter boolean NOT NULL DEFAULT false,
  barter_description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  next_followup_date date,
  notes text,
  lost_reason text,
  closed_at timestamptz,
  auto_sync_bp boolean NOT NULL DEFAULT true,
  linked_forecast_id uuid REFERENCES public.event_forecasts(id) ON DELETE SET NULL,
  linked_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsorship_pipeline_event ON public.sponsorship_pipeline(event_id);
CREATE INDEX IF NOT EXISTS idx_sponsorship_pipeline_company ON public.sponsorship_pipeline(company_id);
CREATE INDEX IF NOT EXISTS idx_sponsorship_pipeline_stage ON public.sponsorship_pipeline(event_id, stage);
CREATE INDEX IF NOT EXISTS idx_sponsorship_pipeline_owner ON public.sponsorship_pipeline(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sponsorship_pipeline_followup ON public.sponsorship_pipeline(next_followup_date) WHERE next_followup_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sponsorship_pipeline_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  pipeline_id uuid NOT NULL REFERENCES public.sponsorship_pipeline(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind public.sponsorship_activity_kind NOT NULL DEFAULT 'note',
  body text,
  metadata jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsorship_activities_pipeline ON public.sponsorship_pipeline_activities(pipeline_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.tg_sponsorship_pipeline_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sponsorship_pipeline_updated_at ON public.sponsorship_pipeline;
CREATE TRIGGER trg_sponsorship_pipeline_updated_at
  BEFORE UPDATE ON public.sponsorship_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.tg_sponsorship_pipeline_updated_at();

CREATE OR REPLACE FUNCTION public.tg_sponsorship_pipeline_autolog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sponsorship_pipeline_activities(company_id, pipeline_id, user_id, kind, body, metadata)
    VALUES (NEW.company_id, NEW.id, auth.uid(), 'system',
      'Patrocinador adicionado ao pipeline',
      jsonb_build_object('stage', NEW.stage, 'supplier_name', NEW.supplier_name));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO public.sponsorship_pipeline_activities(company_id, pipeline_id, user_id, kind, body, metadata)
      VALUES (NEW.company_id, NEW.id, auth.uid(), 'stage_change',
        format('Estado: %s → %s', OLD.stage, NEW.stage),
        jsonb_build_object('from', OLD.stage, 'to', NEW.stage));
      IF NEW.stage IN ('closed','barter') AND OLD.stage NOT IN ('closed','barter') THEN
        NEW.closed_at := COALESCE(NEW.closed_at, now());
      END IF;
      IF NEW.stage NOT IN ('closed','barter') AND OLD.stage IN ('closed','barter') THEN
        NEW.closed_at := NULL;
      END IF;
    END IF;
    IF NEW.doc_status IS DISTINCT FROM OLD.doc_status THEN
      INSERT INTO public.sponsorship_pipeline_activities(company_id, pipeline_id, user_id, kind, body, metadata)
      VALUES (NEW.company_id, NEW.id, auth.uid(), 'doc_status_change',
        format('Estado documental: %s → %s', COALESCE(OLD.doc_status::text,'—'), COALESCE(NEW.doc_status::text,'—')),
        jsonb_build_object('from', OLD.doc_status, 'to', NEW.doc_status));
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sponsorship_pipeline_autolog ON public.sponsorship_pipeline;
CREATE TRIGGER trg_sponsorship_pipeline_autolog
  BEFORE INSERT OR UPDATE ON public.sponsorship_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.tg_sponsorship_pipeline_autolog();

ALTER TABLE public.sponsorship_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsorship_pipeline_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sponsorship_pipeline_select"
ON public.sponsorship_pipeline FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'viewer')
    OR owner_user_id = auth.uid()
  )
);

CREATE POLICY "sponsorship_pipeline_insert"
ON public.sponsorship_pipeline FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'editor')
  )
);

CREATE POLICY "sponsorship_pipeline_update"
ON public.sponsorship_pipeline FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'editor')
    OR owner_user_id = auth.uid()
  )
)
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "sponsorship_pipeline_delete"
ON public.sponsorship_pipeline FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager')
  )
);

CREATE POLICY "sponsorship_activities_select"
ON public.sponsorship_pipeline_activities FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'editor')
    OR public.has_role(auth.uid(), 'viewer')
  )
);

CREATE POLICY "sponsorship_activities_insert"
ON public.sponsorship_pipeline_activities FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'editor')
  )
);

CREATE POLICY "sponsorship_activities_delete"
ON public.sponsorship_pipeline_activities FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'platform_admin')
  )
);
