-- #352 G3: local disposable replay only. Never apply to Live.
-- object: indexes:crm.ad_platform_account_links_company_idx
-- stage: reconcile
-- provenance: {"live_absence": true, "live_proof_sha256": "c44a6d6ef990310280772a2755808743b7be556a5154a885c5823fc5f63f365f", "live_properties_sha256": "f5e61b11a7b6ce40c2d0905eeb22e511762c299e88c7babdc15a674568a89b19", "object_oid_status": "absent in frozen Live; no invented OID", "replay_properties_sha256": "5b52b6785452ee287bd60f280b588ef08cc6a12edb388c1e3c160134bd366ef8", "review": 6445145238, "rule": "live_absence_prevails", "source_sql_sha256": "5a7fb36219170666df2ae250c936fc87879291deee6fba19fda1477c363ed060", "window": "after tail, before final ACL"}
-- BEGIN OPERATION f972fc09e9e4908bd95085a16886ca791271a67251e0b439855f6632f16c00cf
DROP INDEX IF EXISTS crm.ad_platform_account_links_company_idx;
-- END OPERATION f972fc09e9e4908bd95085a16886ca791271a67251e0b439855f6632f16c00cf
