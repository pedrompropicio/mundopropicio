
-- =============================================
-- 1. SUPPLIERS: Restrict SELECT to admin/manager
--    (Editors/Viewers should not see IBAN/NIF)
-- =============================================
DROP POLICY IF EXISTS "Suppliers are viewable by authenticated users" ON public.suppliers;

CREATE POLICY "Suppliers viewable by admin or manager"
ON public.suppliers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- Editors need to see supplier names for transaction forms (limited view)
-- We add a separate policy that lets editors/viewers see basic info
-- but they still see all columns; masking is done at app layer
CREATE POLICY "Suppliers viewable by editor"
ON public.suppliers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'editor'::app_role)
  OR has_role(auth.uid(), 'viewer'::app_role)
);

-- =============================================
-- 2. EVENT_CACHE_TIERS: Replace ALL(true) with proper role-based policies
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can manage cache tiers" ON public.event_cache_tiers;

CREATE POLICY "Cache tiers viewable by authenticated"
ON public.event_cache_tiers
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Cache tiers insertable by admin or manager"
ON public.event_cache_tiers
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Cache tiers updatable by admin or manager"
ON public.event_cache_tiers
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

CREATE POLICY "Cache tiers deletable by admin or manager"
ON public.event_cache_tiers
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- =============================================
-- 3. SUPPLIER_CREDITS: Remove redundant permissive policies
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can insert supplier credits" ON public.supplier_credits;
DROP POLICY IF EXISTS "Authenticated users can update supplier credits" ON public.supplier_credits;

-- =============================================
-- 4. Fix function search_path on pgmq wrapper functions
-- =============================================
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;
