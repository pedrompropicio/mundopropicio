-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.partner_advance_expenses."Partner advance expenses insertable by admin, manager or editor"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "42f61f07db931d5911702edc4a9b6857aa245f7ecfc811c15e63b7bfc073c46f", "oid": 228938, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "8a7dc0487cfd551e701454163301e7ade21ecdf1c6db563f47e0e06454f8602d", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 3c97a551af6ea03bcac372cad804315644dcfdbc8260023198a9a1955df0eebe
DROP POLICY IF EXISTS "Partner advance expenses insertable by admin, manager or editor" ON public.partner_advance_expenses;

CREATE POLICY "Partner advance expenses insertable by admin, manager or editor" ON public.partner_advance_expenses AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role)));
-- END OPERATION 3c97a551af6ea03bcac372cad804315644dcfdbc8260023198a9a1955df0eebe
