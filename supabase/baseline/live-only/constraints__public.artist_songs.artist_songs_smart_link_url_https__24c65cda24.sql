-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.artist_songs.artist_songs_smart_link_url_https
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "cae8e8cf26afc3f5cc6bb4938c21ea52bf064c1eba57d8d1dc6a7cfc821a412b", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "3b780a7c1d6d6a4289979190f8cf051f32c9892d09131b68f93b103de651a663", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "0b2987b355fc58d7dbbd27e98d2407332661f507b8770957f354b775e3fab9bd", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 1f2e5190274c1eeb095e80edc6b28f4397eb8b9f9301186df4444862be898771
ALTER TABLE public.artist_songs DROP CONSTRAINT IF EXISTS artist_songs_smart_link_url_https;
-- END OPERATION 1f2e5190274c1eeb095e80edc6b28f4397eb8b9f9301186df4444862be898771
