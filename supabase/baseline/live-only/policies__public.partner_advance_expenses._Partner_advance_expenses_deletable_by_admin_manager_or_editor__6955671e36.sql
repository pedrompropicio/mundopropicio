-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.partner_advance_expenses."Partner advance expenses deletable by admin, manager or editor"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "ba5cb96eef8ba71bdfd677295f90cbf2f031a13693bf234c4677e14ada9b3dfb", "oid": 228940, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "34dc1bc62c7a7ca4a004ceb1121d644b8447d249af84415f75d9f263408abacf", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 50f07a1188fda0cba054987e7e1e1fc1828dd00923113c64eff10da51ef592ee
DROP POLICY IF EXISTS "Partner advance expenses deletable by admin, manager or editor" ON public.partner_advance_expenses;

CREATE POLICY "Partner advance expenses deletable by admin, manager or editor" ON public.partner_advance_expenses AS PERMISSIVE FOR DELETE TO PUBLIC USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
-- END OPERATION 50f07a1188fda0cba054987e7e1e1fc1828dd00923113c64eff10da51ef592ee
