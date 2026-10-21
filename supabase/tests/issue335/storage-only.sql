-- LOCAL ONLY, run as the REST role BEFORE core/triggers exist.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
DO $$ BEGIN
 BEGIN INSERT INTO transaction_offset_groups(company_id,supplier_id,request_id,request_hash,operation_date,movement_amount,created_by) VALUES(current_company_id(),'00000000-0000-0000-0000-000000000020',gen_random_uuid(),'attack','2026-10-13',0,auth.uid()); RAISE EXCEPTION 'storage-only insert accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE transaction_offset_groups SET note='attack'; RAISE EXCEPTION 'storage-only update accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM transaction_offset_groups; RAISE EXCEPTION 'storage-only delete accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN TRUNCATE transaction_offset_groups; RAISE EXCEPTION 'storage-only truncate accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS 2 storage-only REST identity: INSERT UPDATE DELETE TRUNCATE denied without any core guard';
END $$;
RESET ROLE;
