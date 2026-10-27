-- #352 G3: local disposable replay only. Never apply to Live.
-- object: columns:public.artist_songs.smart_link_url
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "cae8e8cf26afc3f5cc6bb4938c21ea52bf064c1eba57d8d1dc6a7cfc821a412b", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "8fe5cd5ac3398fdc195c53c7abba96e52d24ed985347a63ea96b4a739926efe3", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "9333a5ad57183b8807a19494f751dd3d90c40095ea612caad945f4af855de454", "window": "after tail, before final ACL"}
-- BEGIN OPERATION 15e0e869a814cfb2bcf3e761edd06117c8c896417ed1b2ebd27d40a5bcc24eca
ALTER TABLE public.artist_songs DROP COLUMN IF EXISTS smart_link_url;
-- END OPERATION 15e0e869a814cfb2bcf3e761edd06117c8c896417ed1b2ebd27d40a5bcc24eca
