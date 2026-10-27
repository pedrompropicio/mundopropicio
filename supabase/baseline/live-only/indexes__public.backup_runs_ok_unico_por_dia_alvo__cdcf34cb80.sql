-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.backup_runs_ok_unico_por_dia_alvo
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "a40a29b476da8c0381d8376b9ca037bde912ab30d7a5377a3a2906dd5ab07878", "live_properties_sha256": "b1d8beff8e7d41a4789609803b1e69c8ec06b5a4a1bac52b786127f3ba9a5e1f", "oid": 236122, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "97d2dadb1f4f5e7f00494c17a2eb991d4790485b6766ad236d7936a690f2c318", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION cd22a60d578801e88f91cc20da0c60db826b10bb26c9e95b1c0ed4b36c703f8f
DROP INDEX IF EXISTS public.backup_runs_ok_unico_por_dia_alvo;

CREATE UNIQUE INDEX IF NOT EXISTS backup_runs_ok_unico_por_dia_alvo ON public.backup_runs USING btree (run_date, scope, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE ((status = 'ok'::text) AND (scope <> ALL (ARRAY['restore'::text, 'restore_test'::text])));
-- END OPERATION cd22a60d578801e88f91cc20da0c60db826b10bb26c9e95b1c0ed4b36c703f8f
