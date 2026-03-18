
-- Create storage bucket for database backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('database-backups', 'database-backups', false);

-- Only admins can manage backup files
CREATE POLICY "Backup files viewable by admin"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'database-backups' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Backup files insertable by admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'database-backups' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Backup files deletable by admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'database-backups' AND public.has_role(auth.uid(), 'admin'));
