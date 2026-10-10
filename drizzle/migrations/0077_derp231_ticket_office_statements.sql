-- #303 — Apuramento da bilheteira (Ticketline): cabeçalho + linhas.
-- "Apuramento Ticketline" ≠ event_settlements (fechamento dos sócios).

CREATE TABLE public.ticket_office_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  number text NOT NULL,
  statement_date date NOT NULL,
  document_total numeric(14,2),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed')),
  document_url text,
  document_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by uuid,
  UNIQUE (financial_account_id, number)
);

CREATE TABLE public.ticket_office_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.ticket_office_statements(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  line_type text NOT NULL CHECK (line_type IN ('event_right','ticketline_invoice','venue_settlement','advance','carry_over')),
  position integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  -- Com sinal: + a favor da MP (direito), − a favor da Ticketline (faturas, repasses).
  -- NULL só quando pending_document = true (valor por provar em documento).
  amount numeric(14,2),
  pending_document boolean NOT NULL DEFAULT false,
  event_id uuid REFERENCES public.events(id),
  ticket_office_settlement_id uuid REFERENCES public.ticket_office_settlements(id),
  transaction_id uuid REFERENCES public.transactions(id),
  invoice_group_id uuid,
  previous_statement_id uuid REFERENCES public.ticket_office_statements(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tosl_amount_or_pending CHECK (amount IS NOT NULL OR pending_document)
);
CREATE INDEX tosl_statement_idx ON public.ticket_office_statement_lines(statement_id);
CREATE UNIQUE INDEX tosl_transaction_once ON public.ticket_office_statement_lines(transaction_id) WHERE transaction_id IS NOT NULL;

ALTER TABLE public.ticket_office_settlements
  ADD COLUMN IF NOT EXISTS statement_id uuid REFERENCES public.ticket_office_statements(id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_office_statements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_office_statement_lines TO authenticated;
GRANT ALL ON public.ticket_office_statements TO service_role;
GRANT ALL ON public.ticket_office_statement_lines TO service_role;

ALTER TABLE public.ticket_office_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_office_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tos_select ON public.ticket_office_statements FOR SELECT TO authenticated USING (true);
CREATE POLICY tos_write ON public.ticket_office_statements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'));
CREATE POLICY company_isolation_tos ON public.ticket_office_statements AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE POLICY tosl_select ON public.ticket_office_statement_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY tosl_write ON public.ticket_office_statement_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'));
CREATE POLICY company_isolation_tosl ON public.ticket_office_statement_lines AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));

-- Linhas de um apuramento confirmado não mudam; a empresa da linha = a do cabeçalho.
CREATE OR REPLACE FUNCTION public.tosl_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_company uuid;
BEGIN
  SELECT status, company_id INTO v_status, v_company FROM public.ticket_office_statements
   WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
  IF v_status = 'confirmed' THEN
    RAISE EXCEPTION 'Apuramento Ticketline confirmado: as linhas não se alteram.';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'A linha tem de ser da mesma empresa do apuramento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.tosl_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_tosl_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ticket_office_statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.tosl_guard();

-- Confirmar: Σ linhas = total do documento ao cêntimo e nenhuma linha pendente de documento.
CREATE OR REPLACE FUNCTION public.confirm_ticket_office_statement(p_statement_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.confirm_ticket_office_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_ticket_office_statement(uuid) TO authenticated;

-- event_ticket_office_advances passa a histórico só de leitura (dados ficam).
CREATE OR REPLACE FUNCTION public.block_ticket_office_advances_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Adiantamentos de bilheteira são histórico só de leitura (#303). Os repasses registam-se no Apuramento Ticketline.';
END $$;
REVOKE ALL ON FUNCTION public.block_ticket_office_advances_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_block_ticket_office_advances_write BEFORE INSERT OR UPDATE ON public.event_ticket_office_advances
  FOR EACH ROW EXECUTE FUNCTION public.block_ticket_office_advances_write();
COMMENT ON TABLE public.event_ticket_office_advances IS 'DEPRECATED (#303, 10/10/2026): histórico só de leitura; repasses vivem em ticket_office_statement_lines (line_type advance).';
