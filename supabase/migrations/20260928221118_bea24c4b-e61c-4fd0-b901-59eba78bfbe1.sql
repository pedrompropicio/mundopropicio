-- #compensação ligada (28/09/2026): transaction_offsets + efeito na base.
CREATE OR REPLACE FUNCTION public._derive_paid_amount(p_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric; v_iva_rate numeric; v_status text; v_currency text;
  v_parent uuid; v_split numeric; v_reimb boolean;
  v_gross numeric; v_paid_sum numeric; v_max_paid_date date; v_closes boolean;
BEGIN
  SELECT t.amount, COALESCE(t.iva_rate, 0), t.status, COALESCE(t.currency, 'EUR'),
         t.parent_transaction_id, t.split_percentage, COALESCE(t.is_reimbursement, false)
    INTO v_amount, v_iva_rate, v_status, v_currency, v_parent, v_split, v_reimb
    FROM public.transactions t WHERE t.id = p_tx_id;
  IF v_amount IS NULL THEN RETURN; END IF;
  IF (v_parent IS NOT NULL AND v_split IS NOT NULL)
     OR v_reimb
     OR EXISTS (SELECT 1 FROM public.partner_paid_expenses p WHERE p.transaction_id = p_tx_id)
  THEN RETURN; END IF;

  v_gross := v_amount * (1 + v_iva_rate / 100.0);
  SELECT COALESCE(SUM(p.amount), 0), MAX(p.payment_date),
         COALESCE(bool_or(COALESCE(p.closes_transaction, false)), false)
    INTO v_paid_sum, v_max_paid_date, v_closes
    FROM public.transaction_payments p
   WHERE p.transaction_id = p_tx_id AND p.status = 'paid';

  IF v_paid_sum <= 0.01 THEN
    UPDATE public.transactions
       SET paid_amount = 0,
           status = CASE WHEN v_status IN ('paid','partially_paid') THEN 'approved' ELSE v_status END,
           payment_date = NULL, updated_at = now()
     WHERE id = p_tx_id;
  ELSIF v_paid_sum >= v_gross - 0.05 OR (v_currency <> 'EUR' AND v_closes) THEN
    UPDATE public.transactions
       SET paid_amount = v_paid_sum, status = 'paid',
           payment_date = COALESCE(v_max_paid_date, CURRENT_DATE), updated_at = now()
     WHERE id = p_tx_id;
  ELSE
    UPDATE public.transactions
       SET paid_amount = v_paid_sum, status = 'approved', payment_date = NULL, updated_at = now()
     WHERE id = p_tx_id;
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._derive_paid_amount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._derive_paid_amount(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public._derive_paid_amount(COALESCE(NEW.transaction_id, OLD.transaction_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TABLE public.transaction_offsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  receivable_transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  payable_transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transaction_offsets_pair_unique UNIQUE (receivable_transaction_id, payable_transaction_id)
);
CREATE INDEX transaction_offsets_payable_idx ON public.transaction_offsets(payable_transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_offsets TO authenticated;
GRANT ALL ON public.transaction_offsets TO service_role;
ALTER TABLE public.transaction_offsets ENABLE ROW LEVEL SECURITY;

CREATE POLICY transaction_offsets_select_staff ON public.transaction_offsets
  FOR SELECT TO authenticated USING (public.has_staff_role((SELECT auth.uid())));
CREATE POLICY transaction_offsets_insert_privileged ON public.transaction_offsets
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_role((SELECT auth.uid()), 'editor'::app_role));
CREATE POLICY transaction_offsets_update_privileged ON public.transaction_offsets
  FOR UPDATE TO authenticated USING (
    public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_role((SELECT auth.uid()), 'editor'::app_role))
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_role((SELECT auth.uid()), 'editor'::app_role));
CREATE POLICY transaction_offsets_delete_privileged ON public.transaction_offsets
  FOR DELETE TO authenticated USING (
    public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_role((SELECT auth.uid()), 'editor'::app_role));
CREATE POLICY company_isolation_transaction_offsets ON public.transaction_offsets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.transaction_offsets
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

CREATE OR REPLACE FUNCTION public.validate_transaction_offset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record; p record; v_sum numeric;
BEGIN
  IF NEW.receivable_transaction_id = NEW.payable_transaction_id THEN
    RAISE EXCEPTION 'Compensação: a receita e a despesa têm de ser transações diferentes.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO r FROM public.transactions WHERE id = NEW.receivable_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compensação: a receita indicada não existe.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO p FROM public.transactions WHERE id = NEW.payable_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compensação: a despesa indicada não existe.' USING ERRCODE = 'check_violation'; END IF;
  IF r.type <> 'income' THEN
    RAISE EXCEPTION 'Compensação: o lado a receber tem de ser uma receita (é "%").', r.type USING ERRCODE = 'check_violation';
  END IF;
  IF p.type <> 'expense' THEN
    RAISE EXCEPTION 'Compensação: o lado a pagar tem de ser uma despesa (é "%").', p.type USING ERRCODE = 'check_violation';
  END IF;
  IF r.company_id IS DISTINCT FROM p.company_id OR r.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Compensação: as duas transações têm de ser da mesma empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.supplier_id IS NULL OR p.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Compensação: as duas transações têm de ter fornecedor/cliente.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.supplier_id <> p.supplier_id THEN
    RAISE EXCEPTION 'Compensação: a receita e a despesa têm de ser do mesmo fornecedor/cliente.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.reversed_at IS NOT NULL OR r.status = 'reversed' OR p.reversed_at IS NOT NULL OR p.status = 'reversed' THEN
    RAISE EXCEPTION 'Compensação: não se liga uma transação estornada.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(r.is_hidden, false) OR COALESCE(p.is_hidden, false) THEN
    RAISE EXCEPTION 'Compensação: não se liga uma transação escondida.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(o.amount), 0) + NEW.amount INTO v_sum
    FROM public.transaction_offsets o
   WHERE o.receivable_transaction_id = NEW.receivable_transaction_id AND o.id <> NEW.id;
  IF v_sum > round(r.amount * (1 + COALESCE(r.iva_rate, 0) / 100.0), 2) + 0.01 THEN
    RAISE EXCEPTION 'Compensação: o total ligado à receita (% €) excede o seu valor bruto (% €).',
      round(v_sum, 2), round(r.amount * (1 + COALESCE(r.iva_rate, 0) / 100.0), 2) USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(SUM(o.amount), 0) + NEW.amount INTO v_sum
    FROM public.transaction_offsets o
   WHERE o.payable_transaction_id = NEW.payable_transaction_id AND o.id <> NEW.id;
  IF v_sum > round(p.amount * (1 + COALESCE(p.iva_rate, 0) / 100.0), 2) + 0.01 THEN
    RAISE EXCEPTION 'Compensação: o total ligado à despesa (% €) excede o seu valor bruto (% €).',
      round(v_sum, 2), round(p.amount * (1 + COALESCE(p.iva_rate, 0) / 100.0), 2) USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := COALESCE((SELECT auth.uid())::text, 'sistema');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_validate_transaction_offset
  BEFORE INSERT OR UPDATE ON public.transaction_offsets
  FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_offset();

ALTER TABLE public.transaction_payments
  ADD COLUMN offset_id uuid NULL REFERENCES public.transaction_offsets(id) ON DELETE RESTRICT;
CREATE INDEX transaction_payments_offset_id_idx ON public.transaction_payments(offset_id) WHERE offset_id IS NOT NULL;
COMMENT ON COLUMN public.transaction_payments.offset_id IS
  'Ligação de compensação (transaction_offsets) que gerou este pagamento compensation. NULL nos restantes.';

CREATE OR REPLACE FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  o record; op record; src record; oth record;
  v_other uuid; v_open numeric; v_amt numeric; v_new uuid;
BEGIN
  SELECT * INTO o FROM public.transaction_offsets WHERE id = p_offset_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO op FROM public.transaction_payments WHERE id = p_origin_payment_id;
  IF NOT FOUND OR op.payment_method = 'compensation' OR op.status <> 'paid' OR op.reversed_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF op.transaction_id = o.receivable_transaction_id THEN
    v_other := o.payable_transaction_id;
  ELSIF op.transaction_id = o.payable_transaction_id THEN
    v_other := o.receivable_transaction_id;
  ELSE
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.transaction_payments x
              WHERE x.offset_id = o.id AND x.transaction_id = v_other
                AND x.status = 'paid' AND x.reversed_at IS NULL) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO src FROM public.transactions WHERE id = op.transaction_id;
  SELECT * INTO oth FROM public.transactions WHERE id = v_other;
  SELECT round(oth.amount * (1 + COALESCE(oth.iva_rate, 0) / 100.0), 2)
         - COALESCE((SELECT SUM(x.amount) FROM public.transaction_payments x
                      WHERE x.transaction_id = v_other AND x.status IN ('planned','paid')), 0)
    INTO v_open;
  v_amt := round(LEAST(o.amount, v_open), 2);
  IF v_amt <= 0.01 THEN RETURN NULL; END IF;

  INSERT INTO public.transaction_payments (
    transaction_id, amount, payment_date, account_id, payment_method,
    payment_reference, notes, created_by, company_id, status, offset_id,
    closes_transaction, currency
  ) VALUES (
    v_other, v_amt, op.payment_date, NULL, 'compensation',
    left('Compensação com ' || COALESCE(src.description, src.id::text), 250),
    'Gerado pela ligação de compensação ' || o.id::text,
    op.created_by, oth.company_id, 'paid', o.id,
    (COALESCE(oth.currency, 'EUR') <> 'EUR' AND v_amt >= v_open - 0.05),
    'EUR'
  ) RETURNING id INTO v_new;

  -- Chamada a partir de um trigger: o sync_paid_amount_from_payments do INSERT
  -- acima corre com depth > 1 e sai sem derivar — deriva-se aqui com a MESMA
  -- função (contexto do dono do trigger). Chamada a partir da RPC (depth 0):
  -- o sync corre normalmente.
  IF pg_trigger_depth() > 0 THEN
    PERFORM public._derive_paid_amount(v_other);
  END IF;
  RETURN v_new;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._apply_transaction_offset(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record; v_other uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.transaction_payments x
              WHERE x.transaction_id = p_tx_id AND x.payment_method <> 'compensation'
                AND x.status = 'paid' AND x.reversed_at IS NULL) THEN
    RETURN;
  END IF;
  FOR o IN SELECT * FROM public.transaction_offsets
            WHERE receivable_transaction_id = p_tx_id OR payable_transaction_id = p_tx_id
  LOOP
    v_other := CASE WHEN o.receivable_transaction_id = p_tx_id
                    THEN o.payable_transaction_id ELSE o.receivable_transaction_id END;
    UPDATE public.transaction_payments
       SET status = 'reversed', reversed_at = now(), reversed_by = (SELECT auth.uid()),
           reversal_reason = 'estorno do pagamento de origem'
     WHERE offset_id = o.id AND transaction_id = v_other
       AND status = 'paid' AND reversed_at IS NULL;
    IF FOUND THEN
      PERFORM public._derive_paid_amount(v_other);
    END IF;
  END LOOP;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_transaction_offsets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_method = 'compensation' OR NEW.status <> 'paid' OR NEW.reversed_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    FOR o IN SELECT id FROM public.transaction_offsets
              WHERE receivable_transaction_id = NEW.transaction_id
                 OR payable_transaction_id = NEW.transaction_id
    LOOP
      PERFORM public._apply_transaction_offset(o.id, NEW.id);
    END LOOP;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.payment_method <> 'compensation' AND OLD.status = 'paid' AND OLD.reversed_at IS NULL
       AND (NEW.status <> 'paid' OR NEW.reversed_at IS NOT NULL) THEN
      PERFORM public._reverse_transaction_offsets_for(NEW.transaction_id);
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.payment_method <> 'compensation' AND OLD.status = 'paid' AND OLD.reversed_at IS NULL THEN
      PERFORM public._reverse_transaction_offsets_for(OLD.transaction_id);
    END IF;
    RETURN OLD;
  END IF;
END;
$function$;

CREATE TRIGGER trg_apply_transaction_offsets
  AFTER INSERT OR UPDATE OF status, reversed_at OR DELETE ON public.transaction_payments
  FOR EACH ROW EXECUTE FUNCTION public.apply_transaction_offsets();

CREATE OR REPLACE FUNCTION public.transaction_offset_create(
  p_receivable uuid, p_payable uuid, p_amount numeric, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_pay uuid;
BEGIN
  INSERT INTO public.transaction_offsets (receivable_transaction_id, payable_transaction_id, amount, note)
  VALUES (p_receivable, p_payable, round(p_amount, 2), NULLIF(trim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_id;

  SELECT x.id INTO v_pay
    FROM public.transaction_payments x
   WHERE x.transaction_id IN (p_receivable, p_payable)
     AND x.payment_method <> 'compensation' AND x.status = 'paid' AND x.reversed_at IS NULL
   ORDER BY x.payment_date DESC, x.created_at DESC
   LIMIT 1;
  IF v_pay IS NOT NULL THEN
    PERFORM public._apply_transaction_offset(v_id, v_pay);
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transaction_offset_remove(p_offset_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transaction_payments x
              WHERE x.offset_id = p_offset_id AND x.status = 'paid' AND x.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Esta compensação já foi aplicada (há um pagamento por compensação ativo). Estorna primeiro o pagamento de origem.'
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.transaction_payments SET offset_id = NULL WHERE offset_id = p_offset_id;
  DELETE FROM public.transaction_offsets WHERE id = p_offset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ligação de compensação não encontrada ou sem permissão.';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.transaction_offset_create(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transaction_offset_create(uuid, uuid, numeric, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.transaction_offset_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transaction_offset_remove(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validate_transaction_offset() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_transaction_offsets() FROM PUBLIC, anon, authenticated;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'compensacao_pendente',
  'Ligações de compensação em que um lado tem pagamento real não estornado e o outro não tem pagamento com esse offset_id.',
  'error', 'empresa', 0,
  'Compensação ligada (28/09/2026): o efeito vive no trigger trg_apply_transaction_offsets; qualquer caso aqui é compensação por aplicar.'
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description, severity = EXCLUDED.severity,
      scope = EXCLUDED.scope, notes = EXCLUDED.notes;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cB bigint; sB jsonb;
  cX bigint; sX jsonb;
  cF bigint; sF jsonb;
  cP bigint; sP jsonb;
  cT bigint; sT jsonb;
  cL bigint; sL jsonb;
  cC bigint; sC jsonb;
  cM bigint; sM jsonb;
  cO bigint; sO jsonb;
BEGIN
  WITH em_falta AS (
    SELECT c.id AS company_id, c.slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.company_id = c.id AND b.status = 'ok') AS ultimo_ok
      FROM public.companies c
     WHERE c.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.backup_runs b
          WHERE b.company_id = c.id
            AND b.status = 'ok'
            AND b.finished_at > now() - interval '30 hours'
       )
  ),
  global_falta AS (
    SELECT NULL::uuid AS company_id, 'global'::text AS slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.scope = 'global' AND b.status = 'ok') AS ultimo_ok
     WHERE NOT EXISTS (
       SELECT 1 FROM public.backup_runs b
        WHERE b.scope = 'global'
          AND b.status = 'ok'
          AND b.finished_at > now() - interval '30 hours'
     )
  ),
  bad AS (
    SELECT * FROM em_falta
    UNION ALL
    SELECT * FROM global_falta
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cB, sB FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cB, i.reference_count, (cB = i.reference_count) AS conforme,
         i.notes, sB
    FROM public.system_invariants i
   WHERE i.name = 'backup_empresa_em_falta';

  SELECT count(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('tabela', e.schema_name || '.' || e.table_name, 'motivo', e.reason))
                     FROM public.backup_excluded_tables e), '[]'::jsonb)
    INTO cX, sX FROM public.backup_excluded_tables;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cX, i.reference_count, (cX = i.reference_count) AS conforme,
         i.notes, sX
    FROM public.system_invariants i
   WHERE i.name = 'backup_tabelas_excluidas';

  WITH falhados AS (
    SELECT l.template_name, l.recipient_email, l.status, l.error_message, l.created_at
      FROM public.email_send_log l
     WHERE l.status IN ('failed','dlq')
       AND l.created_at > now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, recipient_email, status, error_message, created_at
                       FROM falhados ORDER BY created_at DESC LIMIT 6) x), '[]'::jsonb)
    INTO cF, sF FROM falhados;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cF, i.reference_count, (cF = i.reference_count) AS conforme,
         i.notes, sF
    FROM public.system_invariants i
   WHERE i.name = 'emails_falhados_24h';

  WITH presos AS (
    SELECT l.template_name, l.recipient_email, l.created_at
      FROM public.email_send_log l
     WHERE l.status = 'pending'
       AND l.created_at < now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, count(*) AS total,
                            min(created_at) AS mais_antigo, max(created_at) AS mais_recente
                       FROM presos GROUP BY template_name ORDER BY count(*) DESC LIMIT 6) x), '[]'::jsonb)
    INTO cP, sP FROM presos;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cP, i.reference_count, (cP = i.reference_count) AS conforme,
         i.notes, sP
    FROM public.system_invariants i
   WHERE i.name = 'emails_presos_pending';

  WITH grandes AS (
    SELECT n.nspname AS esquema, c.relname AS tabela, c.reltuples::bigint AS linhas
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname IN ('public','crm')
       AND c.reltuples > 1000
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT esquema, tabela, linhas FROM grandes
                      ORDER BY linhas DESC LIMIT 6) x), '[]'::jsonb)
    INTO cT, sT FROM grandes;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cT, i.reference_count, (cT = i.reference_count) AS conforme,
         i.notes, sT
    FROM public.system_invariants i
   WHERE i.name = 'tabelas_acima_de_1000';

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.date, t.description,
           t.status, t.paid_amount,
           ROUND(s.soma, 2) AS soma_linhas,
           ROUND(COALESCE(t.paid_amount, 0) - s.soma, 2) AS diferenca
      FROM public.transactions t
      JOIN LATERAL (
        SELECT SUM(p.amount) AS soma
          FROM public.transaction_payments p
         WHERE p.transaction_id = t.id
           AND p.status = 'paid'
      ) s ON s.soma IS NOT NULL
     WHERE NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
       AND COALESCE(t.is_reimbursement, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id
       )
       AND abs(COALESCE(t.paid_amount, 0) - s.soma) > 0.05
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY abs(diferenca) DESC LIMIT 5) x), '[]'::jsonb)
    INTO cL, sL FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cL, i.reference_count, (cL = i.reference_count) AS conforme,
         i.notes, sL
    FROM public.system_invariants i
   WHERE i.name = 'paid_amount_sem_linhas';

  WITH bad AS (
    SELECT l.id AS line_id, l.financial_account_id, l.statement_id,
           l.booking_date, l.description, l.amount, l.matched_by, l.matched_at
      FROM public.bank_statement_lines l
     WHERE l.status = 'matched'
       AND l.matched_transaction_id IS NULL
       AND l.created_transaction_id IS NULL
       AND l.matched_sepa_export_id IS NULL
       AND l.matched_payment_list_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.bank_line_transactions b WHERE b.line_id = l.id
       )
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY booking_date DESC LIMIT 6) x), '[]'::jsonb)
    INTO cC, sC FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cC, i.reference_count, (cC = i.reference_count) AS conforme,
         i.notes, sC
    FROM public.system_invariants i
   WHERE i.name = 'linha_conciliada_sem_transacao';

  WITH bad AS (
    SELECT p.id AS payment_id, p.transaction_id, p.currency, p.amount,
           p.original_amount, p.fx_rate, p.payment_date
      FROM public.transaction_payments p
     WHERE COALESCE(p.currency, 'EUR') <> 'EUR'
       AND (p.original_amount IS NULL OR p.fx_rate IS NULL)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY payment_date DESC LIMIT 6) x), '[]'::jsonb)
    INTO cM, sM FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cM, i.reference_count, (cM = i.reference_count) AS conforme,
         i.notes, sM
    FROM public.system_invariants i
   WHERE i.name = 'pagamento_moeda_sem_cambio';

  WITH bad AS (
    SELECT o.id AS offset_id, o.company_id, o.receivable_transaction_id, o.payable_transaction_id, o.amount
      FROM public.transaction_offsets o
     WHERE (
             EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.receivable_transaction_id
                        AND x.payment_method <> 'compensation' AND x.status = 'paid' AND x.reversed_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.payable_transaction_id AND x.offset_id = o.id
                        AND x.status = 'paid' AND x.reversed_at IS NULL)
           ) OR (
             EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.payable_transaction_id
                        AND x.payment_method <> 'compensation' AND x.status = 'paid' AND x.reversed_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.receivable_transaction_id AND x.offset_id = o.id
                        AND x.status = 'paid' AND x.reversed_at IS NULL)
           )
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cO, sO FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cO, i.reference_count, (cO = i.reference_count) AS conforme,
         i.notes, sO
    FROM public.system_invariants i
   WHERE i.name = 'compensacao_pendente';
END;
$function$;