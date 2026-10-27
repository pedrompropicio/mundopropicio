-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Camarim documents updatable by admin or manager"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "05d49369c937f8fb095b30dc024d2d3c3886620a995f76fc25cae2bb6c4f32d3", "oid": 52645, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "d824f5c2987c0940433d8d9201514af66aad60be806b485917bd5656df786012", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 9daa91a40ff6652be200cb18a2e4e00031a311666503ac2e1c0de1def5257560
DROP POLICY IF EXISTS "Camarim documents updatable by admin or manager" ON storage.objects;

CREATE POLICY "Camarim documents updatable by admin or manager" ON storage.objects AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'camarim-documents'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))) WITH CHECK (((bucket_id = 'camarim-documents'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
-- END OPERATION 9daa91a40ff6652be200cb18a2e4e00031a311666503ac2e1c0de1def5257560
