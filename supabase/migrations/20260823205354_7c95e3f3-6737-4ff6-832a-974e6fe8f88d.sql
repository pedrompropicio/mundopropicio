CREATE TABLE IF NOT EXISTS public.ticketline_daily_ticket_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sale_date date NOT NULL,
  ticket_type text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  total_value numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticketline_daily_ticket_types_unique UNIQUE (event_id, sale_date, ticket_type)
);

COMMENT ON COLUMN public.ticketline_daily_ticket_types.company_id IS
  'NOT NULL SEM default current_company_id() e SEM trigger set_company_id_on_insert(): a edge function escreve-o explicitamente a partir de ticketline_sync_config.company_id (issue #71 — sob service_role auth.uid() e NULL).';

CREATE INDEX IF NOT EXISTS ticketline_daily_ticket_types_event_date_idx
  ON public.ticketline_daily_ticket_types (event_id, sale_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticketline_daily_ticket_types TO authenticated;
GRANT ALL ON public.ticketline_daily_ticket_types TO service_role;

ALTER TABLE public.ticketline_daily_ticket_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticketline_daily_ticket_types_select_company" ON public.ticketline_daily_ticket_types;
CREATE POLICY "ticketline_daily_ticket_types_select_company"
ON public.ticketline_daily_ticket_types FOR SELECT TO authenticated
USING (company_id = current_company_id());

DROP POLICY IF EXISTS "ticketline_daily_ticket_types_modify_admin_manager_editor" ON public.ticketline_daily_ticket_types;
CREATE POLICY "ticketline_daily_ticket_types_modify_admin_manager_editor"
ON public.ticketline_daily_ticket_types FOR ALL TO authenticated
USING (company_id = current_company_id() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)))
WITH CHECK (company_id = current_company_id() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)));

CREATE TRIGGER update_ticketline_daily_ticket_types_updated_at
BEFORE UPDATE ON public.ticketline_daily_ticket_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();