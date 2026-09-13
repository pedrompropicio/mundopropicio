-- 1) Operações de terceiros
CREATE TABLE public.event_third_party_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  kind text NOT NULL CHECK (kind IN ('ab_bebidas','ab_alimentos','bengaleiro','merchandising','estacionamento','outro')),
  name text NOT NULL,
  operator_supplier_id uuid REFERENCES public.suppliers(id),
  source text NOT NULL CHECK (source IN ('ab_module','manual')),
  gross_amount numeric,
  operator_result numeric,
  document_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT etpo_ab_from_module CHECK (
    (kind IN ('ab_bebidas','ab_alimentos')
       AND source = 'ab_module' AND gross_amount IS NULL AND operator_result IS NULL)
    OR (kind NOT IN ('ab_bebidas','ab_alimentos') AND source = 'manual'))
);
CREATE UNIQUE INDEX etpo_one_ab_kind_per_event
  ON public.event_third_party_operations(event_id, kind)
  WHERE kind IN ('ab_bebidas','ab_alimentos');
CREATE INDEX etpo_event_idx ON public.event_third_party_operations(event_id);

-- 2) Participação por apuramento
CREATE TABLE public.event_operation_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL REFERENCES public.event_third_party_operations(id) ON DELETE CASCADE,
  settlement_id uuid NOT NULL REFERENCES public.event_settlements(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  mode text NOT NULL CHECK (mode IN ('gross_pct','result_share','per_capita','fee')),
  pct numeric, amount numeric, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eop_mode_fields CHECK (
    (mode IN ('gross_pct','result_share') AND pct IS NOT NULL AND pct >= 0 AND pct <= 100 AND amount IS NULL)
    OR (mode IN ('per_capita','fee') AND amount IS NOT NULL AND pct IS NULL))
);
CREATE UNIQUE INDEX eop_unique_operation_settlement
  ON public.event_operation_participations(operation_id, settlement_id);
CREATE INDEX eop_settlement_idx ON public.event_operation_participations(settlement_id);

-- 3) GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_third_party_operations TO authenticated;
GRANT ALL ON public.event_third_party_operations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_operation_participations TO authenticated;
GRANT ALL ON public.event_operation_participations TO service_role;

-- 4) RLS
ALTER TABLE public.event_third_party_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_operation_participations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operations viewable by authenticated" ON public.event_third_party_operations
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Operations insertable by admin or manager" ON public.event_third_party_operations
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Operations updatable by admin or manager" ON public.event_third_party_operations
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Operations deletable by admin or manager" ON public.event_third_party_operations
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY company_isolation_etpo ON public.event_third_party_operations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY "Participations viewable by authenticated" ON public.event_operation_participations
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Participations insertable by admin or manager" ON public.event_operation_participations
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Participations updatable by admin or manager" ON public.event_operation_participations
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Participations deletable by admin or manager" ON public.event_operation_participations
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY company_isolation_eop ON public.event_operation_participations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- 5) updated_at + company_id
CREATE TRIGGER update_etpo_updated_at BEFORE UPDATE ON public.event_third_party_operations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.event_third_party_operations
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
CREATE TRIGGER update_eop_updated_at BEFORE UPDATE ON public.event_operation_participations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.event_operation_participations
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- 6) Integridade
CREATE OR REPLACE FUNCTION public.validate_operation_participation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_op_event uuid; v_st_event uuid; v_sealed boolean;
BEGIN
  SELECT event_id INTO v_op_event FROM public.event_third_party_operations WHERE id = NEW.operation_id;
  SELECT event_id, is_sealed INTO v_st_event, v_sealed FROM public.event_settlements WHERE id = NEW.settlement_id;
  IF v_op_event IS NULL OR v_st_event IS NULL THEN
    RAISE EXCEPTION 'Operação ou apuramento inexistente'; END IF;
  IF v_op_event <> v_st_event OR NEW.event_id <> v_st_event THEN
    RAISE EXCEPTION 'A operação e o apuramento têm de pertencer ao mesmo evento'; END IF;
  IF v_sealed THEN
    RAISE EXCEPTION 'Apuramento selado: a participação não pode ser alterada'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_operation_participation
  BEFORE INSERT OR UPDATE ON public.event_operation_participations
  FOR EACH ROW EXECUTE FUNCTION public.validate_operation_participation();