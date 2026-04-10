
DROP POLICY IF EXISTS "Authenticated users can create import logs" ON public.ticket_import_logs;
CREATE POLICY "Import logs insertable by privileged roles" ON public.ticket_import_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));
