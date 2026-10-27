-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:storage.objects."Camarim documents insertable by admin or manager"
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "9a52860c51203cf86846bd87f2704f22e6a94c5458263e4df54905dd529498cd", "oid": 52644, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "c7a32999f366d47576395bd0ef9acabfcbdac1c8adac6f18f35975a60c713143", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 229b50b782f58dfdb373fdc7be9c780600713ca85bbf0b006f6bc28fa047df7d
DROP POLICY IF EXISTS "Camarim documents insertable by admin or manager" ON storage.objects;

CREATE POLICY "Camarim documents insertable by admin or manager" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'camarim-documents'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
-- END OPERATION 229b50b782f58dfdb373fdc7be9c780600713ca85bbf0b006f6bc28fa047df7d
