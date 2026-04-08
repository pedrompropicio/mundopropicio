
-- Create storage bucket for import analysis reports
INSERT INTO storage.buckets (id, name, public) VALUES ('import-reports', 'import-reports', false);

-- Allow authenticated users to upload reports
CREATE POLICY "Authenticated users can upload import reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'import-reports');

-- Allow authenticated users to view reports
CREATE POLICY "Authenticated users can view import reports"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'import-reports');

-- Allow admin/manager to delete old reports
CREATE POLICY "Admin can delete import reports"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'import-reports' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Add report_url to ticket_import_logs
ALTER TABLE public.ticket_import_logs ADD COLUMN report_url text DEFAULT NULL;
