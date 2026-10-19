# Outputs locais tarefa90

## PG primeiro runner exit1

```text

 RUN  v3.2.7 /dev-server

 ❯ docs/testes/issue333/application90/application-pg.test.ts (4 tests | 4 failed) 3117ms
   × 90 reproduces reviewed88 abort under actual technical defaults, then90 applies without global changes 68ms
     → expected [Function] to throw error including 'analysis_control_acl_catalog' but got 'UNSAFE_TRANSACTION: Only use sql.begi…'
   × 90 minimal ACLs: technical/anon/user no rights, service SELECT/transition only; owner-only responsible 14ms
     → relation "public.data_entry_analysis_control_333" does not exist
   × 90 owner explicit review/hash/revision; close preserves claim and late finish is fenced 9ms
     → expected PostgresError: current transaction is abo… { …(9) } to match object { code: '22023' }
(6 matching properties omitted from actual)
   × 90 responsible concurrent revisions permit one action, preserve audit on rollback 4ms
     → expected [] to have a length of 1 but got +0

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  docs/testes/issue333/application90/application-pg.test.ts > 90 reproduces reviewed88 abort under actual technical defaults, then90 applies without global changes
AssertionError: expected [Function] to throw error including 'analysis_control_acl_catalog' but got 'UNSAFE_TRANSACTION: Only use sql.begi…'

Expected: [32m"analysis_control_acl_catalog"[39m
Received: [31m"UNSAFE_TRANSACTION: Only use sql.begin, sql.reserved or max: 1"[39m

 ❯ docs/testes/issue333/application90/application-pg.test.ts:27:2
     25| it('90 reproduces reviewed88 abort under actual technical defaults, th…
     26|  const defaults=await db`SELECT defaclobjtype,defaclacl::text acl FROM…
     27|  await expect(db.unsafe(readFileSync('supabase/manual/issue333_tarefa8…
       |  ^
     28|  await db.unsafe(schema);
     29|  expect(await db`SELECT defaclobjtype,defaclacl::text acl FROM pg_defa…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  docs/testes/issue333/application90/application-pg.test.ts > 90 minimal ACLs: technical/anon/user no rights, service SELECT/transition only; owner-only responsible
PostgresError: relation "public.data_entry_analysis_control_333" does not exist
 ❯ ErrorResponse node_modules/postgres/src/connection.js:815:30
 ❯ handle node_modules/postgres/src/connection.js:489:6
 ❯ Socket.data node_modules/postgres/src/connection.js:324:9
 ❯ cachedError node_modules/postgres/src/query.js:170:23
 ❯ new Query node_modules/postgres/src/query.js:36:24
 ❯ sql node_modules/postgres/src/index.js:112:11
 ❯ docs/testes/issue333/application90/application-pg.test.ts:37:21
     35|   for(const table of ['data_entry_analysis_control_333','data_entry_an…
     36|    for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCA…
     37|     const [r]=await db`SELECT has_table_privilege(${name},${'public.'+…
       |                     ^
     38|    }
     39|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  docs/testes/issue333/application90/application-pg.test.ts > 90 owner explicit review/hash/revision; close preserves claim and late finish is fenced
AssertionError: expected PostgresError: current transaction is abo… { …(9) } to match object { code: '22023' }
(6 matching properties omitted from actual)

[32m- Expected[39m
[31m+ Received[39m

[32m- {[39m
[32m-   "code": "22023",[39m
[31m+ PostgresError {[39m
[31m+   "code": "25P02",[39m
[2m  }[22m

 ❯ docs/testes/issue333/application90/application-pg.test.ts:46:2
     44| });
     45| it('90 owner explicit review/hash/revision; close preserves claim and …
     46|  await expect(db`SELECT public.data_entry_analysis_responsible_333('re…
       |  ^
     47|  const [opened]=await responsible('reopen','1',null);expect(opened.j.s…
     48|  await role('service_role',`SELECT public.data_entry_analysis_transiti…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  docs/testes/issue333/application90/application-pg.test.ts > 90 responsible concurrent revisions permit one action, preserve audit on rollback
AssertionError: expected [] to have a length of 1 but got +0

[32m- Expected[39m
[31m+ Received[39m

[32m- 1[39m
[31m+ 0[39m

 ❯ docs/testes/issue333/application90/application-pg.test.ts:61:52
     59| it('90 responsible concurrent revisions permit one action, preserve au…
     60|  const results=await Promise.allSettled([responsible('close','7',null)…
     61|  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);exp…
       |                                                    ^
     62|  const before=await db`SELECT * FROM public.data_entry_analysis_audit_…
     63|  await db.unsafe(readFileSync('supabase/manual/issue333_tarefa90_appli…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed (4)
   Start at  12:02:12
   Duration  3.97s (transform 64ms, setup 0ms, collect 93ms, tests 3.12s, environment 0ms, prepare 232ms)

```

## PG corrigido4PASS exit0

```text

 RUN  v3.2.7 /dev-server

stdout | docs/testes/issue333/application90/application-pg.test.ts > 90 reproduces reviewed88 abort under actual technical defaults, then90 applies without global changes
90_HOSTED_DEFAULTS_COMPATIBLE_NON_SUPER_OWNER [{"defaclobjtype":"f","acl":"{authenticated=X/postgres,service_role=X/postgres,sandbox_project=X/postgres}"},{"defaclobjtype":"r","acl":"{anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres,sandbox_exec=ar/postgres,sandbox_project=ar/postgres}"}]

stdout | docs/testes/issue333/application90/application-pg.test.ts > 90 minimal ACLs: technical/anon/user no rights, service SELECT/transition only; owner-only responsible
90_CATALOG [{"relname":"data_entry_analysis_audit_333","acl":"{postgres=arwdDxtm/postgres,service_role=r/postgres}","relrowsecurity":true},{"relname":"data_entry_analysis_control_333","acl":"{postgres=arwdDxtm/postgres,service_role=r/postgres}","relrowsecurity":true}]

 ✓ docs/testes/issue333/application90/application-pg.test.ts (4 tests) 2847ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  12:03:03
   Duration  3.62s (transform 75ms, setup 0ms, collect 102ms, tests 2.85s, environment 0ms, prepare 233ms)

```

## Vitest58PASS exit0

```text

 RUN  v3.2.7 /dev-server

 ✓ src/test/data-entry-control87.test.ts (21 tests) 252ms
 ✓ src/test/data-entry-provider86.test.ts (9 tests) 283ms
 ✓ src/test/data-entry-deadline90.test.ts (2 tests) 12ms
 ✓ src/test/data-entry-analysis85.test.ts (26 tests) 48ms

 Test Files  4 passed (4)
      Tests  58 passed (58)
   Start at  12:04:03
   Duration  3.45s (transform 363ms, setup 789ms, collect 1.06s, tests 596ms, environment 2.75s, prepare 1.20s)

```

## Deno check/runtime/bundle exit0

```text
COMMAND: deno check --no-config --no-lock --node-modules-dir=manual --no-remote supabase/functions/_shared/issue333-ai/control.ts supabase/functions/_shared/issue333-ai/provider.ts supabase/functions/data-entry/analysis-service.ts supabase/functions/data-entry/analysis-stream.ts supabase/functions/data-entry/index.ts
Check supabase/functions/_shared/issue333-ai/control.ts
Check supabase/functions/_shared/issue333-ai/provider.ts
Check supabase/functions/data-entry/analysis-service.ts
Check supabase/functions/data-entry/analysis-stream.ts
Check supabase/functions/data-entry/index.ts

EXIT: 0
COMMAND: deno test --no-config --no-lock --node-modules-dir=manual --no-remote --cached-only --allow-sys=hostname --allow-env=OPENAI_BASE_URL docs/testes/issue333/provider87/runtime.test.ts docs/testes/issue333/analysis86/runtime.test.ts
Check docs/testes/issue333/provider87/runtime.test.ts
Check docs/testes/issue333/analysis86/runtime.test.ts
running 1 test from ./docs/testes/issue333/provider87/runtime.test.ts
87 real SDK + durable adapter contract: 403 persisted, no second POST, no egress ... ok (36ms)
running 1 test from ./docs/testes/issue333/analysis86/runtime.test.ts
86 real Deno SDK Responses → validation → final-only SSE, zero egress ... ok (93ms)

ok | 2 passed | 0 failed (378ms)


EXIT: 0
COMMAND: deno bundle --no-config --no-lock --node-modules-dir=manual --no-remote --platform deno supabase/functions/data-entry/index.ts -o /tmp/issue333-provider87-deno-h4sa0is7/entry.bundle.js
⚠️  deno bundle is experimental and subject to changes
Download https://registry.npmjs.org/@esbuild%2flinux-x64
Download https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.5.tgz
Bundled 192 modules in 345ms
  ../tmp/issue333-provider87-deno-h4sa0is7/entry.bundle.js 2.12MB


EXIT: 0
Evidence: /tmp/issue333-provider87-deno-h4sa0is7
```

