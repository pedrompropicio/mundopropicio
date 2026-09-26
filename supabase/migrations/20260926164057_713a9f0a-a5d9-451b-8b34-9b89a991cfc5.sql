-- Revisor Google: empresa-sandbox + apagamento YouTube 30 dias após desligar (D-ERP145)
INSERT INTO public.companies (id, legal_name, display_name, slug, country, currency, timezone, status)
VALUES ('de0466af-9d6e-49e6-8d73-ca8bd5757f0f', '[TESTE] Google Review', '[TESTE] Google Review', 'teste-google-review', 'BR', 'BRL', 'America/Fortaleza', 'active')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE a uuid := '860c4fea-b154-4146-98da-9c25564ea926'; c uuid := 'de0466af-9d6e-49e6-8d73-ca8bd5757f0f';
BEGIN
  UPDATE public.artists SET company_id = c WHERE id = a;
  UPDATE public.artist_channels SET company_id = c WHERE artist_id = a;
  UPDATE public.artist_channel_connections SET company_id = c WHERE artist_id = a;
  UPDATE public.artist_metrics_daily SET company_id = c WHERE artist_id = a;
  UPDATE public.sync_runs SET company_id = c WHERE artist_id = a;
END $$;

ALTER TABLE public.artist_channels ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
COMMENT ON COLUMN public.artist_channels.revoked_at IS 'Quando a ligação Google/YouTube foi desligada. Dados YouTube apagados 30 dias depois (purge_revoked_youtube_data).';

CREATE OR REPLACE FUNCTION public.artist_delete_channel_connection(p_artist_channel_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_deleted int; v_google int;
BEGIN
  SELECT count(*) INTO v_google FROM public.artist_channel_connections
   WHERE artist_channel_id = p_artist_channel_id AND provider = 'google';
  DELETE FROM public.artist_channel_connections WHERE artist_channel_id = p_artist_channel_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_google > 0 THEN
    UPDATE public.artist_channels SET revoked_at = now() WHERE id = p_artist_channel_id;
  END IF;
  RETURN v_deleted > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_revoked_youtube_data()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; n_m int := 0; n_c int := 0; n_cm int := 0; n_d int := 0; x int; ch int := 0;
BEGIN
  FOR r IN SELECT ac.id, ac.artist_id FROM public.artist_channels ac
    WHERE ac.platform = 'youtube' AND ac.revoked_at IS NOT NULL AND ac.revoked_at < now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.artist_channel_connections k WHERE k.artist_channel_id = ac.id)
  LOOP
    ch := ch + 1;
    DELETE FROM public.artist_metrics_daily WHERE artist_id = r.artist_id AND (channel_id = r.id OR platform = 'youtube'); GET DIAGNOSTICS x = ROW_COUNT; n_m := n_m + x;
    DELETE FROM public.artist_content_metrics_daily WHERE artist_id = r.artist_id AND platform = 'youtube'; GET DIAGNOSTICS x = ROW_COUNT; n_cm := n_cm + x;
    DELETE FROM public.artist_content WHERE artist_id = r.artist_id AND platform = 'youtube'; GET DIAGNOSTICS x = ROW_COUNT; n_c := n_c + x;
    DELETE FROM public.artist_audience_demographics WHERE artist_id = r.artist_id AND platform = 'youtube'; GET DIAGNOSTICS x = ROW_COUNT; n_d := n_d + x;
    UPDATE public.artist_channels SET revoked_at = NULL, auth_status = 'revoked_purged' WHERE id = r.id;
  END LOOP;
  RETURN jsonb_build_object('channels', ch, 'metrics', n_m, 'content', n_c, 'content_metrics', n_cm, 'demographics', n_d);
END;
$function$;
REVOKE ALL ON FUNCTION public.purge_revoked_youtube_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_revoked_youtube_data() TO service_role;

DO $$ BEGIN
  PERFORM cron.unschedule('carreira-youtube-purge-revogados-diario') FROM cron.job WHERE jobname = 'carreira-youtube-purge-revogados-diario';
  PERFORM cron.schedule('carreira-youtube-purge-revogados-diario', '0 4 * * *', 'select public.purge_revoked_youtube_data()');
END $$;