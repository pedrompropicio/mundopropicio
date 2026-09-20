SET lock_timeout = '5s';
ALTER TABLE crm.google_campaign_insights_daily ADD COLUMN IF NOT EXISTS video_metrics jsonb;
ALTER TABLE crm.google_campaign ADD COLUMN IF NOT EXISTS settings jsonb, ADD COLUMN IF NOT EXISTS reach jsonb;

DO $$
DECLARE f regprocedure; d text; n int;
  velho text := $s$i.raw->>'video_views'$s$;
  novo  text := $s$coalesce(i.video_metrics->>'video_views', i.raw->>'video_views')$s$;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.artist_ads_daily(uuid,integer)'::regprocedure,
    'public.artist_ads_campaigns(uuid,boolean)'::regprocedure]
  LOOP
    d := pg_get_functiondef(f);
    IF position('i.video_metrics' in d) > 0 THEN CONTINUE; END IF;
    n := (length(d) - length(replace(d, velho, ''))) / length(velho);
    IF n <> 2 THEN RAISE EXCEPTION '%: esperava 2 ocorrências, encontrei %', f, n; END IF;
    EXECUTE replace(d, velho, novo);
  END LOOP;
END $$;