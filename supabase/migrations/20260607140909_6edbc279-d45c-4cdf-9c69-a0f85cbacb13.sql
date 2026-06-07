DROP POLICY IF EXISTS "lead_capture_anon_insert" ON public.lead_capture;

CREATE POLICY "lead_capture_public_insert" ON public.lead_capture
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);