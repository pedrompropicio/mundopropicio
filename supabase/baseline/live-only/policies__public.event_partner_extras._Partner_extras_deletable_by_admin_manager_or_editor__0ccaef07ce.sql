-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.event_partner_extras."Partner extras deletable by admin, manager or editor"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "3e7a28fcdb1a9c12debd483b9f7052660a35deb2ebf95de485b5d085afd951f0", "oid": 228943, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "49e2dd6eeaf43c9d361ca8a72004ea8c9a7ef6a38b3a23a0da17bc2a846f31f4", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 323877a849e5b015a86126573114e700500f9ff84ef852a3aa0e83daca33c0d6
DROP POLICY IF EXISTS "Partner extras deletable by admin, manager or editor" ON public.event_partner_extras;

CREATE POLICY "Partner extras deletable by admin, manager or editor" ON public.event_partner_extras AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
-- END OPERATION 323877a849e5b015a86126573114e700500f9ff84ef852a3aa0e83daca33c0d6
