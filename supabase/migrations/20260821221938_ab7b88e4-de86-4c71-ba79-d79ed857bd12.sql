DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meta_campaign_insights_daily','meta_adset_insights_daily','meta_ad_insights_daily'] LOOP
    EXECUTE format('ALTER TABLE crm.%I
      ADD COLUMN IF NOT EXISTS video_plays bigint,
      ADD COLUMN IF NOT EXISTS video_3s_views bigint,
      ADD COLUMN IF NOT EXISTS video_thruplays bigint,
      ADD COLUMN IF NOT EXISTS video_p25_watched bigint,
      ADD COLUMN IF NOT EXISTS video_p50_watched bigint,
      ADD COLUMN IF NOT EXISTS video_p75_watched bigint,
      ADD COLUMN IF NOT EXISTS video_p100_watched bigint,
      ADD COLUMN IF NOT EXISTS video_avg_time_watched_sec numeric', t);
  END LOOP;
END $$;