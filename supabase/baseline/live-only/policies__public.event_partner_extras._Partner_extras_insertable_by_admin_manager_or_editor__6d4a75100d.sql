-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.event_partner_extras."Partner extras insertable by admin, manager or editor"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "054579fd12f9da5efe8e9e8fdca2833246aa76146f7d83b8cc863823febbeb1f", "oid": 228941, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "b5d346205520d5ff14cbbeba33e9949e96e8bc3ea197785bfaadebca86fea158", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION d46fb5b5690e984053f48100090e8c41a585ad46cf383a33983c7e115fc2972a
DROP POLICY IF EXISTS "Partner extras insertable by admin, manager or editor" ON public.event_partner_extras;

CREATE POLICY "Partner extras insertable by admin, manager or editor" ON public.event_partner_extras AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
-- END OPERATION d46fb5b5690e984053f48100090e8c41a585ad46cf383a33983c7e115fc2972a
