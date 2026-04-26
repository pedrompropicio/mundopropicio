
-- ============================================================
-- 1. Coluna version_id em event_forecasts
-- ============================================================
ALTER TABLE public.event_forecasts
  ADD COLUMN IF NOT EXISTS version_id uuid NULL REFERENCES public.bp_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_event_forecasts_version_id
  ON public.event_forecasts(version_id) WHERE version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_forecasts_event_id_active
  ON public.event_forecasts(event_id) WHERE version_id IS NULL;

COMMENT ON COLUMN public.event_forecasts.version_id IS
  'NULL = pertence à versão Ativa viva do BP. Preenchido = pertence a um cenário (working_draft) isolado.';

-- ============================================================
-- 2. RPC: create_scenario_draft
--    Cria um cenário working_draft e clona linhas da Ativa
--    Cascateia para Splits em turnês
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_scenario_draft(
  _event_id uuid,
  _scenario_label text,
  _scenario_assumptions jsonb DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master_id uuid;
  v_event_record record;
  v_split_record record;
  v_new_version_id uuid;
  v_new_split_version_id uuid;
  v_next_number int;
  v_user_id uuid := auth.uid();
  v_user_label text;
BEGIN
  -- Resolve identidade
  SELECT COALESCE(full_name, email, 'Sistema') INTO v_user_label
    FROM public.profiles WHERE id = v_user_id;

  -- Permissão: admin/manager/editor
  IF NOT (
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'manager'::app_role)
    OR public.has_role(v_user_id, 'editor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar cenários';
  END IF;

  -- Identifica evento e Master (se for Split, sobe ao Master)
  SELECT id, parent_event_id INTO v_event_record
    FROM public.events WHERE id = _event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado';
  END IF;

  v_master_id := COALESCE(v_event_record.parent_event_id, v_event_record.id);

  -- Cria versão working_draft do Master
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_number
    FROM public.bp_versions WHERE event_id = v_master_id;

  INSERT INTO public.bp_versions (
    event_id, version_number, state, scenario_label, scenario_assumptions,
    description, created_by, created_by_label, is_pinned_scenario
  ) VALUES (
    v_master_id, v_next_number, 'working_draft', _scenario_label, _scenario_assumptions,
    _description, v_user_id, v_user_label, false
  )
  RETURNING id INTO v_new_version_id;

  -- Clona linhas Ativas do Master para o cenário
  INSERT INTO public.event_forecasts (
    event_id, category_id, type, description, amount, iva_rate, notes,
    status, specification, formula_type, formula_value, cache_config_id,
    is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
    currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
    is_overhead, historic_overrides, version_id
  )
  SELECT
    event_id, category_id, type, description, amount, iva_rate, notes,
    status, specification, formula_type, formula_value, cache_config_id,
    is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
    currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
    is_overhead, historic_overrides, v_new_version_id
  FROM public.event_forecasts
  WHERE event_id = v_master_id AND version_id IS NULL;

  -- Cascade para Splits
  FOR v_split_record IN
    SELECT id FROM public.events WHERE parent_event_id = v_master_id
  LOOP
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_number
      FROM public.bp_versions WHERE event_id = v_split_record.id;

    INSERT INTO public.bp_versions (
      event_id, version_number, state, scenario_label, scenario_assumptions,
      description, created_by, created_by_label, cascaded_from_version_id,
      is_pinned_scenario
    ) VALUES (
      v_split_record.id, v_next_number, 'working_draft', _scenario_label,
      _scenario_assumptions, _description, v_user_id, v_user_label, v_new_version_id, false
    )
    RETURNING id INTO v_new_split_version_id;

    INSERT INTO public.event_forecasts (
      event_id, category_id, type, description, amount, iva_rate, notes,
      status, specification, formula_type, formula_value, cache_config_id,
      is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
      currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
      is_overhead, historic_overrides, version_id
    )
    SELECT
      event_id, category_id, type, description, amount, iva_rate, notes,
      status, specification, formula_type, formula_value, cache_config_id,
      is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
      currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
      is_overhead, historic_overrides, v_new_split_version_id
    FROM public.event_forecasts
    WHERE event_id = v_split_record.id AND version_id IS NULL;
  END LOOP;

  -- Audit log
  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    v_new_version_id, v_master_id, 'scenario_draft_created',
    v_user_id, v_user_label,
    jsonb_build_object('scenario_label', _scenario_label)
  );

  RETURN v_new_version_id;
END;
$$;

-- ============================================================
-- 3. RPC: discard_scenario_draft
--    Apaga cenário working_draft (e cascateia para Splits)
--    Linhas vinculadas são removidas pelo ON DELETE CASCADE
-- ============================================================
CREATE OR REPLACE FUNCTION public.discard_scenario_draft(_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_version record;
  v_split_version record;
  v_user_label text;
BEGIN
  IF NOT (
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'manager'::app_role)
    OR public.has_role(v_user_id, 'editor'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para descartar cenários';
  END IF;

  SELECT * INTO v_version FROM public.bp_versions WHERE id = _version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versão não encontrada';
  END IF;

  IF v_version.state <> 'working_draft' THEN
    RAISE EXCEPTION 'Só é possível descartar cenários em construção (working_draft)';
  END IF;

  SELECT COALESCE(full_name, email, 'Sistema') INTO v_user_label
    FROM public.profiles WHERE id = v_user_id;

  -- Apaga cascades (Splits) — apaga forecasts e a versão
  FOR v_split_version IN
    SELECT id, event_id FROM public.bp_versions
    WHERE cascaded_from_version_id = _version_id
  LOOP
    INSERT INTO public.bp_version_audit_log (
      version_id, event_id, action, performed_by, performed_by_label, metadata
    ) VALUES (
      v_split_version.id, v_split_version.event_id, 'scenario_draft_discarded_cascade',
      v_user_id, v_user_label, jsonb_build_object('parent_version_id', _version_id)
    );
    DELETE FROM public.bp_versions WHERE id = v_split_version.id;
  END LOOP;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    _version_id, v_version.event_id, 'scenario_draft_discarded',
    v_user_id, v_user_label, jsonb_build_object('scenario_label', v_version.scenario_label)
  );

  DELETE FROM public.bp_versions WHERE id = _version_id;
END;
$$;

-- ============================================================
-- 4. RPC: promote_scenario_draft_to_active
--    Snapshot da Ativa atual → vira superseded
--    Linhas do cenário viram Ativa (version_id = NULL)
--    Cascateia para Splits
-- ============================================================
CREATE OR REPLACE FUNCTION public.promote_scenario_draft_to_active(
  _scenario_version_id uuid,
  _new_active_label text DEFAULT NULL,
  _new_active_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_label text;
  v_scenario record;
  v_split_scenario record;
  v_old_active record;
  v_archived_snapshot_id uuid;
  v_next_number int;
BEGIN
  IF NOT (
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Apenas admin ou manager pode promover cenários';
  END IF;

  SELECT COALESCE(full_name, email, 'Sistema') INTO v_user_label
    FROM public.profiles WHERE id = v_user_id;

  SELECT * INTO v_scenario FROM public.bp_versions WHERE id = _scenario_version_id;

  IF NOT FOUND OR v_scenario.state <> 'working_draft' THEN
    RAISE EXCEPTION 'Cenário inválido ou já promovido';
  END IF;

  -- ============ MASTER ============
  -- 1) Snapshot da Ativa atual (vira superseded)
  SELECT * INTO v_old_active
    FROM public.bp_versions
    WHERE event_id = v_scenario.event_id AND state = 'active'
    LIMIT 1;

  IF FOUND THEN
    UPDATE public.bp_versions
      SET state = 'superseded', superseded_at = now(), superseded_by_version_id = _scenario_version_id
      WHERE id = v_old_active.id;
  END IF;

  -- 2) Promove o cenário a Ativa
  UPDATE public.bp_versions
    SET state = 'active',
        approved_at = now(),
        approved_by = v_user_id,
        scenario_label = COALESCE(_new_active_label, scenario_label),
        description = COALESCE(_new_active_description, description)
    WHERE id = _scenario_version_id;

  -- 3) Move linhas: apaga as antigas Ativas, "promove" as do cenário
  DELETE FROM public.event_forecasts
    WHERE event_id = v_scenario.event_id AND version_id IS NULL;

  UPDATE public.event_forecasts
    SET version_id = NULL
    WHERE version_id = _scenario_version_id;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    _scenario_version_id, v_scenario.event_id, 'scenario_promoted_to_active',
    v_user_id, v_user_label,
    jsonb_build_object('previous_active_id', v_old_active.id, 'scenario_label', v_scenario.scenario_label)
  );

  -- ============ SPLITS (cascade) ============
  FOR v_split_scenario IN
    SELECT * FROM public.bp_versions
    WHERE cascaded_from_version_id = _scenario_version_id AND state = 'working_draft'
  LOOP
    -- Snapshot da Ativa do Split
    SELECT * INTO v_old_active
      FROM public.bp_versions
      WHERE event_id = v_split_scenario.event_id AND state = 'active'
      LIMIT 1;

    IF FOUND THEN
      UPDATE public.bp_versions
        SET state = 'superseded', superseded_at = now(), superseded_by_version_id = v_split_scenario.id
        WHERE id = v_old_active.id;
    END IF;

    UPDATE public.bp_versions
      SET state = 'active', approved_at = now(), approved_by = v_user_id
      WHERE id = v_split_scenario.id;

    DELETE FROM public.event_forecasts
      WHERE event_id = v_split_scenario.event_id AND version_id IS NULL;

    UPDATE public.event_forecasts
      SET version_id = NULL
      WHERE version_id = v_split_scenario.id;

    INSERT INTO public.bp_version_audit_log (
      version_id, event_id, action, performed_by, performed_by_label, metadata
    ) VALUES (
      v_split_scenario.id, v_split_scenario.event_id, 'scenario_promoted_to_active_cascade',
      v_user_id, v_user_label,
      jsonb_build_object('parent_scenario_id', _scenario_version_id)
    );
  END LOOP;

  RETURN _scenario_version_id;
END;
$$;

-- ============================================================
-- 5. RLS: cenários só visíveis por staff
-- (As políticas existentes em event_forecasts continuam válidas
--  para version_id IS NULL — Ativa. Adicionamos restrição extra
--  para version_id NOT NULL que requer role staff.)
-- ============================================================
DROP POLICY IF EXISTS "Staff can manage scenario forecasts" ON public.event_forecasts;
CREATE POLICY "Staff can manage scenario forecasts"
ON public.event_forecasts
FOR ALL
TO authenticated
USING (
  version_id IS NULL OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  )
)
WITH CHECK (
  version_id IS NULL OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  )
);

-- ============================================================
-- 6. Garantia: state aceita 'working_draft'
-- (Se houver CHECK constraint, atualiza; caso contrário é livre.)
-- ============================================================
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.bp_versions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%state%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.bp_versions DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.bp_versions
    ADD CONSTRAINT bp_versions_state_check
    CHECK (state IN ('draft', 'active', 'superseded', 'archived', 'working_draft'));
END $$;
