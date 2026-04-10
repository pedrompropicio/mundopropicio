
-- Drop old permissive policies that coexist with new restrictive ones
DROP POLICY IF EXISTS "Ticket zones insertable by authenticated" ON public.event_ticket_zones;
DROP POLICY IF EXISTS "Ticket zones updatable by authenticated" ON public.event_ticket_zones;
DROP POLICY IF EXISTS "Ticket lots insertable by authenticated" ON public.event_ticket_lots;
DROP POLICY IF EXISTS "Ticket lots updatable by authenticated" ON public.event_ticket_lots;
DROP POLICY IF EXISTS "Event dates insertable by authenticated" ON public.event_dates;
DROP POLICY IF EXISTS "Event dates updatable by authenticated" ON public.event_dates;
DROP POLICY IF EXISTS "Cities insertable by authenticated" ON public.cities;
DROP POLICY IF EXISTS "Cities updatable by authenticated" ON public.cities;
DROP POLICY IF EXISTS "Audit log can be inserted by authenticated" ON public.transaction_audit_log;
DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;

-- ticket_sales: restrict INSERT/UPDATE to privileged roles
DROP POLICY IF EXISTS "Ticket sales insertable by authenticated" ON public.ticket_sales;
CREATE POLICY "Ticket sales insertable by privileged roles" ON public.ticket_sales FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

DROP POLICY IF EXISTS "Ticket sales updatable by authenticated" ON public.ticket_sales;
CREATE POLICY "Ticket sales updatable by privileged roles" ON public.ticket_sales FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- venues: restrict INSERT/UPDATE to privileged roles
DROP POLICY IF EXISTS "Venues insertable by authenticated" ON public.venues;
CREATE POLICY "Venues insertable by privileged roles" ON public.venues FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

DROP POLICY IF EXISTS "Venues updatable by authenticated" ON public.venues;
CREATE POLICY "Venues updatable by privileged roles" ON public.venues FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- transaction_documents: restrict INSERT to privileged roles
DROP POLICY IF EXISTS "Transaction docs insertable by authenticated" ON public.transaction_documents;
CREATE POLICY "Transaction docs insertable by privileged roles" ON public.transaction_documents FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- venue_reservations: fix if needed
DROP POLICY IF EXISTS "Venue reservations insertable by authenticated" ON public.venue_reservations;
CREATE POLICY "Venue reservations insertable by privileged roles" ON public.venue_reservations FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Venue reservations updatable by authenticated" ON public.venue_reservations;
CREATE POLICY "Venue reservations updatable by privileged roles" ON public.venue_reservations FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Venue reservations deletable by authenticated" ON public.venue_reservations;
CREATE POLICY "Venue reservations deletable by privileged roles" ON public.venue_reservations FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
