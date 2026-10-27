-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:public.transactions_active_installment_unique_idx
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "271b7b8ebfa66ac32ef9d5c88f84149ea66fb82cc0401cf32910a35d23e65361", "live_properties_sha256": "6fba278a664f80c6fe030a5467b977da6ff730e5cf14f978559615cf1efa09a4", "oid": 174106, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "fcfb0944afa6466fb5b1f46ed35d7b2e3f8e8fa26af54ff6eda706dedde5a1dd", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b168e1d479df298cb3313ba65c601b0761002992f2a9f73581032a9d6932d53f
DROP INDEX IF EXISTS public.transactions_active_installment_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_active_installment_unique_idx ON public.transactions USING btree (company_id, COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::uuid), type, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), description, due_date, amount, iva_rate) WHERE ((due_date IS NOT NULL) AND (description ~ '[[:space:]]\([0-9]+/[0-9]+\)[[:space:]]*$'::text) AND (COALESCE(is_hidden, false) = false) AND (status <> 'reversed'::text));
-- END OPERATION b168e1d479df298cb3313ba65c601b0761002992f2a9f73581032a9d6932d53f
