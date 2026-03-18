
-- Remove existing overly permissive policies for events management
DROP POLICY IF EXISTS "Events can be managed by everyone" ON public.events;
DROP POLICY IF EXISTS "Events can be managed by authenticated users" ON public.events;

-- Allow authenticated users to INSERT and UPDATE events
CREATE POLICY "Events insertable by authenticated"
ON public.events FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Events updatable by authenticated"
ON public.events FOR UPDATE TO authenticated
USING (true);

-- Only admins can DELETE events
CREATE POLICY "Events deletable by admin only"
ON public.events FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
