-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:relation:storage.buckets
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "78afe60836229a90cf8e443fb05f2a5205082c93b06091263e8b80a93f188fe9", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION dcfbb11eb0b87b02fd2c1703ef9554a724401202f87efc5805f40f4e7e7875f7
SET LOCAL ROLE "supabase_storage_admin";
REVOKE ALL PRIVILEGES ON TABLE storage.buckets FROM "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT DELETE ON TABLE storage.buckets TO "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT INSERT ON TABLE storage.buckets TO "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT SELECT ON TABLE storage.buckets TO "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT UPDATE ON TABLE storage.buckets TO "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
REVOKE ALL PRIVILEGES ON TABLE storage.buckets FROM "authenticated";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT DELETE ON TABLE storage.buckets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT INSERT ON TABLE storage.buckets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT SELECT ON TABLE storage.buckets TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT UPDATE ON TABLE storage.buckets TO "authenticated";
RESET ROLE;
-- END OPERATION dcfbb11eb0b87b02fd2c1703ef9554a724401202f87efc5805f40f4e7e7875f7
