-- ============================================================================
-- FASE 1: Schema do sistema de versões do Business Plan
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela bp_versions
-- ----------------------------------------------------------------------------
CREATE TABLE public.bp_versions (
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

CREATE INDEX idx_bp_versions_event_id ON public.bp_versions(event_id);
CREATE INDEX idx_bp_versions_state ON public.bp_versions(state);
CREATE INDEX idx_bp_versions_event_state ON public.bp_versions(event_id, state);
CREATE INDEX idx_bp_versions_cascaded_from ON public.bp_versions(cascaded_from_version_id) WHERE cascaded_from_version_id IS NOT NULL;

-- Apenas uma versão ativa por evento
CREATE UNIQUE INDEX idx_bp_versions_one_active_per_event
  ON public.bp_versions(event_id)
  WHERE state = 'active';

ALTER TABLE public.bp_versions ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at
CREATE TRIGGER trg_bp_versions_updated_at
  BEFORE UPDATE ON public.bp_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: leitura para qualquer utilizador autenticado (equipa interna)
CREATE POLICY "Authenticated users can view bp_versions"
ON public.bp_versions
FOR SELECT
TO authenticated
USING (true);

-- RLS: insert apenas para admin e manager
CREATE POLICY "Admins and managers can insert bp_versions"
ON public.bp_versions
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- RLS: update apenas para admin e manager
CREATE POLICY "Admins and managers can update bp_versions"
ON public.bp_versions
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- RLS: delete só para admin (apenas drafts são apagáveis — validação no código)
CREATE POLICY "Admins can delete bp_versions"
ON public.bp_versions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ----------------------------------------------------------------------------
-- 2. Tabela bp_version_audit_log
-- ----------------------------------------------------------------------------
CREATE TABLE public.bp_version_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES public.bp_versions(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'created',
    'approved',
    'superseded',
    'archived',
    'unarchived',
    'reverted_to',
    'auto_reconciled',
    'retroactive_override_applied',
    'retroactive_snapshot_added'
  )),
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_by_label TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_bp_version_audit_log_version_id ON public.bp_version_audit_log(version_id);
CREATE INDEX idx_bp_version_audit_log_event_id ON public.bp_version_audit_log(event_id);
CREATE INDEX idx_bp_version_audit_log_created_at ON public.bp_version_audit_log(created_at DESC);

ALTER TABLE public.bp_version_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: leitura para qualquer utilizador autenticado
CREATE POLICY "Authenticated users can view bp_version_audit_log"
ON public.bp_version_audit_log
FOR SELECT
TO authenticated
USING (true);

-- RLS: insert apenas para admin e manager
CREATE POLICY "Admins and managers can insert bp_version_audit_log"
ON public.bp_version_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

-- ----------------------------------------------------------------------------
-- 3. Novos campos em event_forecasts
-- ----------------------------------------------------------------------------
ALTER TABLE public.event_forecasts
  ADD COLUMN historic_overrides JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN is_retroactive_override BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_forecasts.historic_overrides IS
  'Array de bypasses "Fora do BP" anteriores que foram reconciliados automaticamente ao aprovar nova versão do BP. Preserva justificativas originais como histórico permanente. Cada entrada: { reconciled_at, reconciled_in_version, original_note, original_amount }';

COMMENT ON COLUMN public.event_forecasts.is_retroactive_override IS
  'TRUE quando uma transação ligada a esta linha de BP passou a estar "Fora do BP" retroativamente porque uma nova versão reduziu a verba da categoria abaixo do já lançado.';

-- ----------------------------------------------------------------------------
-- 4. Bucket de storage bp-version-snapshots
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('bp-version-snapshots', 'bp-version-snapshots', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: apenas admin e manager
CREATE POLICY "Admins and managers can read bp-version-snapshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'bp-version-snapshots'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can upload bp-version-snapshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'bp-version-snapshots'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can update bp-version-snapshots"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'bp-version-snapshots'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can delete bp-version-snapshots"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'bp-version-snapshots'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);
