-- Issue #562 — isolamento de empresas de treino — 03/11/2026.
-- Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim.
-- Autorização de preparação: 6609881059; sem SQL Live, deploy, seed ou cron.
-- Rollback: supabase/manual/rollback_0308_issue562_training_companies_comentado.sql
-- ENTREGA PARCIAL: ver docs/testes/issue562/inventario.md antes de promover.
-- Sem BEGIN/COMMIT; os INSERT/UPDATE abaixo pertencem apenas a corpos de funções.

ALTER TABLE public.companies ADD COLUMN is_training boolean NOT NULL DEFAULT false;
ALTER TABLE public.invariant_runs ADD COLUMN scope_training boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.is_training_company(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.is_training);
$function$;
REVOKE EXECUTE ON FUNCTION public.is_training_company(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_training_company(uuid) TO authenticated, service_role;

CREATE FUNCTION public.issue562_guard_training_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NOT NEW.is_training THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_training IS NOT DISTINCT FROM OLD.is_training THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND NOT COALESCE(public.has_role(auth.uid(), 'platform_admin'), false) THEN
    RAISE EXCEPTION 'training_company_platform_admin_required';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_training AND NOT NEW.is_training AND (
    EXISTS (SELECT 1 FROM public.transactions t WHERE t.company_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.company_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.suppliers s WHERE s.company_id = OLD.id)
  ) THEN RAISE EXCEPTION 'training_company_has_data'; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER issue562_training_flag BEFORE INSERT OR UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.issue562_guard_training_flag();

CREATE FUNCTION public.issue562_no_integrations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF public.is_training_company(NEW.company_id) THEN
    RAISE EXCEPTION 'training_company_no_integrations';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON public.ticketline_sync_config
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON public.bol_sync_config
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON public.fever_sync_config
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON crm.ad_platform_connections
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON public.artist_channel_connections
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON public.camarim_integrations
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON public.card_integrations
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON public.data_entry_gmail_connections
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();
CREATE TRIGGER issue562_no_integrations BEFORE INSERT OR UPDATE ON public.email_campaigns
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_integrations();

-- The existing CHECKs already allow skipped/suppressed; rate_limited is NOT added.
CREATE FUNCTION public.issue562_suppress_output()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF NEW.company_id IS NULL OR NOT public.is_training_company(NEW.company_id) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'notification_queue' THEN
    NEW.status := 'skipped'; NEW.last_error := 'suppressed_training';
  ELSIF TG_TABLE_NAME = 'system_reminders' THEN
    NEW.is_active := false; NEW.completed_at := now();
    NEW.message := concat_ws(E'\n', NEW.message, 'suppressed_training');
  ELSIF TG_TABLE_NAME = 'email_send_log' THEN
    NEW.status := 'suppressed'; NEW.error_message := 'suppressed_training';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER issue562_suppress_output BEFORE INSERT ON public.notification_queue
FOR EACH ROW EXECUTE FUNCTION public.issue562_suppress_output();
CREATE TRIGGER issue562_suppress_output BEFORE INSERT ON public.system_reminders
FOR EACH ROW EXECUTE FUNCTION public.issue562_suppress_output();
CREATE TRIGGER issue562_suppress_output BEFORE INSERT ON public.email_send_log
FOR EACH ROW EXECUTE FUNCTION public.issue562_suppress_output();

CREATE FUNCTION public.issue562_no_real_export()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_company uuid;
BEGIN
  IF TG_TABLE_NAME = 'payment_list_sepa_exports' THEN
    SELECT p.company_id INTO v_company FROM public.payment_lists p WHERE p.id = NEW.payment_list_id;
  ELSE v_company := NEW.company_id;
  END IF;
  IF public.is_training_company(v_company) THEN RAISE EXCEPTION 'training_company_no_real_export'; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER issue562_no_real_export BEFORE INSERT ON public.payment_list_sepa_exports
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_real_export();
CREATE TRIGGER issue562_no_real_export BEFORE INSERT ON public.accounting_exports
FOR EACH ROW EXECUTE FUNCTION public.issue562_no_real_export();
REVOKE EXECUTE ON FUNCTION public.issue562_guard_training_flag() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue562_guard_training_flag() TO service_role;
REVOKE EXECUTE ON FUNCTION public.issue562_no_integrations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue562_no_integrations() TO service_role;
REVOKE EXECUTE ON FUNCTION public.issue562_suppress_output() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue562_suppress_output() TO service_role;
REVOKE EXECUTE ON FUNCTION public.issue562_no_real_export() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue562_no_real_export() TO service_role;

-- Latest versioned base: drizzle/migrations/0052_derp_remove_tx_paga_sem_linha_ref_paid_157.sql
-- SHA256 of exact CREATE FUNCTION: e85ae91af6fe82375ddaaca9734cf2e798b10ab37be757c5c327cb7ba18412dd
CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint; c6 bigint;
  c7 bigint; c8 bigint; c9 bigint; c10 bigint; c12 bigint;
  c13 bigint; c14 bigint; c15 bigint; c16 bigint; c17 bigint; c18 bigint;
  c19 bigint; c20 bigint; c21 bigint; c22 bigint;
  s1 jsonb; s2 jsonb; s3 jsonb; s4 jsonb; s5 jsonb; s6 jsonb;
  s7 jsonb; s8 jsonb; s9 jsonb; s10 jsonb; s12 jsonb;
  s13 jsonb; s14 jsonb; s15 jsonb; s16 jsonb; s17 jsonb; s18 jsonb;
  s19 jsonb; s20 jsonb; s21 jsonb; s22 jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, s.company_id AS supplier_company, s.name AS supplier_name
      FROM public.transactions t
      JOIN public.suppliers s ON s.id = t.supplier_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.company_id IS DISTINCT FROM s.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c1, s1 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, a.company_id AS account_company, a.name AS account_name
      FROM public.transactions t
      JOIN public.financial_accounts a ON a.id = t.account_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.company_id IS DISTINCT FROM a.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c2, s2 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, e.company_id AS event_company, e.name AS event_name
      FROM public.transactions t
      JOIN public.events e ON e.id = t.event_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.company_id IS DISTINCT FROM e.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c3, s3 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.company_id AS tx_company, c.company_id AS category_company, c.code AS category_code
      FROM public.transactions t
      JOIN public.account_categories c ON c.id = t.category_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND c.company_id IS NOT NULL
       AND t.company_id IS DISTINCT FROM c.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c4, s4 FROM bad;

  WITH bad AS (
    SELECT x.id AS map_id, x.company_id AS map_company, s.company_id AS supplier_company, s.name AS supplier_name
      FROM public.coala_supplier_category_map x
      JOIN public.suppliers s ON s.id = x.supplier_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)))
       AND x.company_id IS DISTINCT FROM s.company_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(y)) FROM (SELECT * FROM bad LIMIT 5) y), '[]'::jsonb)
    INTO c5, s5 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.parent_transaction_id, t.account_id, t.company_id
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.parent_transaction_id IS NOT NULL
       AND t.installment_group_id IS NULL
       AND t.account_id IS NOT NULL
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c6, s6 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.type, t.company_id
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.type NOT IN ('income','expense')
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c7, s7 FROM bad;

  WITH bad AS (
    SELECT s.company_id, s.iban, count(*) AS fornecedores, string_agg(s.name, ' | ') AS nomes
      FROM public.suppliers s
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = s.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = s.company_id AND training_c.is_training)))
       AND s.is_active AND s.iban IS NOT NULL AND s.iban <> ''
     GROUP BY s.company_id, s.iban
    HAVING count(*) > 1
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c8, s8 FROM bad;

  WITH bad AS (
    SELECT t.id AS settlement_id, t.event_id, t.net_calculated, t.net_adjusted, t.net_transferred
      FROM public.ticket_office_settlements t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.status = 'confirmed'
       AND COALESCE(t.net_transferred, 0) = 0
       AND COALESCE(t.net_adjusted, t.net_calculated) > 0.01
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c9, s9 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.description, t.amount, t.iva_rate, t.paid_amount, t.company_id
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.paid_amount IS NOT NULL
       AND t.paid_amount > ROUND(t.amount * (1 + COALESCE(t.iva_rate,0)/100.0), 2) + 0.02
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c10, s10 FROM bad;

  WITH bad AS (
    SELECT con.conrelid::regclass::text AS tabela, con.confrelid::regclass::text AS referenciada, count(*) AS fks
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE NOT _training AND con.contype = 'f' AND nsp.nspname = 'public'
     GROUP BY 1, 2
    HAVING count(*) > 1
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY fks DESC, tabela LIMIT 5) x), '[]'::jsonb)
    INTO c12, s12 FROM bad;

  WITH bad AS (
    SELECT f.id AS forecast_id, f.company_id, f.event_id, f.description, c.code AS category_code
      FROM public.event_forecasts f
      JOIN public.account_categories c ON c.id = f.category_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = f.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = f.company_id AND training_c.is_training)))
       AND f.type = 'expense'
       AND f.version_id IS NULL
       AND EXISTS (SELECT 1 FROM public.account_categories k WHERE k.parent_id = c.id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c13, s13 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.event_id, t.description
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.event_id IS NOT NULL AND t.category_id IS NULL
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c14, s14 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.event_id AS tx_event, f.event_id AS forecast_event, t.description
      FROM public.transactions t
      JOIN public.event_forecasts f ON f.id = t.forecast_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.event_id IS NOT NULL AND t.event_id IS DISTINCT FROM f.event_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c15, s15 FROM bad;

  WITH bad AS (
    SELECT f.id AS forecast_id, f.company_id, f.event_id, f.description,
           t.id AS anchor_transaction_id, t.forecast_id AS tx_forecast_id
      FROM public.event_forecasts f
      JOIN public.transactions t ON t.id = f.transaction_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = f.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = f.company_id AND training_c.is_training)))
       AND f.version_id IS NULL AND t.forecast_id IS DISTINCT FROM f.id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c16, s16 FROM bad;

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.forecast_id, t.event_id, t.description
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.forecast_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.event_forecasts f WHERE f.id = t.forecast_id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 5) x), '[]'::jsonb)
    INTO c17, s17 FROM bad;

  WITH bad AS (
    SELECT p.proname AS function_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE NOT _training AND n.nspname = 'public'
       AND p.prorettype = 'trigger'::regtype
       AND NOT EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgfoid = p.oid AND NOT tg.tgisinternal)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY function_name LIMIT 5) x), '[]'::jsonb)
    INTO c18, s18 FROM bad;

  WITH bad AS (
    SELECT a.invoice_group_id,
           max(a.run_at) AS ultimo_run_at,
           count(*) AS linhas_auditadas,
           (SELECT count(*) FROM public.transactions t WHERE t.invoice_group_id = a.invoice_group_id) AS transacoes_agrupadas
      FROM public.invoice_group_audit a
     WHERE EXISTS (SELECT 1 FROM public.transactions training_t WHERE training_t.invoice_group_id = a.invoice_group_id AND ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = training_t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = training_t.company_id AND training_c.is_training))))
       AND a.veredicto = 'desagrupar'
       AND a.aplicado = false
       AND a.invoice_group_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.transactions t WHERE t.invoice_group_id = a.invoice_group_id)
     GROUP BY a.invoice_group_id
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY ultimo_run_at DESC LIMIT 5) x), '[]'::jsonb)
    INTO c19, s19 FROM bad;

  -- D-ERP70: a mae do rateio e a fatura inteira; as filhas sao a decomposicao por evento.
  -- Soma das filhas <> valor da mae => valor sem evento atribuido, invisivel no DRE de evento.
  -- Exclui parcelas de pagamento (installment_group_id preenchido).
  WITH bad AS (
    SELECT m.id AS mae_transaction_id, m.company_id, m.date, m.description, m.invoice_ref,
           m.amount AS valor_mae,
           ROUND(f.soma, 2) AS soma_filhas,
           f.n_filhas,
           ROUND(m.amount - f.soma, 2) AS diferenca,
           ROUND((m.amount * (1 + COALESCE(m.iva_rate,0) / 100.0))::numeric, 2) AS bruto_mae,
           f.soma_bruto AS soma_bruto_filhas
      FROM public.transactions m
      JOIN LATERAL (
        SELECT SUM(c.amount) AS soma, count(*) AS n_filhas,
               SUM(ROUND((c.amount * (1 + COALESCE(c.iva_rate,0) / 100.0))::numeric, 2)) AS soma_bruto
          FROM public.transactions c
         WHERE c.parent_transaction_id = m.id
           AND c.installment_group_id IS NULL
      ) f ON f.n_filhas > 0
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = m.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = m.company_id AND training_c.is_training)))
       AND m.parent_transaction_id IS NULL
       AND (abs(m.amount - f.soma) > 0.05
            -- #285 (09/10/2026): também acende quando o BRUTO não bate (IVA divergente mãe/filhas).
            OR abs(ROUND((m.amount * (1 + COALESCE(m.iva_rate,0) / 100.0))::numeric, 2) - f.soma_bruto) > 0.05)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY abs(diferenca) DESC LIMIT 5) x), '[]'::jsonb)
    INTO c20, s20 FROM bad;

  -- D-ERP80: a transitoria diz porque. Extra do Socio declarado tem de ter linha em partner_advance_expenses.
  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.event_id, t.date, t.description, t.amount
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND t.is_transitory
       AND t.transitory_reason = 'partner_advance'
       AND NOT EXISTS (SELECT 1 FROM public.partner_advance_expenses p WHERE p.transaction_id = t.id)
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY amount DESC LIMIT 5) x), '[]'::jsonb)
    INTO c21, s21 FROM bad;

  -- #201: carga de cartao marcada como paga (marca visual) e ainda sem perna de
  -- entrada. O trigger card_load_on_out_paid so dispara com status='paid', logo a
  -- marca visual deixa dinheiro real no cartao e zero credito no sistema.
  WITH bad AS (
    SELECT l.id AS load_id, l.session_id, l.load_date, l.amount,
           l.out_transaction_id, t.company_id, t.status AS out_status
      FROM public.card_session_loads l
      JOIN public.transactions t ON t.id = l.out_transaction_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)))
       AND l.in_transaction_id IS NULL
       AND t.status <> 'paid'
       AND EXISTS (
         SELECT 1 FROM public.payment_list_items pli
          WHERE pli.transaction_id = t.id
            AND pli.manually_marked_paid
            AND pli.removed_at IS NULL
       )
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY load_date DESC LIMIT 5) x), '[]'::jsonb)
    INTO c22, s22 FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         v.cnt, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (v.cnt = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, v.smp
    FROM public.system_invariants i
    JOIN (VALUES
      ('tx_fornecedor_outra_empresa', c1, s1),
      ('tx_conta_outra_empresa', c2, s2),
      ('tx_evento_outra_empresa', c3, s3),
      ('tx_rubrica_outra_empresa', c4, s4),
      ('coala_map_outra_empresa', c5, s5),
      ('filha_rateio_com_conta', c6, s6),
      ('tipo_invalido', c7, s7),
      ('fornecedor_iban_duplicado_ativo', c8, s8),
      ('fecho_confirmado_liquido_retido', c9, s9),
      ('paid_amount_acima_do_bruto', c10, s10),
      ('pares_fk_duplicada', c12, s12),
      ('BP_DESPESA_EM_L2', c13, s13),
      ('TX_EVENTO_SEM_RUBRICA', c14, s14),
      ('VINCULO_CROSS_EVENTO', c15, s15),
      ('VINCULO_DESSINCRONIZADO', c16, s16),
      ('FORECAST_ID_ORFAO', c17, s17),
      ('TRIGGER_DOCUMENTADO_SEM_LIGACAO', c18, s18),
      ('grupo_fatura_veredicto_desagrupar_por_aplicar', c19, s19),
      ('rateio_filhas_nao_somam_a_mae', c20, s20),
      ('transitoria_partner_advance_sem_linha', c21, s21),
      ('carga_sem_credito', c22, s22)
    ) AS v(name, cnt, smp) ON v.name = i.name
   WHERE NOT _training OR i.name NOT IN ('pares_fk_duplicada', 'TRIGGER_DOCUMENTADO_SEM_LIGACAO')
   ORDER BY i.scope, (v.cnt = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)), i.severity, i.name;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_raw_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_raw_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_raw()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_raw_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_raw() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_raw() TO service_role;

-- Latest versioned base: drizzle/migrations/0288_reembolso_invariante_corpo_exato_0286_b.sql
-- SHA256 of exact CREATE FUNCTION: 2d7130bfdc0eafb1ea5ca921e4a52b3f19e1c87a0df5655b0393cda29015ef15
CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra_scoped(_training boolean)
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
  cS bigint; sS jsonb;
  cR bigint; sR jsonb;
BEGIN
  WITH em_falta AS (
    SELECT c.id AS company_id, c.slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.company_id = c.id AND b.status = 'ok') AS ultimo_ok
      FROM public.companies c
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = c.id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = c.id AND training_c.is_training))) AND c.status = 'active'
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
     WHERE NOT _training AND NOT EXISTS (
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
         cB, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cB = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sB
    FROM public.system_invariants i
   WHERE i.name = 'backup_empresa_em_falta';

  SELECT count(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('tabela', e.schema_name || '.' || e.table_name, 'motivo', e.reason))
                     FROM public.backup_excluded_tables e), '[]'::jsonb)
    INTO cX, sX FROM public.backup_excluded_tables;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cX, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cX = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sX
    FROM public.system_invariants i
   WHERE NOT _training AND i.name = 'backup_tabelas_excluidas';

  WITH falhados AS (
    SELECT l.template_name, l.recipient_email, l.status, l.error_message, l.created_at
      FROM public.email_send_log l
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training))) AND l.status IN ('failed','dlq')
       AND l.created_at > now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, recipient_email, status, error_message, created_at
                       FROM falhados ORDER BY created_at DESC LIMIT 6) x), '[]'::jsonb)
    INTO cF, sF FROM falhados;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cF, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cF = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sF
    FROM public.system_invariants i
   WHERE i.name = 'emails_falhados_24h';

  WITH presos AS (
    SELECT l.template_name, l.recipient_email, l.created_at
      FROM public.email_send_log l
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training))) AND l.status = 'pending' AND NOT EXISTS (SELECT 1 FROM public.email_send_log s WHERE s.message_id = l.message_id AND s.status = 'sent')
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
         cP, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cP = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
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
       AND c.relname <> ALL (ARRAY['transactions','ticket_sales','event_forecasts','transaction_documents','event_zone_capacities','bilheteira_zone_snapshots','leads','contacts','undo_actions','meta_audience_upload_members','meta_custom_audiences','user_activity_log','system_audit_log','transaction_audit_log','ticketline_sync_runs','bol_sync_runs','coala_sync_runs','fever_sync_runs','transaction_payments','bank_statement_lines','artist_content_metrics_daily','song_link_events','redirect_log','consent_log','google_click','meta_ad_insights_daily','artist_metrics_daily','song_link_diag','meta_ad_snapshot','tickets_v2_sync_log','ads_insights_breakdown_daily','meta_adset_insights_daily','meta_creatives','artist_audience_demographics','meta_creatives_retention_log','lead_capture','email_send_log','artist_content','artist_song_metrics_daily','meta_adset_snapshot','email_unsubscribe_tokens','portal_error_log','meta_campaign_insights_daily','artist_song_playlist_streams','event_forecast_formalidade_log','artist_release_metrics_daily','ip_geo_cache']::text[])
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT esquema, tabela, linhas FROM grandes
                      ORDER BY linhas DESC LIMIT 50) x), '[]'::jsonb)
    INTO cT, sT FROM grandes;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cT, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cT = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sT
    FROM public.system_invariants i
   WHERE NOT _training AND i.name = 'tabelas_acima_de_1000';

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
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training))) AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
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
         cL, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cL = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sL
    FROM public.system_invariants i
   WHERE i.name = 'paid_amount_sem_linhas';

  WITH bad AS (
    SELECT l.id AS line_id, l.financial_account_id, l.statement_id,
           l.booking_date, l.description, l.amount, l.matched_by, l.matched_at
      FROM public.bank_statement_lines l
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training))) AND l.status = 'matched'
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
         cC, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cC = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sC
    FROM public.system_invariants i
   WHERE i.name = 'linha_conciliada_sem_transacao';

  WITH bad AS (
    SELECT p.id AS payment_id, p.transaction_id, p.currency, p.amount,
           p.original_amount, p.fx_rate, p.payment_date
      FROM public.transaction_payments p
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = p.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = p.company_id AND training_c.is_training))) AND COALESCE(p.currency, 'EUR') <> 'EUR'
       AND (p.original_amount IS NULL OR p.fx_rate IS NULL)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY payment_date DESC LIMIT 6) x), '[]'::jsonb)
    INTO cM, sM FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cM, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cM = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sM
    FROM public.system_invariants i
   WHERE i.name = 'pagamento_moeda_sem_cambio';

  WITH bad AS (
    SELECT o.id AS offset_id, o.company_id, o.receivable_transaction_id, o.payable_transaction_id, o.amount
      FROM public.transaction_offsets o
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = o.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = o.company_id AND training_c.is_training))) AND o.offset_group_id IS NULL AND ((
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
           ))
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cO, sO FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cO, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cO = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sO
    FROM public.system_invariants i
   WHERE i.name = 'compensacao_pendente';
  -- D-ERP156: conta-corrente de sessão de camarim integrada tem de ficar a 0.
  WITH bad AS (
    SELECT s.id AS session_id, s.company_id, s.title, s.advance_account_id,
           round(public._account_true_balance_raw(s.advance_account_id), 2) AS saldo
      FROM public.camarim_sessions s
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = s.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = s.company_id AND training_c.is_training))) AND s.status = 'integrated'
       AND s.advance_account_id IS NOT NULL
       AND abs(COALESCE(public._account_true_balance_raw(s.advance_account_id), 0)) >= 0.01
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cS, sS FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cS, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cS = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sS
    FROM public.system_invariants i
   WHERE i.name = 'camarim_sessao_integrada_com_saldo';
  -- 0286: pagamento de nota de reembolso nunca entra no resultado.
  WITH bad AS (
    SELECT rn.id AS note_id, rn.code, rn.status, t.id AS transaction_id, t.amount, t.exclude_from_result
      FROM public.reimbursement_notes rn
      JOIN public.transactions t ON t.id = rn.payment_transaction_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training))) AND t.exclude_from_result IS DISTINCT FROM true
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cR, sR FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cR = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'reembolso_pagamento_no_resultado';
  IF NOT _training THEN
  RETURN QUERY SELECT i.name,i.description,i.severity,i.scope,c.current_count,(CASE WHEN _training THEN 0::bigint ELSE i.reference_count END),(c.current_count=(CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)),i.notes,'[]'::jsonb FROM public.issue335_invariant_counts() c JOIN public.system_invariants i ON i.name=c.name;
  END IF;
  -- Balance is a separately approved candidate and may not be installed.
  IF NOT _training AND to_regprocedure('public.issue335_balance_invariant_count()') IS NOT NULL THEN
    RETURN QUERY EXECUTE 'SELECT i.name,i.description,i.severity,i.scope,c.n,(CASE WHEN _training THEN 0::bigint ELSE i.reference_count END),(c.n=(CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)),i.notes,''[]''::jsonb FROM public.system_invariants i CROSS JOIN LATERAL (SELECT public.issue335_balance_invariant_count() n) c WHERE i.name=''encontro_saldo_dinheiro_divergente''';
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extra_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_extra_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extra() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extra() TO service_role;

-- Latest versioned base: drizzle/migrations/0044_derp197_284_invariante_transacao_duplica_fatura.sql
-- SHA256 of exact CREATE FUNCTION: 209e14dc6dec0a9b04c6ce9e773bb101296e3ca11bf96168b3e69d065958fdd7
CREATE OR REPLACE FUNCTION public._run_invariant_checks_duplicate_invoices_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  -- #284: conta TRANSAÇÕES DISTINTAS (não pares) com par de mesma fatura, valor e tipo.
  -- Pares de type diferente ficam fora: transferência entre contas nasce sempre assim.
  WITH base AS (
    SELECT t.id, t.company_id, t.supplier_id, t.type, t.amount, t.date, t.description,
           upper(regexp_replace(btrim(t.invoice_ref), '\s+', ' ', 'g')) AS ref_norm
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training))) AND t.parent_transaction_id IS NULL AND t.reversed_at IS NULL
       AND t.supplier_id IS NOT NULL
       AND nullif(btrim(t.invoice_ref), '') IS NOT NULL
  ), bad AS (
    SELECT DISTINCT a.id, a.company_id, a.supplier_id, a.ref_norm, a.type, a.amount, a.date, a.description
      FROM base a JOIN base b
        ON b.id <> a.id AND b.company_id = a.company_id AND b.supplier_id = a.supplier_id
       AND b.ref_norm = a.ref_norm AND b.type IS NOT DISTINCT FROM a.type
       AND abs(b.amount - a.amount) <= 0.01
  )
  SELECT count(DISTINCT id),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY date DESC LIMIT 5) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, cZ, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END),
         (cZ = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme, i.notes, sZ
    FROM public.system_invariants i WHERE i.name = 'transacao_duplica_fatura';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_duplicate_invoices_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_duplicate_invoices_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_duplicate_invoices()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_duplicate_invoices_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_duplicate_invoices() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_duplicate_invoices() TO service_role;

-- Latest versioned base: supabase/migrations/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql
-- SHA256 of exact CREATE FUNCTION: 938965f7e2bdbc62edc83678b4bae51e37eec10256c4e5136680761d7f0a5284
CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.date, t.description,
           t.status, t.paid_amount, t.account_id
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training))) AND COALESCE(t.paid_amount, 0) > 0.01
       AND COALESCE(t.is_reimbursement, false) = false
       AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p
                        WHERE p.transaction_id = t.id AND p.status = 'paid')
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY paid_amount DESC LIMIT 6) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cZ, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cZ = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sZ
    FROM public.system_invariants i
   WHERE i.name = 'paid_sem_pagamento';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_paid_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_paid_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_paid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid() TO service_role;

-- Latest versioned base: supabase/migrations/20260924211456_48f0d3a1-6824-4866-8c88-ef8c9b382ef6.sql
-- SHA256 of exact CREATE FUNCTION: e3d3c8c405209ac3418e013559179a11325070a3bcf1470dc46decdeb512a3e8
CREATE OR REPLACE FUNCTION public._run_invariant_checks_infra_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cR bigint; sR jsonb;
  cP bigint; sP jsonb;
BEGIN
  -- Purga do histórico de execuções do cron
  SELECT count(*) INTO cR
    FROM cron.job_run_details d
   WHERE d.end_time < now() - interval '8 days';

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO sR
    FROM (
      SELECT d.jobid, d.runid, d.status, d.end_time
        FROM cron.job_run_details d
       WHERE d.end_time < now() - interval '8 days'
       ORDER BY d.end_time
       LIMIT 5
    ) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cR = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE NOT _training AND i.name = 'cron_run_details_sem_purga';

  -- Erros de front dos portais públicos nas últimas 24 horas.
  -- Semântica de limiar: conforme = contagem <= referência (máximo tolerado).
  SELECT count(*) INTO cP
    FROM public.portal_error_log l
   WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training))) AND l.created_at > now() - interval '24 hours';

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO sP
    FROM (
      SELECT left(regexp_replace(l.message, '\s+', ' ', 'g'), 160) AS mensagem,
             l.route,
             count(*) AS n,
             max(l.created_at) AS ultimo
        FROM public.portal_error_log l
       WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training))) AND l.created_at > now() - interval '24 hours'
       GROUP BY 1, 2
       ORDER BY count(*) DESC
       LIMIT 3
    ) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cP, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cP <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sP
    FROM public.system_invariants i
   WHERE i.name = 'erros_portal_24h';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_infra_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_infra_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_infra()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_infra_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_infra() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_infra() TO service_role;

-- Latest versioned base: supabase/migrations/20260930190108_5b0ea3f9-dd18-429a-a9ac-b486725c7ad1.sql
-- SHA256 of exact CREATE FUNCTION: 4771a10ffe67950abc7ec3d2708e56f5e5a88b9e1c9374314c5fe2254845cd95
CREATE OR REPLACE FUNCTION public._run_invariant_checks_docs_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cR bigint; sR jsonb; allR jsonb;
BEGIN
  -- #268: todas as tabelas de documentos; ficheiro distinto = (bucket, caminho).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tabela', m.tabela, 'bucket', m.bucket, 'file_url', m.caminho, 'linhas', m.linhas) ORDER BY m.tabela, m.caminho), '[]'::jsonb)
    INTO allR
    FROM (
      SELECT s.tabela, s.bucket, s.caminho, count(*)::bigint AS linhas
        FROM (
          SELECT 'transaction_documents'::text AS tabela, 'transaction-documents'::text AS bucket, file_url::text AS caminho FROM public.transaction_documents WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = transaction_documents.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = transaction_documents.company_id AND training_c.is_training)))
          UNION ALL SELECT 'payment_list_documents', 'transaction-documents', file_url FROM public.payment_list_documents WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = payment_list_documents.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = payment_list_documents.company_id AND training_c.is_training)))
          UNION ALL SELECT 'camarim_item_documents', 'camarim-documents', file_path FROM public.camarim_item_documents WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = camarim_item_documents.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = camarim_item_documents.company_id AND training_c.is_training)))
          UNION ALL SELECT 'card_item_documents', 'card-documents', file_path FROM public.card_item_documents WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = card_item_documents.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = card_item_documents.company_id AND training_c.is_training)))
          UNION ALL SELECT 'event_forecast_attachments', 'event-forecast-attachments', storage_path FROM public.event_forecast_attachments WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = event_forecast_attachments.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = event_forecast_attachments.company_id AND training_c.is_training)))
          UNION ALL SELECT 'bank_line_documents', 'bank-statements', file_url FROM public.bank_line_documents WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = bank_line_documents.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = bank_line_documents.company_id AND training_c.is_training)))
          UNION ALL SELECT 'event_ab_attachments', 'event-ab-attachments', storage_path FROM public.event_ab_attachments WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = event_ab_attachments.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = event_ab_attachments.company_id AND training_c.is_training)))
          UNION ALL SELECT 'entity_documents', 'entity-documents', storage_path FROM public.entity_documents WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = entity_documents.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = entity_documents.company_id AND training_c.is_training)))
          UNION ALL SELECT 'supplier_documents', 'supplier-documents', file_url FROM public.supplier_documents WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = supplier_documents.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = supplier_documents.company_id AND training_c.is_training)))
        ) s
       WHERE s.caminho IS NOT NULL
         AND s.caminho !~ '^(bank:|ref:|camarim:|card:|https?:)'
         AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = s.bucket AND o.name = s.caminho)
       GROUP BY s.tabela, s.bucket, s.caminho
    ) m;

  SELECT count(*) INTO cR
    FROM (SELECT DISTINCT e->>'bucket', e->>'file_url' FROM jsonb_array_elements(allR) e) z;

  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO sR
    FROM (SELECT e FROM jsonb_array_elements(allR) e LIMIT 5) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cR <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'documento_sem_ficheiro_no_storage';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_docs_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_docs_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_docs()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_docs_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_docs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_docs() TO service_role;

-- Latest versioned base: supabase/baseline/live-only/functions__public._run_invariant_checks_extrato__3722d1156a.sql
-- SHA256 of exact CREATE FUNCTION: f52a88a5ccd636000a72893682ef28660556de993e7a5a73c2120a3669bf4c86
CREATE OR REPLACE FUNCTION public._run_invariant_checks_extrato_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cR bigint; sR jsonb;
BEGIN
  WITH ult AS (
    SELECT l.financial_account_id AS acc, max(l.booking_date) AS ate
      FROM public.bank_statement_lines l
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = l.company_id AND training_c.is_training))) AND l.financial_account_id IS NOT NULL
     GROUP BY l.financial_account_id
  ),
  calc AS (
    SELECT a.name, u.ate,
           COALESCE(a.initial_balance,0) + COALESCE((
             SELECT sum(l2.amount) FROM public.bank_statement_lines l2
              WHERE l2.financial_account_id = a.id
                AND (a.initial_balance_date IS NULL OR l2.booking_date > a.initial_balance_date)
                AND l2.booking_date <= u.ate),0) AS banco,
           public._account_true_balance_asof_raw(a.id, u.ate) AS sistema
      FROM ult u JOIN public.financial_accounts a ON a.id = u.acc
  )
  SELECT count(*), COALESCE(jsonb_agg(to_jsonb(y)), '[]'::jsonb)
    INTO cR, sR
    FROM (SELECT c.name AS conta, c.ate AS ate_data,
                 round(c.banco,2) AS banco, round(c.sistema,2) AS sistema,
                 round(c.sistema - c.banco,2) AS diferenca
            FROM calc c
           WHERE c.sistema IS NOT NULL AND abs(c.sistema - c.banco) > 1.00
           ORDER BY abs(c.sistema - c.banco) DESC LIMIT 5) y;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cR <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'saldo_conta_difere_do_extrato';
END;
$function$

;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extrato_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extrato_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_extrato()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_extrato_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_extrato() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_extrato() TO service_role;

-- Latest versioned base: drizzle/migrations/0026_derp274_invariant_item_duplica_transacao.sql
-- SHA256 of exact CREATE FUNCTION: 9fe173009fce624f9512f9e079e33cd414b9af8e0b7c0ae3d3724e557b70e85b
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cards_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  WITH bad AS (
    SELECT i.id AS item_id, i.session_id, s.company_id, s.card_account_id,
           i.item_date, round(i.amount * (1 + COALESCE(i.iva_rate, 0) / 100.0), 2) AS item_gross,
           i.description AS item_description,
           t.id AS transaction_id, t.paid_amount AS transaction_gross,
           t.description AS transaction_description
      FROM public.card_session_items i
      JOIN public.card_sessions s ON s.id = i.session_id
      JOIN public.transactions t
        ON t.account_id = s.card_account_id
       AND COALESCE(t.payment_date, t.date) = i.item_date
       AND abs(COALESCE(t.paid_amount, 0) - i.amount * (1 + COALESCE(i.iva_rate, 0) / 100.0)) < 0.01
       AND t.reversed_at IS NULL
       AND COALESCE(t.is_hidden, false) = false
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = s.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = s.company_id AND training_c.is_training))) AND i.status = 'approved'
       AND NOT EXISTS (SELECT 1 FROM public.card_session_items x WHERE x.transaction_id = t.id)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY item_date DESC LIMIT 5) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cZ, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (cZ = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme,
         i.notes, sZ
    FROM public.system_invariants i
   WHERE i.name = 'item_de_cartao_duplica_transacao';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_cards_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_cards_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cards()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_cards_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_cards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_cards() TO service_role;

-- Latest versioned base: drizzle/migrations/0047_derp200_287_camarim_adiantamento_entrada.sql
-- SHA256 of exact CREATE FUNCTION: d46d940ced9bb2a1fa80d894f4157ddcf41b252255616be0c1fa384f4a223b6a
CREATE OR REPLACE FUNCTION public._run_invariant_checks_camarim_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH bad AS (
    SELECT m.id AS move_id, m.session_id, l.session_tx, l.bank_tx, st.paid_amount, st.amount
      FROM public.camarim_fund_moves m
      CROSS JOIN LATERAL public._camarim_fund_move_legs(m.id) l
      JOIN public.transactions bt ON bt.id = l.bank_tx
      JOIN public.transactions st ON st.id = l.session_tx
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = m.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = m.company_id AND training_c.is_training))) AND m.move_type IN ('advance','reinforcement')
       AND bt.status = 'paid'
       AND COALESCE(st.paid_amount, 0) < st.amount * (1 + COALESCE(st.iva_rate,0) / 100.0) - 0.01
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO c, s FROM bad;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (c = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'camarim_adiantamento_sem_entrada';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_camarim_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_camarim_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_camarim()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_camarim_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_camarim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_camarim() TO service_role;

-- Latest versioned base: drizzle/migrations/0048_derp201_supplier_similarity_flags.sql
-- SHA256 of exact CREATE FUNCTION: 90b85ff0d6bb00f3dc7a1a824c51ceb6f3974053321a71859b3361c93200676c
CREATE OR REPLACE FUNCTION public._run_invariant_checks_suppliers_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  SELECT count(*), COALESCE(jsonb_agg(to_jsonb(x)) FILTER (WHERE x.rn <= 6), '[]'::jsonb)
    INTO c, s
    FROM (SELECT f.id, f.company_id, f.supplier_id, f.similar_supplier_id, f.motivo, f.source,
                 row_number() OVER (ORDER BY f.created_at DESC) rn
            FROM public.supplier_similarity_flags f WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = f.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = f.company_id AND training_c.is_training))) AND f.resolved_at IS NULL) x;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (c <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'supplier_similar_por_rever';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_suppliers_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_suppliers_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_suppliers()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_suppliers_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_suppliers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_suppliers() TO service_role;

-- Latest versioned base: drizzle/migrations/0049_derp202_285_invariante_pago_abaixo_do_bruto.sql
-- SHA256 of exact CREATE FUNCTION: 97c1efc1a604849ac1c0a18ffd009a5a98d88b9050e81396351e89ea1149fde4
CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid_below_gross_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  -- #285: /100.0 obrigatório (iva_rate é integer). Tolerância 0,02 obrigatória (arredondamento do bruto).
  WITH bad AS (
    SELECT t.id, t.company_id, t.description, t.date, t.amount, t.iva_rate, t.paid_amount,
           round((t.amount * (1 + COALESCE(t.iva_rate,0) / 100.0))::numeric, 2) - COALESCE(t.paid_amount,0) AS falta
      FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training))) AND t.status = 'paid' AND t.reversed_at IS NULL
       AND round((t.amount * (1 + COALESCE(t.iva_rate,0) / 100.0))::numeric, 2) - COALESCE(t.paid_amount,0) > 0.02
       AND COALESCE(t.declared_withholding_amount,0) = 0
       AND NOT EXISTS (SELECT 1 FROM public.supplier_credit_usages u WHERE u.transaction_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.transaction_offsets o
                        WHERE t.id IN (o.receivable_transaction_id, o.payable_transaction_id))
       AND NOT EXISTS (SELECT 1 FROM public.ticket_office_settlements s
                        WHERE s.venue_retained_invoice_id = t.id AND s.reversed_at IS NULL)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad ORDER BY falta DESC LIMIT 5) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, cZ, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END),
         (cZ = (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)) AS conforme, i.notes, sZ
    FROM public.system_invariants i WHERE i.name = 'pago_abaixo_do_bruto';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid_below_gross()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_paid_below_gross_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid_below_gross() TO service_role;

-- Latest versioned base: drizzle/migrations/0061_derp214_ticketline_parallel_series_invariant.sql
-- SHA256 of exact CREATE FUNCTION: 5317b76a540411605fb92cba94abaeeb05e7f9726623ffbafc06a8821e362a8b
CREATE OR REPLACE FUNCTION public._run_invariant_checks_ticketline_series_scoped(_training boolean)
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH lastrun AS (
    SELECT DISTINCT ON (cf.event_id) cf.event_id, r.import_audit->'zoneLotMap' AS m
      FROM public.ticketline_sync_runs r
      JOIN public.ticketline_sync_config cf ON cf.id = r.config_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = cf.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = cf.company_id AND training_c.is_training))) AND r.status IN ('success','warning')
       AND CASE WHEN jsonb_typeof(r.import_audit->'zoneLotMap') = 'array'
                THEN jsonb_array_length(r.import_audit->'zoneLotMap') > 0 ELSE false END
     ORDER BY cf.event_id, r.started_at DESC
  ), hits AS (
    SELECT e.name AS evento, z.name AS zona, sum(ts.quantity) AS bilhetes,
           round(sum(ts.total_value), 2) AS valor, min(ts.sale_date) AS de, max(ts.sale_date) AS ate
      FROM lastrun l
      JOIN public.event_ticket_zones z ON z.event_id = l.event_id AND z.sync_generated
      JOIN public.ticket_sales ts ON ts.zone_id = z.id AND ts.source = 'ticketline_import'
      JOIN public.events e ON e.id = l.event_id
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(l.m) x WHERE x->>'zoneId' = z.id::text)
     GROUP BY l.event_id, z.id, e.name, z.name
  )
  SELECT (SELECT count(*) FROM hits),
         COALESCE((SELECT jsonb_agg(to_jsonb(h)) FROM (SELECT * FROM hits ORDER BY bilhetes DESC LIMIT 10) h), '[]'::jsonb)
    INTO c, s;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END),
         (c <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)), i.notes, s
    FROM public.system_invariants i
   WHERE i.name = 'ticketline_series_paralelas';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_ticketline_series_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_ticketline_series_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_ticketline_series()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_ticketline_series_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_ticketline_series() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_ticketline_series() TO service_role;

-- Latest versioned base: drizzle/migrations/0062_derp215_invariant_documentos_inalcancaveis.sql
-- SHA256 of exact CREATE FUNCTION: a60c79808d188928bf6b0625d06e47f82cdd9890270129d2b0499c2d08d4dc0e
CREATE OR REPLACE FUNCTION public._run_invariant_checks_unreachable_docs_scoped(_training boolean)
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH d AS (
    SELECT td.id, td.transaction_id, td.file_url, td.uploaded_at
      FROM public.transaction_documents td
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = td.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = td.company_id AND training_c.is_training))) AND td.file_url IS NOT NULL
       AND td.file_url !~ '^(bank|ref|camarim|card)://'
       AND td.file_url !~* '^https?://'
       AND NOT EXISTS (SELECT 1 FROM storage.objects o
                        WHERE o.bucket_id = 'transaction-documents' AND o.name = td.file_url)
  )
  SELECT (SELECT count(*) FROM d),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM d ORDER BY uploaded_at LIMIT 10) x), '[]'::jsonb)
    INTO c, s;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), (c <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END)), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'documentos_inalcancaveis';
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_unreachable_docs_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_unreachable_docs_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_unreachable_docs()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_unreachable_docs_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_unreachable_docs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_unreachable_docs() TO service_role;

-- Latest versioned base: drizzle/migrations/0065_derp217_fix_storage_invariant_ambiguous.sql
-- SHA256 of exact CREATE FUNCTION: 378b43f1a8d99d377c291309ac388cb974b7de8c4032a59a48918606ac67248a
CREATE OR REPLACE FUNCTION public._run_invariant_checks_storage_scoped(_training boolean)
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog'
AS $function$
DECLARE
  refs constant jsonb := '{"camarim_item_documents":9,"payment_list_documents":2,"card_item_documents":0,"event_forecast_attachments":0,"bank_line_documents":0,"event_ab_attachments":0}';
  cD bigint; sD jsonb; okD boolean; cM bigint; sM jsonb;
BEGIN
  WITH d(tbl, bucket, did, dpath) AS (
    SELECT 'camarim_item_documents', 'camarim-documents', x.id, x.file_path FROM public.camarim_item_documents x WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)))
    UNION ALL SELECT 'payment_list_documents', 'transaction-documents', x.id, x.file_url FROM public.payment_list_documents x WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)))
    UNION ALL SELECT 'card_item_documents', 'card-documents', x.id, x.file_path FROM public.card_item_documents x WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)))
    UNION ALL SELECT 'event_forecast_attachments', 'event-forecast-attachments', x.id, x.storage_path FROM public.event_forecast_attachments x WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)))
    UNION ALL SELECT 'bank_line_documents', 'bank-statements', x.id, x.file_url FROM public.bank_line_documents x WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)))
    UNION ALL SELECT 'event_ab_attachments', 'event-ab-attachments', x.id, x.storage_path FROM public.event_ab_attachments x WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = x.company_id AND training_c.is_training)))
  ), m AS (
    SELECT * FROM d
     WHERE d.dpath IS NOT NULL AND d.dpath !~ '^(ref|bank|camarim|card)://' AND d.dpath !~* '^https?://'
       AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = d.bucket AND o.name = d.dpath)
  ), t AS (
    SELECT k AS tbl, (SELECT count(*) FROM m WHERE m.tbl = k) n, CASE WHEN _training THEN 0::bigint ELSE (refs->>k)::bigint END r,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.did, 'path', s.dpath)), '[]'::jsonb)
              FROM (SELECT m.did, m.dpath FROM m WHERE m.tbl = k ORDER BY m.dpath LIMIT 5) s) amostra
      FROM jsonb_object_keys(refs) k
  )
  SELECT sum(t.n), bool_and(t.n <= t.r),
         jsonb_object_agg(t.tbl, jsonb_build_object('atual', t.n, 'referencia', t.r, 'amostra', t.amostra))
    INTO cD, okD, sD FROM t;

  WITH last AS (
    SELECT br.storage_report FROM public.backup_runs br
     WHERE br.scope = 'global' AND br.status = 'ok' ORDER BY br.finished_at DESC NULLS LAST LIMIT 1
  ), miss AS (
    SELECT b.id AS bid FROM storage.buckets b
     WHERE b.id <> 'database-backups'
       AND NOT coalesce((SELECT l.storage_report ? b.id FROM last l), false)
  )
  SELECT count(*), coalesce(jsonb_agg(miss.bid ORDER BY miss.bid), '[]'::jsonb) INTO cM, sM FROM miss;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         CASE i.name WHEN 'documento_sem_ficheiro_por_tabela' THEN cD ELSE cM END,
         (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END),
         CASE i.name WHEN 'documento_sem_ficheiro_por_tabela' THEN okD ELSE cM <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END) END,
         i.notes,
         CASE i.name WHEN 'documento_sem_ficheiro_por_tabela' THEN sD ELSE sM END
    FROM public.system_invariants i
   WHERE i.name IN ('documento_sem_ficheiro_por_tabela', 'backup_manifesto_cobre_todos_os_buckets') AND (NOT _training OR i.name = 'documento_sem_ficheiro_por_tabela');
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_storage_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_storage_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_storage()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_storage_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_storage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_storage() TO service_role;

-- Latest versioned base: drizzle/migrations/0068_derp219_fix_rateio_invariant_ambiguous.sql
-- SHA256 of exact CREATE FUNCTION: 2384af6ce6f454b84098eeae122e6fd8aaba7efc126c41c98f77c2d8ffec6e30
CREATE OR REPLACE FUNCTION public._run_invariant_checks_rateio_scoped(_training boolean)
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH m AS (
    SELECT p.id AS m_id, p.description AS m_desc, p.amount AS m_amount, sum(ch.amount) AS m_soma, count(*) AS m_n
      FROM public.transactions p
      JOIN public.transactions ch ON ch.parent_transaction_id = p.id AND ch.split_percentage IS NOT NULL
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = p.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = p.company_id AND training_c.is_training)))
     GROUP BY p.id, p.description, p.amount
    HAVING abs(p.amount - sum(ch.amount)) > 0.01
  )
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', m.m_id, 'descricao', m.m_desc, 'mae', m.m_amount, 'filhas', m.m_soma, 'n', m.m_n, 'diff', m.m_amount - m.m_soma) ORDER BY abs(m.m_amount - m.m_soma) DESC), '[]'::jsonb)
    INTO c, s FROM m;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), c <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'maes_rateio_divergentes';
END $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_rateio_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_rateio_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_rateio()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_rateio_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_rateio() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_rateio() TO service_role;

-- Latest versioned base: drizzle/migrations/0089_derp238_invariant_cash_negativo.sql
-- SHA256 of exact CREATE FUNCTION: bc2df26e653fc0263960b4b2a63d888cc3ec9bb428bcf8d4470ee9ce679e39d3
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cash_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH b AS (
    SELECT a.id, a.name AS conta, a.company_id,
           public._account_true_balance_asof_raw(a.id, NULL) AS saldo
      FROM public.financial_accounts a
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = a.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = a.company_id AND training_c.is_training))) AND a.type = 'cash'
  ), bad AS (
    SELECT * FROM b WHERE saldo < -0.005
  )
  SELECT count(*), COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'conta', x.conta, 'company_id', x.company_id, 'saldo', round(x.saldo, 2)) ORDER BY x.saldo) FROM (SELECT * FROM bad LIMIT 10) x), '[]'::jsonb)
    INTO c, s FROM bad;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), c <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'conta_cash_saldo_negativo';
END $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_cash_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_cash_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cash()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_cash_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_cash() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_cash() TO service_role;

-- Latest versioned base: drizzle/migrations/0096_derp_304_invariant_natureza_divergente.sql
-- SHA256 of exact CREATE FUNCTION: c5a9c2b32377d2c114514a68c29468bf6881ec40a1a347994a060625616fef27
CREATE OR REPLACE FUNCTION public._run_invariant_checks_dre_nature_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id, t.company_id, t.type AS tx_type, cat.type AS cat_type, cat.code,
           t.amount, extract(year FROM COALESCE(t.payment_date, t.date))::int AS ano
      FROM public.transactions t
      JOIN public.account_categories cat ON cat.id = t.category_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training))) AND t.status IN ('approved', 'paid')
       AND t.reversed_at IS NULL
       AND NOT COALESCE(t.is_hidden, false)
       AND NOT COALESCE(t.is_transitory, false)
       AND NOT COALESCE(t.exclude_from_result, false)
       AND cat.code LIKE '10%'
       AND t.type <> cat.type
       AND NOT (t.type = 'income' AND cat.code = '10.6.03')
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('ano', y.ano, 'company_id', y.company_id, 'tx_type', y.tx_type,
                                                       'rubrica_tipo', y.cat_type, 'n', y.n, 'valor', round(y.v, 2))
                                    ORDER BY y.ano, y.company_id, y.tx_type)
                     FROM (SELECT ano, company_id, tx_type, cat_type, count(*) n, sum(amount) v
                             FROM bad GROUP BY 1, 2, 3, 4) y), '[]'::jsonb)
    INTO c, s FROM bad;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), c <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'transacoes_natureza_divergente_da_rubrica';
END $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_dre_nature_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_dre_nature_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_dre_nature()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_dre_nature_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_dre_nature() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_dre_nature() TO service_role;

-- Latest versioned base: drizzle/migrations/0237_cache_attach_advance_to_contract.sql
-- SHA256 of exact CREATE FUNCTION: 74e8a4b5fddfa0d6ae017abaf1a00f26735bef3af097f8774c4acad3d6e86152
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts_scoped(_training boolean)
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c1 bigint; s1 jsonb; c2 bigint; s2 jsonb; c3 bigint; s3 jsonb; c4 bigint := 0; s4 jsonb := '[]'::jsonb; p record; q record;
BEGIN
  WITH got AS (
    SELECT cc.contract_id, cc.event_id, cc.quota,
           coalesce((SELECT sum(t.amount) FROM public.transactions t
                      WHERE t.cache_contract_id = cc.contract_id AND t.event_id = cc.event_id AND t.reversed_at IS NULL
                        AND (t.parent_transaction_id IS NOT NULL OR t.cache_role = 'advance')),0) AS soma
      FROM public.cache_payment_contract_cities cc JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = k.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = k.company_id AND training_c.is_training))) AND k.cancelled_at IS NULL
  ), bad AS (SELECT * FROM got WHERE abs(quota - soma) > 0.01)
  SELECT count(*), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT * FROM bad LIMIT 6) b), '[]'::jsonb) INTO c1, s1 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c1, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), c1 <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), i.notes, s1
    FROM public.system_invariants i WHERE i.name = 'cache_contrato_cidade_divergente';

  WITH bad AS (SELECT root_event_id, artist_supplier_id, count(*) n FROM public.cache_payment_contracts
                WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = cache_payment_contracts.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = cache_payment_contracts.company_id AND training_c.is_training))) AND cancelled_at IS NULL GROUP BY 1,2 HAVING count(*) > public.cache_max_contracts())
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(bad)), '[]'::jsonb) INTO c2, s2 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c2, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), c2 <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), i.notes, s2
    FROM public.system_invariants i WHERE i.name = 'cache_contratos_acima_limite';

  WITH bad AS (
    SELECT t.id, t.event_id, t.forecast_id FROM public.transactions t
     WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = t.company_id AND training_c.is_training))) AND t.cache_role IS NOT NULL AND t.cache_contract_id IS NOT NULL AND (
       (t.parent_transaction_id IS NULL AND t.cache_role <> 'advance' AND (t.event_id IS NOT NULL OR t.forecast_id IS NOT NULL))
       OR (t.parent_transaction_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.events ch WHERE ch.parent_event_id = t.event_id))
       OR t.declared_withholding_amount IS NOT NULL OR t.iva_rate <> 0)
  )
  SELECT count(*), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT * FROM bad LIMIT 6) b), '[]'::jsonb) INTO c3, s3 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c3, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), c3 <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), i.notes, s3
    FROM public.system_invariants i WHERE i.name = 'cache_contrato_estrutura_invalida';
  -- cache_cidade_teto_excedido: quotas dos contratos ativos + adiantamentos livres por cidade ≤ teto da cidade.
  FOR p IN SELECT DISTINCT root_event_id, artist_supplier_id FROM public.cache_payment_contracts WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = cache_payment_contracts.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = cache_payment_contracts.company_id AND training_c.is_training))) AND cancelled_at IS NULL LOOP
    BEGIN
      FOR q IN
        WITH caps AS (
          SELECT cc.event_id, max(cc.cap) AS cap, sum(cc.quota) AS quota
            FROM public.cache_payment_contract_cities cc JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
           WHERE ((_training AND EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = k.company_id AND training_c.is_training)) OR (NOT _training AND NOT EXISTS (SELECT 1 FROM public.companies training_c WHERE training_c.id = k.company_id AND training_c.is_training))) AND k.cancelled_at IS NULL AND k.root_event_id = p.root_event_id AND k.artist_supplier_id = p.artist_supplier_id
           GROUP BY cc.event_id
        ), fa AS (
          SELECT x.event_id, sum(x.amount) AS amt FROM public._cache_free_advances_x(p.root_event_id, p.artist_supplier_id, NULL) x GROUP BY x.event_id
        )
        SELECT caps.event_id, caps.cap, caps.quota, coalesce(fa.amt, 0) AS free_advances
          FROM caps LEFT JOIN fa ON fa.event_id = caps.event_id
         WHERE caps.quota + coalesce(fa.amt, 0) > caps.cap + 0.005
      LOOP
        c4 := c4 + 1;
        IF jsonb_array_length(s4) < 6 THEN
          s4 := s4 || jsonb_build_object('root_event_id', p.root_event_id, 'artist_supplier_id', p.artist_supplier_id,
                                         'event_id', q.event_id, 'cap', q.cap, 'quota', q.quota, 'free_advances', q.free_advances);
        END IF;
      END LOOP;
    EXCEPTION WHEN others THEN
      c4 := c4 + 1;
      IF jsonb_array_length(s4) < 6 THEN
        s4 := s4 || jsonb_build_object('root_event_id', p.root_event_id, 'artist_supplier_id', p.artist_supplier_id, 'erro', SQLERRM);
      END IF;
    END;
  END LOOP;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c4, (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), c4 <= (CASE WHEN _training THEN 0::bigint ELSE i.reference_count END), i.notes, s4
    FROM public.system_invariants i WHERE i.name = 'cache_cidade_teto_excedido';
END $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_cache_contracts_scoped(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_cache_contracts_scoped(boolean) TO service_role;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$ SELECT * FROM public._run_invariant_checks_cache_contracts_scoped(false); $function$;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_cache_contracts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_cache_contracts() TO service_role;

-- Same predicates for all scoped families; global/catalog checks and reserved
-- #335 callbacks are intentionally absent. #335 remains an explicit acceptance gap.
CREATE FUNCTION public.run_training_invariant_checks_and_log()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_rows jsonb; v_drift integer; v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT COALESCE(public.has_role(auth.uid(),'platform_admin'), false) THEN
    RAISE EXCEPTION 'training_company_platform_admin_required';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'name', r.name, 'description', r.description, 'severity', r.severity, 'scope', r.scope,
    'current_count', r.current_count, 'reference_count', r.reference_count, 'conforme', r.conforme
  )), '[]'::jsonb) INTO v_rows FROM (
    SELECT * FROM public._run_invariant_checks_raw_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_extra_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_duplicate_invoices_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_paid_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_infra_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_docs_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_extrato_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_cards_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_camarim_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_suppliers_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_paid_below_gross_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_ticketline_series_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_unreachable_docs_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_storage_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_rateio_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_cash_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_dre_nature_scoped(true)
    UNION ALL SELECT * FROM public._run_invariant_checks_cache_contracts_scoped(true)
  ) r;
  SELECT count(*) INTO v_drift FROM jsonb_array_elements(v_rows) e WHERE (e->>'conforme')::boolean IS FALSE;
  INSERT INTO public.invariant_runs(ran_by, drift_count, results, scope_training)
  VALUES (auth.uid(), v_drift, v_rows, true) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.run_training_invariant_checks_and_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_training_invariant_checks_and_log() TO authenticated, service_role;

-- Latest versioned base: drizzle/migrations/0164_issue320_capi_p1_gaps.sql; function process_leads_capi_batch.
CREATE OR REPLACE FUNCTION public.process_leads_capi_batch(p_batch_size integer DEFAULT 25)
 RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  ld record; v_email text; v_phone text; v_phone_digits text; v_email_hash text; v_phone_hash text;
  v_event_name text; v_event_url text; v_pixel_id text; v_now timestamptz;
  v_user_data jsonb; v_custom_data jsonb; v_payload jsonb;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN RETURN; END IF;
  FOR ld IN
    SELECT l.* FROM public.leads l
    WHERE NOT public.is_training_company(l.company_id)
      AND (l.capi_status IS NULL OR l.capi_status = 'retry')
      AND l.kind IS DISTINCT FROM 'redirect_click'
      AND l.created_at >= now() - interval '7 days'
    ORDER BY l.created_at DESC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_now := now();
      IF ld.kind = 'redirect_click' OR ld.created_at < (v_now - interval '7 days')
         OR NOT public.capi_consent_proof(ld.id, 'ViewContent') THEN
        PERFORM public._capi_classify_lead(ld.id);
        CONTINUE;
      END IF;
      v_pixel_id := NULL; v_event_name := NULL; v_event_url := NULL;
      IF ld.event_id IS NOT NULL THEN
        SELECT NULLIF(btrim(coalesce(meta_pixel_id,'')), ''), name, ticketing_url
          INTO v_pixel_id, v_event_name, v_event_url FROM public.events WHERE id = ld.event_id LIMIT 1;
      END IF;
      IF v_pixel_id IS NULL THEN
        UPDATE public.leads SET capi_sent_at = v_now, capi_status = 'skipped_no_pixel' WHERE id = ld.id;
        CONTINUE;
      END IF;
      v_email := NULL; v_phone := NULL;
      IF ld.contact_id IS NOT NULL THEN
        SELECT NULLIF(lower(btrim(coalesce(email,''))), ''), NULLIF(btrim(coalesce(phone_e164,'')), '')
          INTO v_email, v_phone FROM public.contacts WHERE id = ld.contact_id LIMIT 1;
      END IF;
      v_phone_digits := NULLIF(regexp_replace(coalesce(v_phone,''), '[^0-9]', '', 'g'), '');
      v_email_hash := CASE WHEN v_email IS NOT NULL THEN encode(extensions.digest(v_email, 'sha256'), 'hex') END;
      v_phone_hash := CASE WHEN v_phone_digits IS NOT NULL THEN encode(extensions.digest(v_phone_digits, 'sha256'), 'hex') END;
      v_user_data := '{}'::jsonb;
      IF v_email_hash IS NOT NULL THEN v_user_data := v_user_data || jsonb_build_object('em', jsonb_build_array(v_email_hash)); END IF;
      IF v_phone_hash IS NOT NULL THEN v_user_data := v_user_data || jsonb_build_object('ph', jsonb_build_array(v_phone_hash)); END IF;
      IF ld.fbc IS NOT NULL AND ld.fbc <> '' THEN v_user_data := v_user_data || jsonb_build_object('fbc', ld.fbc); END IF;
      IF ld.fbp IS NOT NULL AND ld.fbp <> '' THEN v_user_data := v_user_data || jsonb_build_object('fbp', ld.fbp); END IF;
      IF ld.ip_inet IS NOT NULL THEN v_user_data := v_user_data || jsonb_build_object('client_ip_address', host(ld.ip_inet)); END IF;
      IF ld.user_agent IS NOT NULL AND ld.user_agent <> '' THEN v_user_data := v_user_data || jsonb_build_object('client_user_agent', ld.user_agent); END IF;
      v_custom_data := jsonb_build_object('content_name', coalesce(v_event_name, ''), 'content_category', 'event_ticket');
      v_payload := jsonb_build_object('pixel_id', v_pixel_id, 'event_name', 'ViewContent', 'event_id', ld.id::text,
        'event_time', extract(epoch from ld.created_at)::bigint, 'event_source_url', v_event_url,
        'user_data', v_user_data, 'custom_data', v_custom_data);
      UPDATE public.leads SET capi_sent_at = v_now, capi_status = 'processing' WHERE id = ld.id;
      RETURN NEXT jsonb_build_object('lead_id', ld.id, 'pixel_id', v_pixel_id, 'kind', ld.kind,
                                     'created_at', ld.created_at, 'payload', v_payload);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.leads SET capi_status = 'error' WHERE id = ld.id;
    END;
  END LOOP;
END $function$;
REVOKE EXECUTE ON FUNCTION public.process_leads_capi_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_leads_capi_batch(integer) TO service_role;

-- Latest versioned base: drizzle/migrations/0164_issue320_capi_p1_gaps.sql; function capi_guard_lead_dispatch.
CREATE OR REPLACE FUNCTION public.capi_guard_lead_dispatch(p_lead_id uuid, p_event_name text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l record; v_reason text;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN RETURN jsonb_build_object('allowed', false, 'reason', 'suspended'); END IF;
  IF p_lead_id IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'no_identity'); END IF;
  SELECT id, kind, created_at, capi_status, company_id INTO l FROM public.leads WHERE id = p_lead_id;
  IF l.id IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'no_identity'); END IF;
  IF public.is_training_company(l.company_id) THEN RETURN jsonb_build_object('allowed', false, 'reason', 'training_company'); END IF;
  IF p_event_name IS DISTINCT FROM 'ViewContent' THEN RETURN jsonb_build_object('allowed', false, 'reason', 'wrong_event'); END IF;
  IF l.capi_status IS DISTINCT FROM 'processing' THEN RETURN jsonb_build_object('allowed', false, 'reason', 'not_claimed'); END IF;
  v_reason := public.capi_lead_block_reason(l.id);
  IF v_reason IS NOT NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', v_reason); END IF;
  RETURN jsonb_build_object('allowed', true, 'reason', NULL, 'event_time', extract(epoch from l.created_at)::bigint);
END $function$;
REVOKE EXECUTE ON FUNCTION public.capi_guard_lead_dispatch(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capi_guard_lead_dispatch(uuid, text) TO service_role;

-- Latest versioned base: drizzle/migrations/0175_issue322_consent_fix_apply.sql; combined consent/training decision.
CREATE OR REPLACE FUNCTION public.marketing_consent_binding_valid(
  p_subject uuid, p_event bigint, p_company uuid, p_portal text, p_captured_at timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.marketing_consent_events%ROWTYPE; cap record; cur record;
BEGIN
  IF public.is_training_company(p_company) THEN RETURN false; END IF;
  IF p_subject IS NULL OR p_event IS NULL OR p_company IS NULL OR p_portal IS NULL OR p_captured_at IS NULL THEN RETURN false; END IF;
  SELECT * INTO e FROM public.marketing_consent_events WHERE id = p_event;
  IF e.id IS NULL OR e.subject_id <> p_subject OR e.state <> 'granted' OR e.purpose <> 'meta_ads'
     OR e.company_id <> p_company OR e.portal <> p_portal OR e.revision IS NULL THEN RETURN false; END IF;
  SELECT * INTO cap FROM public.marketing_consent_effective(p_subject, p_captured_at);
  IF cap.event_id IS DISTINCT FROM e.id OR NOT coalesce(cap.valid_grant, false) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.marketing_consent_events x WHERE x.subject_id = p_subject AND x.id <> e.id
             AND (coalesce(x.revision, 0) > e.revision OR x.id > e.id)) THEN RETURN false; END IF;
  SELECT * INTO cur FROM public.marketing_consent_effective(p_subject, clock_timestamp());
  RETURN cur.event_id = e.id AND coalesce(cur.valid_grant, false);
END $$;
REVOKE EXECUTE ON FUNCTION public.marketing_consent_binding_valid(uuid,bigint,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_consent_binding_valid(uuid,bigint,uuid,text,timestamptz) TO service_role;
