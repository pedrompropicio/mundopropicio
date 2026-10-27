-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.event_partner_extras."Partner extras updatable by admin, manager or editor"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "81b0d1dcc018d5c37b038a97002b1fdd5b171063fd27853dcb40351c5ac85766", "oid": 228942, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "7b76b66412d9d5ebfea15e6ec5fdb7e7d8e2279ca6d366435430a21e9fb9e899", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 510654226466d030893c205325724640f95b34b4bb2c05bd57c85b20dcec4b57
DROP POLICY IF EXISTS "Partner extras updatable by admin, manager or editor" ON public.event_partner_extras;

CREATE POLICY "Partner extras updatable by admin, manager or editor" ON public.event_partner_extras AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
-- END OPERATION 510654226466d030893c205325724640f95b34b4bb2c05bd57c85b20dcec4b57
