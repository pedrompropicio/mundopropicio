-- D-ERP277: bucket festival-edition-videos (público, só vídeo). Mesmos papéis e isolamento por path do portal-marketing-images.
CREATE POLICY festival_edition_videos_select ON storage.objects FOR SELECT
  USING (bucket_id = 'festival-edition-videos');
CREATE POLICY festival_edition_videos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'festival-edition-videos'
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'platform_admin') OR has_role(auth.uid(),'manager')
      OR has_role(auth.uid(),'marketing_manager') OR has_role(auth.uid(),'content_manager') OR has_role(auth.uid(),'editor'))
    AND ((storage.foldername(name))[1])::uuid = current_company_id()
    AND (storage.foldername(name))[2] = 'festival-editions'
    AND lower(storage.extension(name)) IN ('mp4','webm','mov'));
CREATE POLICY festival_edition_videos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'festival-edition-videos'
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'platform_admin') OR has_role(auth.uid(),'manager')
      OR has_role(auth.uid(),'marketing_manager') OR has_role(auth.uid(),'content_manager') OR has_role(auth.uid(),'editor'))
    AND ((storage.foldername(name))[1])::uuid = current_company_id())
  WITH CHECK (bucket_id = 'festival-edition-videos'
    AND ((storage.foldername(name))[1])::uuid = current_company_id()
    AND lower(storage.extension(name)) IN ('mp4','webm','mov'));
CREATE POLICY festival_edition_videos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'festival-edition-videos'
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'platform_admin') OR has_role(auth.uid(),'manager')
      OR has_role(auth.uid(),'marketing_manager') OR has_role(auth.uid(),'content_manager') OR has_role(auth.uid(),'editor'))
    AND ((storage.foldername(name))[1])::uuid = current_company_id());