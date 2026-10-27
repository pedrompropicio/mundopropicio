-- #352 G3: local disposable replay only. Never apply to Live.
-- object: views:public.v_song_content
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "a214b70ae302c64332e1355dc075b03ca1b842f5b975b620313fecd680a3d541", "live_properties_sha256": "d296f752597a6f5ecfe5851a9782dfbf378a95226992056a25dcb1ef6178347f", "oid": 218978, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "43eb8cde4532dbc8f57e16d56497e1a45326f1c318abc381716edb3bce8f556c", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 891b42e085443b61794d5a81f4e6bcf69f1419c8840499a085486a16090b0d35
CREATE OR REPLACE VIEW public.v_song_content WITH (security_invoker=true) AS  SELECT s.id AS song_id,
    s.company_id,
    s.artist_id,
    s.title AS song_title,
    v.platform,
    count(*) AS videos,
    count(*) FILTER (WHERE v.song_link_status = 'confirmed'::text) AS videos_confirmed,
    count(*) FILTER (WHERE v.song_link_status = 'estimated'::text) AS videos_estimated,
    sum(COALESCE(v.views, 0::numeric)) AS total_views,
    sum(COALESCE(v.likes, 0::numeric)) AS total_likes,
    sum(COALESCE(v.comments, 0::numeric)) AS total_comments,
    sum(COALESCE(v.shares, 0::numeric)) AS total_shares,
    sum(COALESCE(v.views, 0::numeric)) FILTER (WHERE v.song_link_status = 'confirmed'::text) AS total_views_confirmed,
    sum(COALESCE(v.views, 0::numeric)) FILTER (WHERE v.song_link_status = 'estimated'::text) AS total_views_estimated,
    sum(COALESCE(v.likes, 0::numeric)) FILTER (WHERE v.song_link_status = 'confirmed'::text) AS total_likes_confirmed,
    sum(COALESCE(v.likes, 0::numeric)) FILTER (WHERE v.song_link_status = 'estimated'::text) AS total_likes_estimated
   FROM artist_songs s
     JOIN v_content_latest v ON v.song_id = s.id
  GROUP BY s.id, s.company_id, s.artist_id, s.title, v.platform;

ALTER VIEW public.v_song_content OWNER TO "postgres";
-- END OPERATION 891b42e085443b61794d5a81f4e6bcf69f1419c8840499a085486a16090b0d35
