-- #352 G3: local disposable replay only. Never apply to Live.
-- object: tables:public.partner_aporte_mirror
-- stage: historical
-- provenance: {"effective_at": "2026-09-07T16:03:01Z", "live_catalog_sha256": "b3bc5cfeccf9b1f0cfa0df86388b85471693d5a96435fb0507dd00f7eec7f611", "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_properties_sha256": "2591a131777674445812f202925c40d3af7ee4acb7a275ea6861da27c74cdb80", "oid": 208099, "review": "https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6405248457", "rule": "live_only_ddl_reconstructed", "source_sql_sha256": "7774a0910e21a77bc335d0cb2a0000479788057245d4d9ca6fbbf13c81d1fe2c", "window": {"effective_at": "2026-09-07T16:03:01Z", "first_reference_version": "20260917115514", "lower": null, "upper": null}}
-- BEGIN OPERATION 4a61a8a2f3f0eba9dda2988776a8ad64a7c2f6f704f22d9c61351bfe66452fcf
SET LOCAL search_path = public, extensions;

CREATE TABLE IF NOT EXISTS "public"."partner_aporte_mirror" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "source_transaction_id" uuid NOT NULL,
  "aporte_transaction_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "partner_aporte_mirror_account_id_fkey" FOREIGN KEY (account_id) REFERENCES financial_accounts(id),
  CONSTRAINT "partner_aporte_mirror_aporte_transaction_id_fkey" FOREIGN KEY (aporte_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT "partner_aporte_mirror_aporte_transaction_id_key" UNIQUE (aporte_transaction_id),
  CONSTRAINT "partner_aporte_mirror_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT "partner_aporte_mirror_pkey" PRIMARY KEY (id),
  CONSTRAINT "partner_aporte_mirror_source_transaction_id_fkey" FOREIGN KEY (source_transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT "partner_aporte_mirror_source_transaction_id_key" UNIQUE (source_transaction_id)
);

ALTER TABLE "public"."partner_aporte_mirror" OWNER TO "postgres";

ALTER TABLE "public"."partner_aporte_mirror" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."partner_aporte_mirror" NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_isolation_partner_aporte_mirror" ON "public"."partner_aporte_mirror";

CREATE POLICY "company_isolation_partner_aporte_mirror" ON "public"."partner_aporte_mirror" AS RESTRICTIVE FOR ALL TO PUBLIC USING ((company_id = current_company_id())) WITH CHECK ((company_id = current_company_id()));

DROP POLICY IF EXISTS "pam_select_privileged" ON "public"."partner_aporte_mirror";

CREATE POLICY "pam_select_privileged" ON "public"."partner_aporte_mirror" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'platform_admin'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'accountant'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'editor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'viewer'::app_role)));

DO $reconstructed_acl$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='"public"."partner_aporte_mirror"'::regclass LOOP
  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "public"."partner_aporte_mirror" FROM ' || CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END;
 END LOOP;
END
$reconstructed_acl$;

GRANT DELETE ON TABLE "public"."partner_aporte_mirror" TO "postgres";

GRANT INSERT ON TABLE "public"."partner_aporte_mirror" TO "postgres";

GRANT MAINTAIN ON TABLE "public"."partner_aporte_mirror" TO "postgres";

GRANT REFERENCES ON TABLE "public"."partner_aporte_mirror" TO "postgres";

GRANT SELECT ON TABLE "public"."partner_aporte_mirror" TO "postgres";

GRANT TRIGGER ON TABLE "public"."partner_aporte_mirror" TO "postgres";

GRANT TRUNCATE ON TABLE "public"."partner_aporte_mirror" TO "postgres";

GRANT UPDATE ON TABLE "public"."partner_aporte_mirror" TO "postgres";

GRANT DELETE ON TABLE "public"."partner_aporte_mirror" TO "anon";

GRANT INSERT ON TABLE "public"."partner_aporte_mirror" TO "anon";

GRANT MAINTAIN ON TABLE "public"."partner_aporte_mirror" TO "anon";

GRANT REFERENCES ON TABLE "public"."partner_aporte_mirror" TO "anon";

GRANT SELECT ON TABLE "public"."partner_aporte_mirror" TO "anon";

GRANT TRIGGER ON TABLE "public"."partner_aporte_mirror" TO "anon";

GRANT TRUNCATE ON TABLE "public"."partner_aporte_mirror" TO "anon";

GRANT UPDATE ON TABLE "public"."partner_aporte_mirror" TO "anon";

GRANT DELETE ON TABLE "public"."partner_aporte_mirror" TO "authenticated";

GRANT INSERT ON TABLE "public"."partner_aporte_mirror" TO "authenticated";

GRANT MAINTAIN ON TABLE "public"."partner_aporte_mirror" TO "authenticated";

GRANT REFERENCES ON TABLE "public"."partner_aporte_mirror" TO "authenticated";

GRANT SELECT ON TABLE "public"."partner_aporte_mirror" TO "authenticated";

GRANT TRIGGER ON TABLE "public"."partner_aporte_mirror" TO "authenticated";

GRANT TRUNCATE ON TABLE "public"."partner_aporte_mirror" TO "authenticated";

GRANT UPDATE ON TABLE "public"."partner_aporte_mirror" TO "authenticated";

GRANT DELETE ON TABLE "public"."partner_aporte_mirror" TO "service_role";

GRANT INSERT ON TABLE "public"."partner_aporte_mirror" TO "service_role";

GRANT MAINTAIN ON TABLE "public"."partner_aporte_mirror" TO "service_role";

GRANT REFERENCES ON TABLE "public"."partner_aporte_mirror" TO "service_role";

GRANT SELECT ON TABLE "public"."partner_aporte_mirror" TO "service_role";

GRANT TRIGGER ON TABLE "public"."partner_aporte_mirror" TO "service_role";

GRANT TRUNCATE ON TABLE "public"."partner_aporte_mirror" TO "service_role";

GRANT UPDATE ON TABLE "public"."partner_aporte_mirror" TO "service_role";
-- END OPERATION 4a61a8a2f3f0eba9dda2988776a8ad64a7c2f6f704f22d9c61351bfe66452fcf
