-- #352 G3: local disposable replay only. Never apply to Live.
-- object: views:public.v_artist_content_ranking
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "9d193f33e2371f7efa1eaf9853111d9453d2c889cd98404c8795c6b45f21d488", "live_properties_sha256": "0539670c0923329ceba771a8148cc17abc15a9ac4827aac0e19b7a27f25eeeec", "oid": 218973, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "17a7c2648cedf037cd57c9de740cf78c56a1fa48c978db5a3e05dd44bd415dca", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 74753e7541310b25e1f86330df43a2526e5445f6557fc07bfe0a8395747f18f6
CREATE OR REPLACE VIEW public.v_artist_content_ranking WITH (security_invoker=true) AS  SELECT v.company_id,
    v.artist_id,
    v.platform,
    v.content_id,
    v.title,
    v.song_id,
    v.song_title,
    v.song_link_status,
    v.published_at,
    v.permalink,
    v.thumbnail_url,
    v.sound_name,
    v.views,
    v.likes,
    v.comments,
    v.shares,
    g.delta_7d AS views_delta_7d,
    row_number() OVER (PARTITION BY v.artist_id, v.platform ORDER BY v.views DESC NULLS LAST) AS rank_views,
    row_number() OVER (PARTITION BY v.artist_id, v.platform ORDER BY g.delta_7d DESC NULLS LAST) AS rank_growth_7d
   FROM v_content_latest v
     LEFT JOIN v_content_growth g ON g.content_id = v.content_id AND g.metric = 'views'::text;

ALTER VIEW public.v_artist_content_ranking OWNER TO "postgres";
-- END OPERATION 74753e7541310b25e1f86330df43a2526e5445f6557fc07bfe0a8395747f18f6
