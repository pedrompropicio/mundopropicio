-- D-ERP179 adenda: shows/eventos sem evento no ERP também ficam 'event'.
CREATE OR REPLACE FUNCTION crm.artist_ads_event_keyword_name(p_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $f$
  SELECT ' '||public.artist_ads_norm(p_name)||' ' ~ ' (show|farra do raio|forro na essencia|fortal) '
$f$;

CREATE OR REPLACE FUNCTION crm.artist_ads_autolink_songs_core(p_artist_id uuid, p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public','crm' AS $function$
DECLARE v_total int := 0; v_n int;
BEGIN
  UPDATE crm.google_campaign gc SET linked_song_id = x.sid
  FROM (SELECT gc2.id, crm.artist_ads_song_for_name(p_artist_id, p_company_id, gc2.name) sid
        FROM crm.google_campaign gc2 JOIN crm.ad_platform_connections c ON c.id = gc2.connection_id
          AND c.connection_scope='artist' AND c.artist_id = p_artist_id
        WHERE gc2.linked_song_id IS NULL AND NOT gc2.linked_song_locked) x
  WHERE gc.id = x.id AND x.sid IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  UPDATE crm.meta_campaign_snapshot ms SET linked_song_id = x.sid
  FROM (SELECT m2.id, crm.artist_ads_song_for_name(p_artist_id, p_company_id, m2.name) sid
        FROM crm.meta_campaign_snapshot m2 JOIN crm.ad_platform_connections c ON c.id = m2.connection_id
          AND c.connection_scope='artist' AND c.artist_id = p_artist_id
        WHERE m2.linked_song_id IS NULL AND NOT m2.linked_song_locked) x
  WHERE ms.id = x.id AND x.sid IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;

  UPDATE crm.google_campaign gc SET link_kind = CASE
      WHEN gc.linked_song_id IS NOT NULL THEN 'song'
      WHEN gc.linked_event_id IS NOT NULL OR crm.artist_ads_event_for_name(p_company_id, gc.name) IS NOT NULL
        OR crm.artist_ads_event_keyword_name(gc.name) THEN 'event'
      WHEN crm.artist_ads_profile_name(gc.name) THEN 'profile' END,
    linked_event_id = coalesce(gc.linked_event_id, CASE WHEN gc.linked_song_id IS NULL AND NOT gc.linked_event_locked
      THEN crm.artist_ads_event_for_name(p_company_id, gc.name) END)
  FROM crm.ad_platform_connections c
  WHERE c.id = gc.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    AND NOT gc.link_kind_locked;

  UPDATE crm.meta_campaign_snapshot ms SET link_kind = CASE
      WHEN ms.linked_song_id IS NOT NULL THEN 'song'
      WHEN ms.linked_event_id IS NOT NULL OR crm.artist_ads_event_for_name(p_company_id, ms.name) IS NOT NULL
        OR crm.artist_ads_event_keyword_name(ms.name) THEN 'event'
      WHEN crm.artist_ads_profile_name(ms.name) THEN 'profile' END,
    linked_event_id = coalesce(ms.linked_event_id, CASE WHEN ms.linked_song_id IS NULL AND NOT ms.linked_event_locked
      THEN crm.artist_ads_event_for_name(p_company_id, ms.name) END)
  FROM crm.ad_platform_connections c
  WHERE c.id = ms.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    AND NOT ms.link_kind_locked;

  UPDATE crm.tiktok_campaign tc SET link_kind = CASE
      WHEN tc.linked_song_id IS NOT NULL THEN 'song'
      WHEN crm.artist_ads_event_keyword_name(tc.name) THEN 'event'
      WHEN crm.artist_ads_profile_name(tc.name) THEN 'profile' END
  FROM crm.ad_platform_connections c
  WHERE c.id = tc.connection_id AND c.connection_scope='artist' AND c.artist_id = p_artist_id
    AND NOT tc.link_kind_locked;

  RETURN v_total;
END $function$;