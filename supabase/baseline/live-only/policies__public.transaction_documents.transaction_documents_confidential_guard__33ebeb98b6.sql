-- #352 G3: local disposable replay only. Never apply to Live.
-- object: policies:public.transaction_documents.transaction_documents_confidential_guard
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "f4b4a631ff3a717f1e48f36b0ee524182a8654a9345d248824619671d2ad946d", "oid": 217139, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "4e6518dbd54cb8fac26a3ab4e48496a1ab83088cd64231933d80fcf9d5c7dc60", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION b63cc33d17976a612cfd0471fcfa6c75c03d3d0f629193490729a8725c167fdb
DROP POLICY IF EXISTS transaction_documents_confidential_guard ON public.transaction_documents;

CREATE POLICY transaction_documents_confidential_guard ON public.transaction_documents AS RESTRICTIVE FOR SELECT TO PUBLIC USING ((can_see_confidential(( SELECT auth.uid() AS uid)) OR (NOT (EXISTS ( SELECT 1
   FROM transactions t
  WHERE ((t.id = transaction_documents.transaction_id) AND ((COALESCE(t.is_confidential, false) = true) OR ((t.account_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM financial_accounts a
          WHERE ((a.id = t.account_id) AND a.is_restricted)))))))))));
-- END OPERATION b63cc33d17976a612cfd0471fcfa6c75c03d3d0f629193490729a8725c167fdb
