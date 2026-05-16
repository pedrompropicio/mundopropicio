CREATE TABLE public.company_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled_at timestamptz DEFAULT now(),
  enabled_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, feature_key)
);

CREATE INDEX idx_company_features_lookup
  ON public.company_features (company_id, feature_key)
  WHERE enabled = true;

CREATE TRIGGER trg_company_features_updated_at
BEFORE UPDATE ON public.company_features
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_features_select_members"
ON public.company_features
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR company_id = public.current_company_id()
);

CREATE POLICY "company_features_insert_platform_admin"
ON public.company_features
FOR INSERT
TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "company_features_update_platform_admin"
ON public.company_features
FOR UPDATE
TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "company_features_delete_platform_admin"
ON public.company_features
FOR DELETE
TO authenticated
USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.has_company_feature(_company_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_features
    WHERE company_id = _company_id
      AND feature_key = _feature_key
      AND enabled = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_company_feature(uuid, text) TO authenticated;

-- Seed for any Coala company (slug starts with 'coala')
INSERT INTO public.company_features (company_id, feature_key, enabled)
SELECT c.id, fk, true
FROM public.companies c
CROSS JOIN (VALUES ('sync-coala'), ('sync-fever'), ('sync-health')) AS f(fk)
WHERE c.slug LIKE 'coala%'
ON CONFLICT (company_id, feature_key) DO NOTHING;