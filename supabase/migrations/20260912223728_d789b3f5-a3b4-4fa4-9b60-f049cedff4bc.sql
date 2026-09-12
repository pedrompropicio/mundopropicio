-- 1) event_settlements
CREATE TABLE public.event_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.event_settlements(id) ON DELETE CASCADE,
  parent_share_pct numeric,
  parent_share_basis text CHECK (parent_share_basis IN ('net_result','net_result_gross_expenses')),
  position int NOT NULL DEFAULT 0,
  is_sealed boolean NOT NULL DEFAULT false,
  sealed_bp_version_id uuid REFERENCES public.bp_versions(id),
  sealed_at timestamptz, sealed_by uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_settlements_root_no_share CHECK (
    (parent_id IS NULL AND parent_share_pct IS NULL AND parent_share_basis IS NULL)
    OR (parent_id IS NOT NULL AND parent_share_pct IS NOT NULL
        AND parent_share_pct >= 0 AND parent_share_pct <= 100
        AND parent_share_basis IS NOT NULL))
);
CREATE UNIQUE INDEX event_settlements_one_root_per_event
  ON public.event_settlements(event_id) WHERE parent_id IS NULL;
CREATE INDEX event_settlements_event_idx ON public.event_settlements(event_id);
CREATE INDEX event_settlements_parent_idx ON public.event_settlements(parent_id);

-- 2) event_settlement_participants
CREATE TABLE public.event_settlement_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.event_settlements(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  participant_kind text NOT NULL CHECK (participant_kind IN ('house','partner')),
  supplier_id uuid REFERENCES public.suppliers(id),
  event_partner_id uuid REFERENCES public.event_partners(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'settles' CHECK (mode IN ('settles','nominal')),
  profit_pct numeric NOT NULL DEFAULT 0,
  loss_pct numeric,
  expense_includes_iva boolean,
  can_order boolean NOT NULL DEFAULT true,
  can_pay boolean NOT NULL DEFAULT false,
  visible_in_docs boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esp_kind_supplier CHECK (
    (participant_kind = 'house' AND supplier_id IS NULL)
    OR (participant_kind = 'partner' AND supplier_id IS NOT NULL))
);
CREATE UNIQUE INDEX esp_unique_partner ON public.event_settlement_participants(settlement_id, supplier_id)
  WHERE participant_kind = 'partner';
CREATE UNIQUE INDEX esp_unique_house ON public.event_settlement_participants(settlement_id)
  WHERE participant_kind = 'house';
CREATE INDEX esp_settlement_idx ON public.event_settlement_participants(settlement_id);
CREATE INDEX esp_event_partner_idx ON public.event_settlement_participants(event_partner_id);

-- 3) GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_settlements TO authenticated;
GRANT ALL ON public.event_settlements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_settlement_participants TO authenticated;
GRANT ALL ON public.event_settlement_participants TO service_role;

-- 4) RLS
ALTER TABLE public.event_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settlement_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event settlements viewable by authenticated" ON public.event_settlements
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Event settlements insertable by admin or manager" ON public.event_settlements
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Event settlements updatable by admin or manager" ON public.event_settlements
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Event settlements deletable by admin or manager" ON public.event_settlements
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY company_isolation_event_settlements ON public.event_settlements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

CREATE POLICY "Settlement participants viewable by authenticated" ON public.event_settlement_participants
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY esp_select_partner ON public.event_settlement_participants
  FOR SELECT TO authenticated USING (
    user_has_event_access(auth.uid(), event_id) AND supplier_id IS NOT NULL
    AND supplier_id = user_supplier_id(auth.uid()));
CREATE POLICY "Settlement participants insertable by admin or manager" ON public.event_settlement_participants
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Settlement participants updatable by admin or manager" ON public.event_settlement_participants
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "Settlement participants deletable by admin or manager" ON public.event_settlement_participants
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY company_isolation_esp ON public.event_settlement_participants
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());

-- 5) updated_at + company_id
CREATE TRIGGER update_event_settlements_updated_at BEFORE UPDATE ON public.event_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.event_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
CREATE TRIGGER update_esp_updated_at BEFORE UPDATE ON public.event_settlement_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.event_settlement_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

-- 6) Integridade
CREATE OR REPLACE FUNCTION public.validate_settlement_participant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_event uuid; v_parent uuid;
BEGIN
  SELECT event_id, parent_id INTO v_event, v_parent
    FROM public.event_settlements WHERE id = NEW.settlement_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Apuramento % não existe', NEW.settlement_id; END IF;
  IF NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'O participante tem de pertencer ao mesmo evento do apuramento'; END IF;
  IF NEW.participant_kind = 'house' AND v_parent IS NOT NULL THEN
    RAISE EXCEPTION 'A casa só existe no apuramento raiz do evento'; END IF;
  IF NEW.mode = 'settles' AND NEW.participant_kind = 'partner' THEN
    IF EXISTS (
      SELECT 1 FROM public.event_settlement_participants p
      WHERE p.event_id = NEW.event_id AND p.supplier_id = NEW.supplier_id
        AND p.mode = 'settles' AND p.id <> COALESCE(NEW.id, gen_random_uuid())
    ) THEN
      RAISE EXCEPTION 'Este sócio já é pago por outro apuramento deste evento (só pode haver um "settles")';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_settlement_participant
  BEFORE INSERT OR UPDATE ON public.event_settlement_participants
  FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_participant();

-- 7) Espelho TEMPORÁRIO de event_partners
CREATE OR REPLACE FUNCTION public.event_settlement_sync_root(_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_root uuid; v_company uuid; v_profit numeric; v_loss numeric;
BEGIN
  SELECT id INTO v_root FROM public.event_settlements
    WHERE event_id = _event_id AND parent_id IS NULL;
  IF v_root IS NULL THEN
    SELECT company_id INTO v_company FROM public.events WHERE id = _event_id;
    INSERT INTO public.event_settlements (event_id, company_id, name)
    VALUES (_event_id, v_company, 'Fecho do evento') RETURNING id INTO v_root;
  END IF;
  SELECT company_id INTO v_company FROM public.event_settlements WHERE id = v_root;
  INSERT INTO public.event_settlement_participants (
    settlement_id, event_id, company_id, participant_kind, supplier_id,
    event_partner_id, mode, profit_pct, loss_pct, expense_includes_iva, can_order, can_pay)
  SELECT v_root, ep.event_id, v_company, 'partner', ep.supplier_id, ep.id, 'settles',
         ep.percentage, ep.loss_percentage, ep.expense_includes_iva, ep.can_order, ep.can_pay
  FROM public.event_partners ep WHERE ep.event_id = _event_id
    AND NOT EXISTS (SELECT 1 FROM public.event_settlement_participants p
                    WHERE p.event_partner_id = ep.id);
  UPDATE public.event_settlement_participants p
     SET supplier_id = ep.supplier_id, profit_pct = ep.percentage, loss_pct = ep.loss_percentage,
         expense_includes_iva = ep.expense_includes_iva, can_order = ep.can_order,
         can_pay = ep.can_pay, settlement_id = v_root, updated_at = now()
    FROM public.event_partners ep
   WHERE p.event_partner_id = ep.id AND ep.event_id = _event_id;
  DELETE FROM public.event_settlement_participants p
   WHERE p.event_id = _event_id AND p.event_partner_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.event_partners ep WHERE ep.id = p.event_partner_id);
  SELECT 100 - COALESCE(SUM(percentage),0),
         100 - COALESCE(SUM(COALESCE(loss_percentage, percentage)),0)
    INTO v_profit, v_loss
    FROM public.event_partners WHERE event_id = _event_id;
  IF EXISTS (SELECT 1 FROM public.event_settlement_participants
             WHERE settlement_id = v_root AND participant_kind = 'house') THEN
    UPDATE public.event_settlement_participants
       SET profit_pct = v_profit, loss_pct = v_loss, updated_at = now()
     WHERE settlement_id = v_root AND participant_kind = 'house';
  ELSE
    INSERT INTO public.event_settlement_participants (
      settlement_id, event_id, company_id, participant_kind, mode, profit_pct, loss_pct)
    VALUES (v_root, _event_id, v_company, 'house', 'settles', v_profit, v_loss);
  END IF;
  RETURN v_root;
END $$;
REVOKE EXECUTE ON FUNCTION public.event_settlement_sync_root(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_settlement_sync_root(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_event_partners_mirror()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.event_settlement_sync_root(COALESCE(NEW.event_id, OLD.event_id));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_event_partners_mirror_ins AFTER INSERT OR UPDATE OR DELETE ON public.event_partners
  FOR EACH ROW EXECUTE FUNCTION public.trg_event_partners_mirror();

-- 8) Migração de dados (só INSERT)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT event_id FROM public.event_partners LOOP
    PERFORM public.event_settlement_sync_root(r.event_id);
  END LOOP;
END $$;