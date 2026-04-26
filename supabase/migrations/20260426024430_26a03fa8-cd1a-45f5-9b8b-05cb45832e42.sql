-- Phase 13 — RLS por role + cascade Trash para BP versions

DROP POLICY IF EXISTS "Authenticated users can view bp_versions" ON public.bp_versions;

CREATE POLICY "Staff sees all, partners only active"
ON public.bp_versions
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
  OR has_role(auth.uid(), 'viewer'::app_role)
  OR (
    has_role(auth.uid(), 'partner'::app_role)
    AND state = 'active'
    AND EXISTS (
      SELECT 1
        FROM public.event_partners ep
        JOIN public.suppliers s ON s.id = ep.supplier_id
        JOIN public.profiles p ON LOWER(p.email) = LOWER(s.email)
       WHERE ep.event_id = bp_versions.event_id
         AND p.id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can view bp_version_audit_log" ON public.bp_version_audit_log;

CREATE POLICY "Only staff can view bp_version_audit_log"
ON public.bp_version_audit_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
  OR has_role(auth.uid(), 'viewer'::app_role)
);

-- Cascade Trash: snapshot das versões antes do CASCADE FK
CREATE OR REPLACE FUNCTION public.snapshot_bp_versions_to_trash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_versions jsonb;
  v_audit jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(v.*) ORDER BY v.version_number), '[]'::jsonb)
    INTO v_versions
    FROM public.bp_versions v
   WHERE v.event_id = OLD.id;

  SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at), '[]'::jsonb)
    INTO v_audit
    FROM public.bp_version_audit_log a
   WHERE a.event_id = OLD.id;

  IF jsonb_array_length(v_versions) > 0 THEN
    INSERT INTO public.trash (
      entity_type, entity_id, entity_data, related_data, deleted_by
    ) VALUES (
      'bp_versions',
      OLD.id,
      jsonb_build_object(
        'event_id', OLD.id,
        'event_name', OLD.name,
        'snapshot_taken_at', now()
      ),
      jsonb_build_object(
        'versions', v_versions,
        'audit_log', v_audit
      ),
      'sistema (cascade do evento)'
    );
  END IF;

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'snapshot_bp_versions_to_trash failed for event %: %', OLD.id, SQLERRM;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_bp_versions_to_trash ON public.events;
CREATE TRIGGER trg_snapshot_bp_versions_to_trash
BEFORE DELETE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_bp_versions_to_trash();

-- Restore Trash → repor versões
CREATE OR REPLACE FUNCTION public.restore_bp_versions_from_trash(_trash_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trash record;
  v_versions jsonb;
  v_audit jsonb;
  v_inserted_versions int := 0;
  v_inserted_audit int := 0;
  v_row jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Apenas admin ou manager podem restaurar versões do BP';
  END IF;

  SELECT * INTO v_trash FROM public.trash WHERE id = _trash_id AND entity_type = 'bp_versions';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot de versões não encontrado na trash (id=%)', _trash_id;
  END IF;

  v_versions := COALESCE(v_trash.related_data->'versions', '[]'::jsonb);
  v_audit := COALESCE(v_trash.related_data->'audit_log', '[]'::jsonb);

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_versions)
  LOOP
    BEGIN
      INSERT INTO public.bp_versions
      SELECT * FROM jsonb_populate_record(NULL::public.bp_versions, v_row)
      ON CONFLICT (id) DO NOTHING;
      v_inserted_versions := v_inserted_versions + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'restore_bp_versions: skip version %: %', v_row->>'id', SQLERRM;
    END;
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_audit)
  LOOP
    BEGIN
      INSERT INTO public.bp_version_audit_log
      SELECT * FROM jsonb_populate_record(NULL::public.bp_version_audit_log, v_row)
      ON CONFLICT (id) DO NOTHING;
      v_inserted_audit := v_inserted_audit + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'restore_bp_versions: skip audit %: %', v_row->>'id', SQLERRM;
    END;
  END LOOP;

  UPDATE public.trash SET restored_at = now() WHERE id = _trash_id;

  RETURN jsonb_build_object(
    'restored_versions', v_inserted_versions,
    'restored_audit_entries', v_inserted_audit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_bp_versions_from_trash(uuid) TO authenticated;