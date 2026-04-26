-- ============================================================================
-- FASE 1: Schema do sistema de versões do Business Plan
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bp_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'superseded', 'archived')),
  description TEXT,
  snapshot_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  cascaded_from_version_id UUID REFERENCES public.bp_versions(id) ON DELETE SET NULL,
  is_retroactive_snapshot BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_label TEXT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE,
  superseded_at TIMESTAMP WITH TIME ZONE,
  superseded_by_version_id UUID REFERENCES public.bp_versions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT bp_versions_unique_number_per_event UNIQUE (event_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_bp_versions_event_id ON public.bp_versions(event_id);
CREATE INDEX IF NOT EXISTS idx_bp_versions_state ON public.bp_versions(state);
CREATE INDEX IF NOT EXISTS idx_bp_versions_event_state ON public.bp_versions(event_id, state);
CREATE INDEX IF NOT EXISTS idx_bp_versions_cascaded_from ON public.bp_versions(cascaded_from_version_id) WHERE cascaded_from_version_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bp_versions_one_active_per_event ON public.bp_versions(event_id) WHERE state = 'active';

ALTER TABLE public.bp_versions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_bp_versions_updated_at ON public.bp_versions;
CREATE TRIGGER trg_bp_versions_updated_at BEFORE UPDATE ON public.bp_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Authenticated users can view bp_versions" ON public.bp_versions;
CREATE POLICY "Authenticated users can view bp_versions" ON public.bp_versions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins and managers can insert bp_versions" ON public.bp_versions;
CREATE POLICY "Admins and managers can insert bp_versions" ON public.bp_versions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));
DROP POLICY IF EXISTS "Admins and managers can update bp_versions" ON public.bp_versions;
CREATE POLICY "Admins and managers can update bp_versions" ON public.bp_versions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));
DROP POLICY IF EXISTS "Admins can delete bp_versions" ON public.bp_versions;
CREATE POLICY "Admins can delete bp_versions" ON public.bp_versions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.bp_version_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES public.bp_versions(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_by_label TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bp_version_audit_log_version_id ON public.bp_version_audit_log(version_id);
CREATE INDEX IF NOT EXISTS idx_bp_version_audit_log_event_id ON public.bp_version_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_bp_version_audit_log_created_at ON public.bp_version_audit_log(created_at DESC);

ALTER TABLE public.bp_version_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view bp_version_audit_log" ON public.bp_version_audit_log;
CREATE POLICY "Authenticated users can view bp_version_audit_log" ON public.bp_version_audit_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins and managers can insert bp_version_audit_log" ON public.bp_version_audit_log;
CREATE POLICY "Admins and managers can insert bp_version_audit_log" ON public.bp_version_audit_log FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role));

ALTER TABLE public.event_forecasts
  ADD COLUMN IF NOT EXISTS historic_overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_retroactive_override BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.bp_versions
  ADD COLUMN IF NOT EXISTS scenario_label text,
  ADD COLUMN IF NOT EXISTS scenario_assumptions jsonb,
  ADD COLUMN IF NOT EXISTS is_pinned_scenario boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bp_versions_scenario_pinned ON public.bp_versions (event_id, is_pinned_scenario) WHERE is_pinned_scenario = true;
CREATE INDEX IF NOT EXISTS idx_bp_versions_scenario_label ON public.bp_versions (event_id) WHERE scenario_label IS NOT NULL;

INSERT INTO storage.buckets (id, name, public) VALUES ('bp-version-snapshots', 'bp-version-snapshots', false) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins and managers can read bp-version-snapshots" ON storage.objects;
CREATE POLICY "Admins and managers can read bp-version-snapshots" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bp-version-snapshots' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "Admins and managers can upload bp-version-snapshots" ON storage.objects;
CREATE POLICY "Admins and managers can upload bp-version-snapshots" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bp-version-snapshots' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "Admins and managers can update bp-version-snapshots" ON storage.objects;
CREATE POLICY "Admins and managers can update bp-version-snapshots" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'bp-version-snapshots' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "Admins and managers can delete bp-version-snapshots" ON storage.objects;
CREATE POLICY "Admins and managers can delete bp-version-snapshots" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'bp-version-snapshots' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role)));