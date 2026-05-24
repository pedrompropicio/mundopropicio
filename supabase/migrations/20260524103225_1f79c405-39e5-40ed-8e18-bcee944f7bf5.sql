-- Restrict suppliers write access to admin/manager only (remove editor)
DROP POLICY IF EXISTS "Suppliers insertable by privileged roles" ON public.suppliers;
DROP POLICY IF EXISTS "Suppliers updatable by privileged roles" ON public.suppliers;

CREATE POLICY "Suppliers insertable by admin or manager"
ON public.suppliers
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Suppliers updatable by admin or manager"
ON public.suppliers
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Tighten ticket_sales SELECT to company-scoped (mitigates Realtime channel-level leakage)
DROP POLICY IF EXISTS "Ticket sales viewable by authenticated" ON public.ticket_sales;

CREATE POLICY "Ticket sales viewable by company members"
ON public.ticket_sales
FOR SELECT
TO authenticated
USING (company_id = current_company_id());