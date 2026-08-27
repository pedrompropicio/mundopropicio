CREATE TABLE public.partner_capital_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.event_partners(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('aporte','devolucao','distribuicao')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_capital_moves TO authenticated;
GRANT ALL ON public.partner_capital_moves TO service_role;

ALTER TABLE public.partner_capital_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner capital moves viewable by privileged roles"
ON public.partner_capital_moves FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'viewer'::app_role)
);

CREATE POLICY "partner_capital_moves_select_partner"
ON public.partner_capital_moves FOR SELECT TO authenticated
USING (
  user_has_event_access(auth.uid(), event_id)
  AND EXISTS (
    SELECT 1 FROM public.event_partners ep
    WHERE ep.id = partner_capital_moves.partner_id
      AND ep.supplier_id = user_supplier_id(auth.uid())
  )
);

CREATE POLICY "pcm_insert_admin_manager"
ON public.partner_capital_moves FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "pcm_update_admin_manager"
ON public.partner_capital_moves FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "pcm_delete_admin_manager"
ON public.partner_capital_moves FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "company_isolation_partner_capital_moves"
ON public.partner_capital_moves AS RESTRICTIVE FOR ALL TO authenticated
USING (company_id = current_company_id())
WITH CHECK (company_id = current_company_id());

CREATE INDEX idx_partner_capital_moves_event ON public.partner_capital_moves(event_id);
CREATE INDEX idx_partner_capital_moves_partner ON public.partner_capital_moves(partner_id);
CREATE INDEX idx_partner_capital_moves_tx ON public.partner_capital_moves(transaction_id);
CREATE INDEX idx_partner_capital_moves_company ON public.partner_capital_moves(company_id);

CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.partner_capital_moves
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

CREATE TRIGGER trg_partner_capital_moves_updated_at BEFORE UPDATE ON public.partner_capital_moves
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();