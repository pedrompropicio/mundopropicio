-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.ticket_sales.ticket_sales_zone_id_fkey
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "b0944b863e7d0923e95c1e903d4c9da64dd998c9e6b8bc5db32125626e620ae8", "live_properties_sha256": "8596446deca9089bbc3d5b6818bda6207d66cf2dea3ec01e36f50c24be8a729a", "oid": 179970, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "b688a40986ad4075efb1f4ef6d3e99b904f8591488177380567f7c7d45d0e883", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 4f06caf04a9847255c4fd0dd668fc1c5a83fa02581f1d2b02c2c522546b0b1fe
ALTER TABLE public.ticket_sales DROP CONSTRAINT IF EXISTS ticket_sales_zone_id_fkey;

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ticket_sales'::regclass AND conname='ticket_sales_zone_id_fkey') THEN
  ALTER TABLE public.ticket_sales ADD CONSTRAINT ticket_sales_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES event_ticket_zones(id) ON DELETE RESTRICT;
 END IF;
END $baseline_constraint$;
-- END OPERATION 4f06caf04a9847255c4fd0dd668fc1c5a83fa02581f1d2b02c2c522546b0b1fe
