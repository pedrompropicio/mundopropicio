-- Documentos do apuramento de bilheteira (Ticketline: apuramento, fatura, mapa de vendas).
-- Modelo: public.camarim_item_documents (colunas, trigger set_company_id_on_insert,
-- RESTRICTIVE company_isolation + admin/manager ALL + SELECT staff, índices).
CREATE TABLE public.ticket_office_statement_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL,
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint,
  document_source text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_office_statement_documents_statement_id_fkey
    FOREIGN KEY (statement_id) REFERENCES public.ticket_office_statements(id) ON DELETE CASCADE,
  CONSTRAINT ticket_office_statement_documents_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT ticket_office_statement_documents_source_chk
    CHECK (document_source IN ('apuramento','fatura','mapa_vendas','outro'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_office_statement_documents TO authenticated;
GRANT ALL ON public.ticket_office_statement_documents TO service_role;
REVOKE ALL ON public.ticket_office_statement_documents FROM anon;

ALTER TABLE public.ticket_office_statement_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_isolation_ticket_office_statement_documents
  ON public.ticket_office_statement_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Ticket office statement documents manageable by admin or manager"
  ON public.ticket_office_statement_documents AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'manager'::app_role));

CREATE POLICY ticket_office_statement_documents_select_privileged_roles
  ON public.ticket_office_statement_documents AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_staff_role((SELECT auth.uid())));

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.ticket_office_statement_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

CREATE INDEX idx_ticket_office_statement_documents_statement_id ON public.ticket_office_statement_documents (statement_id);
CREATE INDEX idx_ticket_office_statement_documents_company ON public.ticket_office_statement_documents (company_id);

NOTIFY pgrst, 'reload schema';