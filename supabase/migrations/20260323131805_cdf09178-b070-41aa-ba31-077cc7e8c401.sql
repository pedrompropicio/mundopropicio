-- Allow any authenticated user to delete cache deductions (not just admin/manager)
DROP POLICY IF EXISTS "Cache deductions deletable by admin or manager" ON public.event_cache_deductions;
CREATE POLICY "Cache deductions deletable by authenticated" ON public.event_cache_deductions FOR DELETE TO authenticated USING (true);