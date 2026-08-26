DROP POLICY IF EXISTS home_videos_public_read ON public.home_videos;

CREATE POLICY home_videos_public_read
  ON public.home_videos
  FOR SELECT
  TO anon, authenticated
  USING (portal_visible = true);