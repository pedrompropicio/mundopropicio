-- #352 G3: local disposable replay only. Never apply to Live.
-- object: constraints:public.ticket_sales.ticket_sales_lot_id_fkey
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "d5d187cb0776bdce36d421757114e6459900c5e0ce3b1f89587f7981cf616b24", "live_properties_sha256": "7190c028601ba6ac131585f10812145585f8003b29ef099ed635c2b89140f721", "oid": 179965, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "1eba2c2318c12f887af5ec61c721068f6cae7dfb4488315cb7d83486da3e256a", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 8ecec56c77eafaa0128a59c6536c6c85a5d8e03e20b0843f61cdd8aac96899d1
ALTER TABLE public.ticket_sales DROP CONSTRAINT IF EXISTS ticket_sales_lot_id_fkey;

DO $baseline_constraint$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ticket_sales'::regclass AND conname='ticket_sales_lot_id_fkey') THEN
  ALTER TABLE public.ticket_sales ADD CONSTRAINT ticket_sales_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES event_ticket_lots(id) ON DELETE RESTRICT;
 END IF;
END $baseline_constraint$;
-- END OPERATION 8ecec56c77eafaa0128a59c6536c6c85a5d8e03e20b0843f61cdd8aac96899d1
