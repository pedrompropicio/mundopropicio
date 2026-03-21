
-- =============================================
-- 1. transaction_documents: restringir DELETE
-- =============================================
DROP POLICY IF EXISTS "Transaction docs deletable by authenticated" ON public.transaction_documents;
CREATE POLICY "Transaction docs deletable by admin or manager"
  ON public.transaction_documents FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 2. payment_lists: restringir DELETE
-- =============================================
DROP POLICY IF EXISTS "Payment lists deletable by authenticated" ON public.payment_lists;
CREATE POLICY "Payment lists deletable by admin or manager"
  ON public.payment_lists FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 3. payment_list_items: restringir DELETE
-- =============================================
DROP POLICY IF EXISTS "Payment list items deletable by authenticated" ON public.payment_list_items;
CREATE POLICY "Payment list items deletable by admin or manager"
  ON public.payment_list_items FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 4. event_cache_configs: substituir ALL por políticas granulares
-- =============================================
DROP POLICY IF EXISTS "Cache configs manageable by authenticated" ON public.event_cache_configs;
CREATE POLICY "Cache configs insertable by authenticated"
  ON public.event_cache_configs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Cache configs updatable by authenticated"
  ON public.event_cache_configs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Cache configs deletable by admin or manager"
  ON public.event_cache_configs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 5. event_cache_deductions: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Cache deductions manageable by authenticated" ON public.event_cache_deductions;
CREATE POLICY "Cache deductions insertable by authenticated"
  ON public.event_cache_deductions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Cache deductions updatable by authenticated"
  ON public.event_cache_deductions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Cache deductions deletable by admin or manager"
  ON public.event_cache_deductions FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 6. event_dates: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Event dates manageable by authenticated" ON public.event_dates;
CREATE POLICY "Event dates insertable by authenticated"
  ON public.event_dates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Event dates updatable by authenticated"
  ON public.event_dates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Event dates deletable by admin or manager"
  ON public.event_dates FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 7. event_forecasts: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Event forecasts manageable by authenticated" ON public.event_forecasts;
CREATE POLICY "Event forecasts insertable by authenticated"
  ON public.event_forecasts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Event forecasts updatable by authenticated"
  ON public.event_forecasts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Event forecasts deletable by admin or manager"
  ON public.event_forecasts FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 8. event_ticket_lots: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Ticket lots manageable by authenticated" ON public.event_ticket_lots;
CREATE POLICY "Ticket lots insertable by authenticated"
  ON public.event_ticket_lots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Ticket lots updatable by authenticated"
  ON public.event_ticket_lots FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Ticket lots deletable by admin or manager"
  ON public.event_ticket_lots FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 9. event_ticket_zones: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Ticket zones manageable by authenticated" ON public.event_ticket_zones;
CREATE POLICY "Ticket zones insertable by authenticated"
  ON public.event_ticket_zones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Ticket zones updatable by authenticated"
  ON public.event_ticket_zones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Ticket zones deletable by admin or manager"
  ON public.event_ticket_zones FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 10. ticket_sales: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Ticket sales manageable by authenticated" ON public.ticket_sales;
CREATE POLICY "Ticket sales insertable by authenticated"
  ON public.ticket_sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Ticket sales updatable by authenticated"
  ON public.ticket_sales FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Ticket sales deletable by admin or manager"
  ON public.ticket_sales FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 11. cities: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Cities manageable by authenticated" ON public.cities;
CREATE POLICY "Cities insertable by authenticated"
  ON public.cities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Cities updatable by authenticated"
  ON public.cities FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Cities deletable by admin or manager"
  ON public.cities FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 12. venues: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Venues manageable by authenticated" ON public.venues;
CREATE POLICY "Venues insertable by authenticated"
  ON public.venues FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Venues updatable by authenticated"
  ON public.venues FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Venues deletable by admin or manager"
  ON public.venues FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- =============================================
-- 13. venue_reservations: substituir ALL
-- =============================================
DROP POLICY IF EXISTS "Venue reservations manageable by authenticated" ON public.venue_reservations;
CREATE POLICY "Venue reservations insertable by authenticated"
  ON public.venue_reservations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Venue reservations updatable by authenticated"
  ON public.venue_reservations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Venue reservations deletable by admin or manager"
  ON public.venue_reservations FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
