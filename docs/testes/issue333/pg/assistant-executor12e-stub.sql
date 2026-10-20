-- #333 fase12e stub local (após assistant-review12c-stub.sql): sessão JWT, helpers de papel/empresa e tabelas ERP mínimas
-- com as constraints/trigger lidas do projeto. confirm_ticket_office_statement é o CORPO REAL lido do projeto (writer canónico).
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid $$;
CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'company', '')::uuid $$;
CREATE FUNCTION public.has_role(u uuid, r text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.roles_stub WHERE roles_stub.u = $1 AND roles_stub.c = public.current_company_id() AND role = $2) $$;
CREATE FUNCTION public.is_platform_admin(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.has_permission(u uuid, p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p = 'manage_accounts' AND public.has_role(u, 'manager') $$;
CREATE FUNCTION public.row_belongs_to_current_company(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT c = public.current_company_id() $$;
CREATE TABLE public.events (id uuid PRIMARY KEY, company_id uuid NOT NULL, name text);
CREATE TABLE public.financial_accounts (id uuid PRIMARY KEY, company_id uuid NOT NULL, name text, type text, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.ticket_office_statements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, financial_account_id uuid NOT NULL, number text NOT NULL,
  statement_date date NOT NULL, document_total numeric, status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','confirmed'])), document_url text, document_name text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz, confirmed_by uuid, UNIQUE (financial_account_id, number));
CREATE TABLE public.ticket_office_statement_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), statement_id uuid NOT NULL REFERENCES public.ticket_office_statements(id), company_id uuid NOT NULL,
  line_type text NOT NULL CHECK (line_type = ANY (ARRAY['event_right','ticketline_invoice','venue_settlement','advance','carry_over'])), position integer NOT NULL DEFAULT 0, description text NOT NULL,
  amount numeric, pending_document boolean NOT NULL DEFAULT false, event_id uuid, ticket_office_settlement_id uuid, transaction_id uuid, invoice_group_id uuid, previous_statement_id uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT tosl_amount_or_pending CHECK ((amount IS NOT NULL) OR pending_document));
CREATE FUNCTION public.tosl_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text; v_company uuid;
BEGIN
  SELECT status, company_id INTO v_status, v_company FROM public.ticket_office_statements WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
  IF v_status = 'confirmed' THEN RAISE EXCEPTION 'Apuramento Ticketline confirmado: as linhas não se alteram.'; END IF;
  IF TG_OP <> 'DELETE' AND NEW.company_id IS DISTINCT FROM v_company THEN RAISE EXCEPTION 'A linha tem de ser da mesma empresa do apuramento.'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_tosl_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_statement_lines FOR EACH ROW EXECUTE FUNCTION public.tosl_guard();
CREATE TABLE public.ticket_office_settlements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, financial_account_id uuid NOT NULL, event_id uuid NOT NULL,
  settlement_date date NOT NULL, status text NOT NULL DEFAULT 'draft', net_transferred numeric NOT NULL DEFAULT 0, transfer_account_id uuid, transfer_transaction_id uuid, closed_at timestamptz, reversed_at timestamptz);
CREATE TABLE public.transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, event_id uuid, type text NOT NULL, amount numeric NOT NULL, status text NOT NULL,
  paid_amount numeric NOT NULL DEFAULT 0, payment_date date, account_id uuid, operation_key text, reversed_at timestamptz);
CREATE FUNCTION public.confirm_ticket_office_statement(p_statement_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v_sum numeric; v_pending int;
BEGIN
  SELECT * INTO s FROM public.ticket_office_statements WHERE id = p_statement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apuramento não encontrado.'; END IF;
  IF NOT public.row_belongs_to_current_company(s.company_id) THEN RAISE EXCEPTION 'Sem acesso a este apuramento.'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Só admin ou manager confirmam apuramentos.';
  END IF;
  IF s.status = 'confirmed' THEN RAISE EXCEPTION 'Apuramento já confirmado.'; END IF;
  IF s.document_total IS NULL THEN RAISE EXCEPTION 'Falta o total do documento.'; END IF;
  SELECT count(*) FILTER (WHERE pending_document), COALESCE(sum(amount),0)
    INTO v_pending, v_sum FROM public.ticket_office_statement_lines WHERE statement_id = p_statement_id;
  IF v_pending > 0 THEN RAISE EXCEPTION 'Há % linha(s) pendente(s) de documento.', v_pending; END IF;
  IF abs(round(v_sum,2) - s.document_total) > 0.004 THEN
    RAISE EXCEPTION 'Σ linhas (%) ≠ total do documento (%).', round(v_sum,2), s.document_total;
  END IF;
  UPDATE public.ticket_office_statements SET status='confirmed', confirmed_at=now(), confirmed_by=auth.uid(), updated_at=now()
   WHERE id = p_statement_id;
END $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated; GRANT USAGE ON SCHEMA auth TO authenticated;
INSERT INTO public.events VALUES ('e1000000-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222222','E1'),('e2000000-0000-4000-8000-000000000002','22222222-2222-2222-2222-222222222222','E2'),
  ('e3000000-0000-4000-8000-000000000003','22222222-2222-2222-2222-222222222222','E3'),('e4000000-0000-4000-8000-000000000004','22222222-2222-2222-2222-222222222222','E4');
INSERT INTO public.financial_accounts VALUES ('0f000000-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222222','Ticketline','ticket_office',true),
  ('0b000000-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222222','Banco','bank',true);
-- E2: fecho confirmado com transferência "a receber" (pernas pendentes). E3: já creditado.
INSERT INTO public.transactions(id, company_id, event_id, type, amount, status, account_id, operation_key) VALUES
  ('7e200000-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222222','e2000000-0000-4000-8000-000000000002','expense',579.50,'pending','0f000000-0000-4000-8000-000000000001','TRF-FECHO-E2'),
  ('7e200000-0000-4000-8000-000000000002','22222222-2222-2222-2222-222222222222','e2000000-0000-4000-8000-000000000002','income',579.50,'pending','0b000000-0000-4000-8000-000000000001','TRF-FECHO-E2');
INSERT INTO public.transactions(id, company_id, event_id, type, amount, status, paid_amount, payment_date, account_id, operation_key) VALUES
  ('7e300000-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222222','e3000000-0000-4000-8000-000000000003','expense',579.50,'paid',579.50,'2026-10-16','0f000000-0000-4000-8000-000000000001','TRF-FECHO-E3'),
  ('7e300000-0000-4000-8000-000000000002','22222222-2222-2222-2222-222222222222','e3000000-0000-4000-8000-000000000003','income',579.50,'paid',579.50,'2026-10-16','0b000000-0000-4000-8000-000000000001','TRF-FECHO-E3');
INSERT INTO public.ticket_office_settlements(company_id, financial_account_id, event_id, settlement_date, status, net_transferred, transfer_account_id, transfer_transaction_id, closed_at) VALUES
  ('22222222-2222-2222-2222-222222222222','0f000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','2026-10-15','confirmed',579.50,'0b000000-0000-4000-8000-000000000001','7e200000-0000-4000-8000-000000000001',now()),
  ('22222222-2222-2222-2222-222222222222','0f000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000003','2026-10-15','confirmed',579.50,'0b000000-0000-4000-8000-000000000001','7e300000-0000-4000-8000-000000000001',now());
