-- ============================================================
-- Épica #146 (e) — Fase 1: inversão do espelho + RLS estanque
-- ============================================================

-- 0) Snapshot de prova (antes de qualquer alteração)
CREATE TABLE IF NOT EXISTS public.event_partners_mirror_inversion_proof (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  taken_at timestamptz NOT NULL DEFAULT now(),
  phase text NOT NULL,
  event_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  percentage numeric,
  loss_percentage numeric,
  expense_includes_iva boolean,
  can_order boolean,
  can_pay boolean
);
COMMENT ON TABLE public.event_partners_mirror_inversion_proof IS
  'Prova de auditoria da inversão do espelho event_partners <- event_settlement_participants (épica #146e, fase 1).';
GRANT ALL ON public.event_partners_mirror_inversion_proof TO service_role;
GRANT SELECT ON public.event_partners_mirror_inversion_proof TO authenticated;
ALTER TABLE public.event_partners_mirror_inversion_proof ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mirror proof readable by admin" ON public.event_partners_mirror_inversion_proof;
CREATE POLICY "mirror proof readable by admin"
  ON public.event_partners_mirror_inversion_proof FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role));

INSERT INTO public.event_partners_mirror_inversion_proof
  (phase, event_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay)
SELECT 'before', event_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay
FROM public.event_partners;

-- 1) Remover o espelho antigo (event_partners -> participantes)
DROP TRIGGER IF EXISTS trg_event_partners_mirror_ins ON public.event_partners;
DROP TRIGGER IF EXISTS trg_event_partners_mirror_upd ON public.event_partners;
DROP TRIGGER IF EXISTS trg_event_partners_mirror_del ON public.event_partners;
DROP FUNCTION IF EXISTS public.trg_event_partners_mirror();
DROP FUNCTION IF EXISTS public.event_settlement_sync_root(uuid);

-- 2) FK: apagar um sócio derivado não pode apagar o participante (fonte de verdade)
ALTER TABLE public.event_settlement_participants
  DROP CONSTRAINT IF EXISTS event_settlement_participants_event_partner_id_fkey;
ALTER TABLE public.event_settlement_participants
  ADD CONSTRAINT event_settlement_participants_event_partner_id_fkey
  FOREIGN KEY (event_partner_id) REFERENCES public.event_partners(id) ON DELETE SET NULL;

COMMENT ON TABLE public.event_partners IS
  'DERIVADA (épica #146e): preenchida automaticamente a partir de event_settlement_participants (mode = settles, participant_kind = partner). Não editar directamente. Mantida porque paying_partner_id/ordering_partner_id, partner_capital_moves, partner_paid_expenses, partner_advance_expenses, event_partner_extras e event_forecast_partners apontam para event_partners.id.';

-- 3) Novo sync: participantes -> event_partners
CREATE OR REPLACE FUNCTION public.event_partners_sync_from_settlements(_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_count integer := 0;
BEGIN
  SELECT company_id INTO v_company FROM public.events WHERE id = _event_id;
  IF v_company IS NULL THEN RETURN 0; END IF;

  -- apagar sócios derivados que já não têm participante "settles"
  DELETE FROM public.event_partners ep
   WHERE ep.event_id = _event_id
     AND NOT EXISTS (
       SELECT 1 FROM public.event_settlement_participants p
        WHERE p.event_id = _event_id
          AND p.participant_kind = 'partner'
          AND p.mode = 'settles'
          AND p.supplier_id = ep.supplier_id
     );

  -- actualizar os existentes (só quando algo muda)
  UPDATE public.event_partners ep
     SET percentage = p.profit_pct,
         loss_percentage = p.loss_pct,
         expense_includes_iva = p.expense_includes_iva,
         can_order = p.can_order,
         can_pay = p.can_pay,
         updated_at = now()
    FROM public.event_settlement_participants p
   WHERE p.event_id = _event_id
     AND p.participant_kind = 'partner'
     AND p.mode = 'settles'
     AND p.supplier_id = ep.supplier_id
     AND ep.event_id = _event_id
     AND (ep.percentage, ep.loss_percentage, ep.expense_includes_iva, ep.can_order, ep.can_pay)
         IS DISTINCT FROM
         (p.profit_pct, p.loss_pct, p.expense_includes_iva, p.can_order, p.can_pay);

  -- inserir os novos
  INSERT INTO public.event_partners
    (event_id, company_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay)
  SELECT _event_id, v_company, p.supplier_id, p.profit_pct, p.loss_pct,
         p.expense_includes_iva, p.can_order, p.can_pay
    FROM public.event_settlement_participants p
   WHERE p.event_id = _event_id
     AND p.participant_kind = 'partner'
     AND p.mode = 'settles'
     AND p.supplier_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.event_partners ep
        WHERE ep.event_id = _event_id AND ep.supplier_id = p.supplier_id
     );

  -- back-link
  UPDATE public.event_settlement_participants p
     SET event_partner_id = ep.id
    FROM public.event_partners ep
   WHERE p.event_id = _event_id
     AND p.participant_kind = 'partner'
     AND p.mode = 'settles'
     AND p.supplier_id = ep.supplier_id
     AND ep.event_id = _event_id
     AND p.event_partner_id IS DISTINCT FROM ep.id;

  SELECT count(*) INTO v_count FROM public.event_partners WHERE event_id = _event_id;
  RETURN v_count;
END $function$;

REVOKE ALL ON FUNCTION public.event_partners_sync_from_settlements(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_partners_sync_from_settlements(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.event_partners_sync_from_settlements(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.event_partners_sync_from_settlements(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_esp_sync_event_partners()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.event_partners_sync_from_settlements(COALESCE(NEW.event_id, OLD.event_id));
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_esp_sync_event_partners ON public.event_settlement_participants;
CREATE TRIGGER trg_esp_sync_event_partners
AFTER INSERT OR UPDATE OR DELETE ON public.event_settlement_participants
FOR EACH ROW EXECUTE FUNCTION public.trg_esp_sync_event_partners();

-- 4) Helpers de visibilidade estanque
CREATE OR REPLACE FUNCTION public.is_settlement_staff(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user
       AND ur.role IN ('admin','platform_admin','manager','editor','viewer',
                       'accountant','marketing_manager','producer','field_producer',
                       'content_manager','user')
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_settlement_ids(_user uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT DISTINCT p.settlement_id
    FROM public.event_settlement_participants p
   WHERE p.supplier_id IS NOT NULL
     AND p.supplier_id = public.user_supplier_id(_user);
$function$;

CREATE OR REPLACE FUNCTION public.user_settlement_visible_ids(_user uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH RECURSIVE own AS (
    SELECT s.id, s.parent_id
      FROM public.event_settlements s
     WHERE s.id IN (SELECT public.user_settlement_ids(_user))
    UNION
    SELECT s.id, s.parent_id
      FROM public.event_settlements s
      JOIN own o ON o.parent_id = s.id
  )
  SELECT DISTINCT id FROM own;
$function$;

CREATE OR REPLACE FUNCTION public.settlement_local_partners_pct(_settlement_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT GREATEST(0, 100 - COALESCE((
    SELECT SUM(p.profit_pct)
      FROM public.event_settlement_participants p
     WHERE p.settlement_id = _settlement_id
       AND p.participant_kind = 'partner'
       AND p.mode = 'settles'
  ), 0));
$function$;

REVOKE ALL ON FUNCTION public.is_settlement_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_settlement_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_settlement_visible_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settlement_local_partners_pct(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_settlement_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_settlement_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_settlement_visible_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settlement_local_partners_pct(uuid) TO authenticated, service_role;

-- 5) RLS estanque (SELECT)
DROP POLICY IF EXISTS "Event settlements viewable by authenticated" ON public.event_settlements;
DROP POLICY IF EXISTS "event_settlements_select_partner" ON public.event_settlements;
CREATE POLICY "event_settlements_select_scoped"
  ON public.event_settlements FOR SELECT TO authenticated
  USING (
    public.is_settlement_staff(auth.uid())
    OR id IN (SELECT public.user_settlement_visible_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Settlement participants viewable by authenticated" ON public.event_settlement_participants;
DROP POLICY IF EXISTS "esp_select_partner" ON public.event_settlement_participants;
CREATE POLICY "esp_select_scoped"
  ON public.event_settlement_participants FOR SELECT TO authenticated
  USING (
    public.is_settlement_staff(auth.uid())
    OR (supplier_id IS NOT NULL AND supplier_id = public.user_supplier_id(auth.uid()))
  );

DROP POLICY IF EXISTS "Third party operations viewable by authenticated" ON public.event_third_party_operations;
DROP POLICY IF EXISTS "Operations viewable by authenticated" ON public.event_third_party_operations;
CREATE POLICY "etpo_select_scoped"
  ON public.event_third_party_operations FOR SELECT TO authenticated
  USING (
    public.is_settlement_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.event_operation_participations op
       WHERE op.operation_id = public.event_third_party_operations.id
         AND op.settlement_id IN (SELECT public.user_settlement_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Participations viewable by authenticated" ON public.event_operation_participations;
CREATE POLICY "eop_select_scoped"
  ON public.event_operation_participations FOR SELECT TO authenticated
  USING (
    public.is_settlement_staff(auth.uid())
    OR settlement_id IN (SELECT public.user_settlement_ids(auth.uid()))
  );

-- 6) Sync em todos os eventos com apuramento + prova
DO $$
DECLARE r record; v_diff integer;
BEGIN
  FOR r IN SELECT DISTINCT event_id FROM public.event_settlements LOOP
    PERFORM public.event_partners_sync_from_settlements(r.event_id);
  END LOOP;

  INSERT INTO public.event_partners_mirror_inversion_proof
    (phase, event_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay)
  SELECT 'after', event_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay
  FROM public.event_partners;

  SELECT count(*) INTO v_diff FROM (
    SELECT event_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay
      FROM public.event_partners_mirror_inversion_proof WHERE phase = 'before'
    EXCEPT ALL
    SELECT event_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay
      FROM public.event_partners_mirror_inversion_proof WHERE phase = 'after'
  ) d;

  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'PROVA FALHOU: % linhas de event_partners divergem apos a inversao do espelho', v_diff;
  END IF;

  SELECT count(*) INTO v_diff FROM (
    SELECT event_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay
      FROM public.event_partners_mirror_inversion_proof WHERE phase = 'after'
    EXCEPT ALL
    SELECT event_id, supplier_id, percentage, loss_percentage, expense_includes_iva, can_order, can_pay
      FROM public.event_partners_mirror_inversion_proof WHERE phase = 'before'
  ) d;

  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'PROVA FALHOU: % linhas extra em event_partners apos a inversao do espelho', v_diff;
  END IF;
END $$;