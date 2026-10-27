-- #352 G3: local disposable replay only. Never apply to Live.
-- object: extension_members:pgmq:pgmq.q_auth_emails
-- stage: membership
-- provenance: {"live_extension_membership": "absent for these eight application queue tables", "live_membership_catalog_sha256": "9d1aa21ac138a104253178974ed0a7c513de15e2139658dd71d809ed06b58d56", "oid": 36848, "oid_catalog_query_sha256": "f76c9fbe999494c50d25221281e0accb7508e5b83e3f2752b06fb18ba25837f0", "oid_observation_scope": "catalogue identifier only; frozen definition/property hash remains separately dated", "oid_observed_at_utc": "2026-10-27 20:10:13.900178+00", "review": [6433564033, 6441951637, 6449906971], "rule": "live_only_tail", "source_sql_sha256": "212f3062e1363adcc8ccbe585d48f47476bf30f1ac0eacd0683fa05acce03f98", "window": "after tail, before R6/R7"}
-- BEGIN OPERATION cabd394a1b5e90407cfd28c0a688cbf8e19bb3db212e63b61a91a28ce980278e
DO $baseline_membership$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_extension e ON e.oid=d.refobjid WHERE d.classid='pg_class'::regclass AND d.objid=to_regclass('pgmq.q_auth_emails') AND d.refclassid='pg_extension'::regclass AND d.deptype='e' AND e.extname='pgmq') THEN
  ALTER EXTENSION pgmq DROP TABLE pgmq.q_auth_emails;
 END IF;
END $baseline_membership$;
-- END OPERATION cabd394a1b5e90407cfd28c0a688cbf8e19bb3db212e63b61a91a28ce980278e
