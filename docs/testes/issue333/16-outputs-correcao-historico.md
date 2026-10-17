# #333 — tentativas de validação corrigidas (outputs integrais)

## /tmp/issue333-integrated-_mfonx2x/deno.log
```text
COMMAND: /bin/deno check --no-remote --config deno-isolated.json supabase/functions/ingest-standalone-invoice/index.ts supabase/functions/_shared/standalone-compat.ts supabase/functions/standalone-attempt-333/handler.ts supabase/functions/standalone-attempt-333/index.ts supabase/functions/data-entry/handler.ts
[0m[32mCheck[0m supabase/functions/ingest-standalone-invoice/index.ts
[0m[32mCheck[0m supabase/functions/_shared/standalone-compat.ts
[0m[32mCheck[0m supabase/functions/standalone-attempt-333/handler.ts
[0m[32mCheck[0m supabase/functions/standalone-attempt-333/index.ts
[0m[32mCheck[0m supabase/functions/data-entry/handler.ts
[0m[1mTS2339 [0m[ERROR]: Property 'list' does not exist on type 'HandlerDeps'.
    at [0m[36mfile:///tmp/issue333-integrated-_mfonx2x/tree/supabase/functions/standalone-attempt-333/handler.ts[0m:[0m[33m35[0m:[0m[33m35[0m

[0m[1mTS2339 [0m[ERROR]: Property 'list' does not exist on type 'HandlerDeps'.
    at [0m[36mfile:///tmp/issue333-integrated-_mfonx2x/tree/supabase/functions/standalone-attempt-333/handler.ts[0m:[0m[33m35[0m:[0m[33m111[0m

Found 2 errors.

[0m[1m[31merror[0m: Type checking failed.

EXIT: 1

```

## /tmp/issue333-integrated-pvgo_dft/entry.log
```text

 RUN  v3.2.7 /tmp/issue333-integrated-pvgo_dft/tree

 ❯ docs/testes/issue333/integrated/attempt-entry.test.ts (7 tests | 1 failed) 2642ms
   ✓ real candidate entry OPTIONS declares all client headers; tenant/user mismatches and rejected session context 14ms
   ✓ real entry rejects truncated or MIME-incompatible bytes with no upload/receipt/commit 4ms
   ✓ real entry rejects truncated or MIME-incompatible bytes with no upload/receipt/commit 3ms
   ✓ real entry rejects truncated or MIME-incompatible bytes with no upload/receipt/commit 1ms
   ✓ real entry rejects truncated or MIME-incompatible bytes with no upload/receipt/commit 1ms
   ✓ real entry cuts oversized body stream before buffering/DB writes 3ms
   × Chromium cross-origin fetch performs actual OPTIONS then POST using candidate entry headers 2520ms
     → expected { status: 409, …(1) } to deeply equal { status: 200, …(1) }

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  docs/testes/issue333/integrated/attempt-entry.test.ts > Chromium cross-origin fetch performs actual OPTIONS then POST using candidate entry headers
AssertionError: expected { status: 409, …(1) } to deeply equal { status: 200, …(1) }

[32m- Expected[39m
[31m+ Received[39m

[2m  {[22m
[2m    "body": {[22m
[32m-     "items": [],[39m
[32m-     "next": null,[39m
[31m+     "error": "Consulta indisponível",[39m
[2m    },[22m
[32m-   "status": 200,[39m
[31m+   "status": 409,[39m
[2m  }[22m

 ❯ docs/testes/issue333/integrated/attempt-entry.test.ts:36:228


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
   Start at  19:27:40
   Duration  4.23s (transform 163ms, setup 0ms, collect 113ms, tests 2.64s, environment 0ms, prepare 846ms)


```

## /tmp/issue333-integrated-pvgo_dft/integrated-extra.log
```text

 RUN  v3.2.7 /tmp/issue333-integrated-pvgo_dft/tree

 ✓ docs/testes/issue333/integrated/endpoint.test.ts (27 tests) 390ms
stderr | docs/testes/issue333/integrated/ui.test.tsx > real patched scanner/editor + fake client; not RLS acceptance > scanner incomplete key lost response locks save; persistent query still works after local storage cleared
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

stderr | docs/testes/issue333/integrated/ui.test.tsx > real patched scanner/editor + fake client; not RLS acceptance > editor own-ID exclusion allows update; lost response blocks repeat and keeps candidate
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

stderr | docs/testes/issue333/integrated/ui.test.tsx > real patched scanner/editor + fake client; not RLS acceptance > editor 23505 is not a success and cannot repeat UPDATE
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

 ✓ docs/testes/issue333/integrated/ui.test.tsx (10 tests) 1663ms
   ✓ real patched scanner/editor + fake client; not RLS acceptance > scanner incomplete key lost response locks save; persistent query still works after local storage cleared  467ms
   ✓ real patched scanner/editor + fake client; not RLS acceptance > editor own-ID exclusion allows update; lost response blocks repeat and keeps candidate  335ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  docs/testes/issue333/integrated/attempt-entry.test.ts [ docs/testes/issue333/integrated/attempt-entry.test.ts ]
ReferenceError: window is not defined
 ❯ src/test/setup.ts:3:23
      1| import "@testing-library/jest-dom";
      2| 
      3| Object.defineProperty(window, "matchMedia", {
       |                       ^
      4|   writable: true,
      5|   value: (query: string) => ({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 2 passed (3)
      Tests  37 passed (37)
   Start at  19:26:50
   Duration  7.24s (transform 821ms, setup 408ms, collect 1.65s, tests 2.05s, environment 3.06s, prepare 2.02s)


```

## /tmp/issue333-integrated-akbwfoz_/tsgo.log
```text
COMMAND: /root/.bun/install/cache/@typescript/native-preview-linux-x64/7.0.0-9b4cac1d418d8402@@@1/lib/tsgo -p tsconfig.app.json --noEmit
src/pages/StandaloneInvoiceScanner.tsx(254,10): error TS2552: Cannot find name 'saveGeneration'. Did you mean 'generation'?

EXIT: 2

```
