-- #352 G3: local disposable replay only. Never apply to Live.
-- object: acl:relation:storage.objects
-- stage: acl
-- provenance: {"live_acl_properties_sha256": "78afe60836229a90cf8e443fb05f2a5205082c93b06091263e8b80a93f188fe9", "promotion": 6449906971, "review": 6429178426, "rule": "acl_final_from_live", "scope": "only the previously measured compensation commands; no global privilege inventory", "window": "after R6/R7, before post-freeze migrations"}
-- BEGIN OPERATION 11ef043a6aaf46866cf46fe140660d3c39c8c07d58201ba7ec2d32f97962f503
SET LOCAL ROLE "supabase_storage_admin";
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT DELETE ON TABLE storage.objects TO "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT INSERT ON TABLE storage.objects TO "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT SELECT ON TABLE storage.objects TO "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT UPDATE ON TABLE storage.objects TO "anon";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM "authenticated";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT DELETE ON TABLE storage.objects TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT INSERT ON TABLE storage.objects TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT SELECT ON TABLE storage.objects TO "authenticated";
RESET ROLE;

SET LOCAL ROLE "supabase_storage_admin";
GRANT UPDATE ON TABLE storage.objects TO "authenticated";
RESET ROLE;
-- END OPERATION 11ef043a6aaf46866cf46fe140660d3c39c8c07d58201ba7ec2d32f97962f503
