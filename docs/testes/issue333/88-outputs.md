# Outputs locais tarefa88

## ISSUE333_LOCAL_PROOF=1 bunx vitest run --config docs/testes/issue333/provider87/vitest.acl88.config.ts -t "88 catalog rejects"; exit1 esperado
```text

 RUN  v3.2.7 /dev-server

stdout | docs/testes/issue333/provider87/acl88-pg.test.ts > 88 catalog rejects service_role writes inherited from creator default ALL
CATALOG88 [{"relname":"data_entry_analysis_audit_333","owner":"postgres","relrowsecurity":true,"acl":[{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"MAINTAIN"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantable":false,"privilege":"MAINTAIN"},{"grantee":"service_role","grantable":false,"privilege":"REFERENCES"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantable":false,"privilege":"TRIGGER"},{"grantee":"service_role","grantable":false,"privilege":"TRUNCATE"},{"grantee":"service_role","grantable":false,"privilege":"UPDATE"}]},{"relname":"data_entry_analysis_control_333","owner":"postgres","relrowsecurity":true,"acl":[{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"MAINTAIN"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"DELETE"},{"grantee":"service_role","grantable":false,"privilege":"INSERT"},{"grantee":"service_role","grantable":false,"privilege":"MAINTAIN"},{"grantee":"service_role","grantable":false,"privilege":"REFERENCES"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"},{"grantee":"service_role","grantable":false,"privilege":"TRIGGER"},{"grantee":"service_role","grantable":false,"privilege":"TRUNCATE"},{"grantee":"service_role","grantable":false,"privilege":"UPDATE"}]}]

 ❯ docs/testes/issue333/provider87/acl88-pg.test.ts (5 tests | 1 failed | 4 skipped) 2392ms
   × 88 catalog rejects service_role writes inherited from creator default ALL 48ms
     → data_entry_analysis_control_333:INSERT: expected true to be false // Object.is equality
   ↓ 88 actual DML/TRUNCATE/reopen/audit delete denied; legitimate SELECT/RPC works
   ↓ 88 anon/authenticated/PUBLIC have no table or function rights; catalog owner/searchpath
   ↓ 88 inherited write grants remain effective: guard must reject rather than claim REVOKE removes inheritance
   ↓ 88 rollback retains audit bytes and appends closed revision; RPC/control removed

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  docs/testes/issue333/provider87/acl88-pg.test.ts > 88 catalog rejects service_role writes inherited from creator default ALL
AssertionError: data_entry_analysis_control_333:INSERT: expected true to be false // Object.is equality

[32m- Expected[39m
[31m+ Received[39m

[32m- false[39m
[31m+ true[39m

 ❯ docs/testes/issue333/provider87/acl88-pg.test.ts:44:177
     42|     const [r]=await db`select has_table_privilege('service_role',${'pu…
     43|     expect(r.rd).toBe(true);
     44|     for(const privilege of writes){const [r]=await db`select has_table…
       |                                                                                                                                                                                 ^
     45|   }
     46| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  11:39:48
   Duration  3.19s (transform 68ms, setup 0ms, collect 77ms, tests 2.39s, environment 0ms, prepare 261ms)


```

## ISSUE333_LOCAL_PROOF=1 bunx vitest run --config docs/testes/issue333/provider87/vitest.acl88.config.ts; exit0 final
```text

 RUN  v3.2.7 /dev-server

stdout | docs/testes/issue333/provider87/acl88-pg.test.ts > 88 catalog rejects service_role writes inherited from creator default ALL
CATALOG88 [{"relname":"data_entry_analysis_audit_333","owner":"postgres","relrowsecurity":true,"acl":[{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"MAINTAIN"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"}]},{"relname":"data_entry_analysis_control_333","owner":"postgres","relrowsecurity":true,"acl":[{"grantee":"postgres","grantable":false,"privilege":"DELETE"},{"grantee":"postgres","grantable":false,"privilege":"INSERT"},{"grantee":"postgres","grantable":false,"privilege":"MAINTAIN"},{"grantee":"postgres","grantable":false,"privilege":"REFERENCES"},{"grantee":"postgres","grantable":false,"privilege":"SELECT"},{"grantee":"postgres","grantable":false,"privilege":"TRIGGER"},{"grantee":"postgres","grantable":false,"privilege":"TRUNCATE"},{"grantee":"postgres","grantable":false,"privilege":"UPDATE"},{"grantee":"service_role","grantable":false,"privilege":"SELECT"}]}]

stdout | docs/testes/issue333/provider87/acl88-pg.test.ts > 88 catalog rejects service_role writes inherited from creator default ALL
DEFAULT_ACL88_UNCHANGED {=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

stdout | docs/testes/issue333/provider87/acl88-pg.test.ts > 88 anon/authenticated/PUBLIC have no table or function rights; catalog owner/searchpath
FUNCTION88 {"prosecdef":true,"proconfig":["search_path=pg_catalog, public"],"owner":"postgres","acl":"{postgres=X/postgres,service_role=X/postgres}"}

 ✓ docs/testes/issue333/provider87/acl88-pg.test.ts (6 tests) 2754ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  11:41:08
   Duration  3.74s (transform 88ms, setup 0ms, collect 117ms, tests 2.75s, environment 2ms, prepare 300ms)


```

## ISSUE333_LOCAL_PROOF=1 bunx vitest run --config docs/testes/issue333/provider87/vitest.config.ts -t "service only RPC|rollback refuses"; exit0
```text

 RUN  v3.2.7 /dev-server

 ✓ docs/testes/issue333/provider87/control-pg.test.ts (20 tests | 18 skipped) 2192ms

 Test Files  1 passed (1)
      Tests  2 passed | 18 skipped (20)
   Start at  11:40:26
   Duration  2.89s (transform 148ms, setup 0ms, collect 197ms, tests 2.19s, environment 0ms, prepare 165ms)


```
