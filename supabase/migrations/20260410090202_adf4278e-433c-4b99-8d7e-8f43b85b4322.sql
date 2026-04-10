
-- cities
DROP POLICY IF EXISTS "Cities insertable by authenticated" ON public.cities;
CREATE POLICY "Cities insertable by privileged roles" ON public.cities FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

DROP POLICY IF EXISTS "Cities updatable by authenticated" ON public.cities;
CREATE POLICY "Cities updatable by privileged roles" ON public.cities FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- event_dates
DROP POLICY IF EXISTS "Event dates insertable by authenticated" ON public.event_dates;
CREATE POLICY "Event dates insertable by admin or manager" ON public.event_dates FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Event dates updatable by authenticated" ON public.event_dates;
CREATE POLICY "Event dates updatable by admin or manager" ON public.event_dates FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- event_partners
DROP POLICY IF EXISTS "Event partners insertable by authenticated" ON public.event_partners;
CREATE POLICY "Event partners insertable by admin or manager" ON public.event_partners FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Event partners updatable by authenticated" ON public.event_partners;
CREATE POLICY "Event partners updatable by admin or manager" ON public.event_partners FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- event_ticket_lots
DROP POLICY IF EXISTS "Ticket lots insertable by authenticated" ON public.event_ticket_lots;
CREATE POLICY "Ticket lots insertable by privileged roles" ON public.event_ticket_lots FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

DROP POLICY IF EXISTS "Ticket lots updatable by authenticated" ON public.event_ticket_lots;
CREATE POLICY "Ticket lots updatable by privileged roles" ON public.event_ticket_lots FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- event_ticket_zones
DROP POLICY IF EXISTS "Ticket zones insertable by authenticated" ON public.event_ticket_zones;
CREATE POLICY "Ticket zones insertable by privileged roles" ON public.event_ticket_zones FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

DROP POLICY IF EXISTS "Ticket zones updatable by authenticated" ON public.event_ticket_zones;
CREATE POLICY "Ticket zones updatable by privileged roles" ON public.event_ticket_zones FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- payment_lists
DROP POLICY IF EXISTS "Payment lists insertable by authenticated" ON public.payment_lists;
CREATE POLICY "Payment lists insertable by privileged roles" ON public.payment_lists FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

DROP POLICY IF EXISTS "Payment lists updatable by authenticated" ON public.payment_lists;
CREATE POLICY "Payment lists updatable by privileged roles" ON public.payment_lists FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- payment_list_items
DROP POLICY IF EXISTS "Payment list items insertable by authenticated" ON public.payment_list_items;
CREATE POLICY "Payment list items insertable by privileged roles" ON public.payment_list_items FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- supplier_documents
DROP POLICY IF EXISTS "Supplier documents insertable by authenticated" ON public.supplier_documents;
CREATE POLICY "Supplier documents insertable by privileged roles" ON public.supplier_documents FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));
