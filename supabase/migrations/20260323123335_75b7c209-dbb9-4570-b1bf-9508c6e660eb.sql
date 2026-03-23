
-- =====================================================
-- RESTRINGIR INSERT nas tabelas operacionais/financeiras
-- Apenas admin, manager e editor podem inserir
-- =====================================================

-- TRANSACTIONS: restringir INSERT
DROP POLICY IF EXISTS "Transactions insertable by authenticated" ON public.transactions;
CREATE POLICY "Transactions insertable by privileged roles" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- TRANSACTIONS: restringir UPDATE
DROP POLICY IF EXISTS "Transactions updatable by authenticated" ON public.transactions;
CREATE POLICY "Transactions updatable by privileged roles" ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- QUOTATIONS: restringir INSERT
DROP POLICY IF EXISTS "Quotations insertable by authenticated" ON public.quotations;
CREATE POLICY "Quotations insertable by privileged roles" ON public.quotations
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- QUOTATIONS: restringir UPDATE
DROP POLICY IF EXISTS "Quotations updatable by authenticated" ON public.quotations;
CREATE POLICY "Quotations updatable by privileged roles" ON public.quotations
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- RECURRING_TRANSACTIONS: restringir INSERT
DROP POLICY IF EXISTS "Recurring transactions insertable by authenticated" ON public.recurring_transactions;
CREATE POLICY "Recurring transactions insertable by privileged roles" ON public.recurring_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- RECURRING_TRANSACTIONS: restringir UPDATE
DROP POLICY IF EXISTS "Recurring transactions updatable by authenticated" ON public.recurring_transactions;
CREATE POLICY "Recurring transactions updatable by privileged roles" ON public.recurring_transactions
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- SUPPLIERS: restringir INSERT
DROP POLICY IF EXISTS "Suppliers insertable by authenticated" ON public.suppliers;
CREATE POLICY "Suppliers insertable by privileged roles" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- SUPPLIERS: restringir UPDATE
DROP POLICY IF EXISTS "Suppliers updatable by authenticated" ON public.suppliers;
CREATE POLICY "Suppliers updatable by privileged roles" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- EVENTS: restringir INSERT
DROP POLICY IF EXISTS "Events insertable by authenticated" ON public.events;
CREATE POLICY "Events insertable by privileged roles" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- EVENTS: restringir UPDATE
DROP POLICY IF EXISTS "Events updatable by authenticated" ON public.events;
CREATE POLICY "Events updatable by privileged roles" ON public.events
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- EVENT_FORECASTS: restringir INSERT
DROP POLICY IF EXISTS "Event forecasts insertable by authenticated" ON public.event_forecasts;
CREATE POLICY "Event forecasts insertable by privileged roles" ON public.event_forecasts
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- EVENT_FORECASTS: restringir UPDATE
DROP POLICY IF EXISTS "Event forecasts updatable by authenticated" ON public.event_forecasts;
CREATE POLICY "Event forecasts updatable by privileged roles" ON public.event_forecasts
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );
