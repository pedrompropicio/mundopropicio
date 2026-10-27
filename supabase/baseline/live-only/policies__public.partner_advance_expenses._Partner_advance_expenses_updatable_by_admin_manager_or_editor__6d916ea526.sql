-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.partner_advance_expenses."Partner advance expenses updatable by admin, manager or editor"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "dd29e83cae8b3ba86975860eb7468e9c0c0ebd1dcb697fefdb33fd42a34cc902", "oid": 228939, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "6cb12e9b1cbb566d607038b3ec314df76e99397ba5c8061614f465e88badade6", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 7feb792b878f451e23bedaaec4c5f80c29027ab6248b91f215eea02a3b9531da
DROP POLICY IF EXISTS "Partner advance expenses updatable by admin, manager or editor" ON public.partner_advance_expenses;

CREATE POLICY "Partner advance expenses updatable by admin, manager or editor" ON public.partner_advance_expenses AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
-- END OPERATION 7feb792b878f451e23bedaaec4c5f80c29027ab6248b91f215eea02a3b9531da
