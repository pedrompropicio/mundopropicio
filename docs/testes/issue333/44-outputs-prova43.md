# #333 — outputs sanitizados prova43

UTC 2026-10-18T02:39:35.951180+00:00

## run-sanitized.log
```text
AuthAdmin create without email delivery PASS
STOP RuntimeError
Finally ban ONLY new account PASS
{
  "scope": "Live ONE new account ONE reservation ONE bad RPC ONE bad endpoint; no retries",
  "checks": [
    {
      "case": "AuthAdmin create without email delivery",
      "status": "PASS"
    },
    {
      "case": "Finally ban ONLY new account",
      "status": "PASS",
      "http": 200
    }
  ],
  "error": "RuntimeError: private SQL failed"
}

```
## pg-tests.log
```text

 RUN  v3.2.7 /dev-server

stdout | docs/testes/issue333/pg/hash-check-pending.test.ts > reapply55000; rollback exact40001/source/ACL/data; candidate reapplies locally
PASS: exact0190–0192/candidate/rollback, all table count+hash and function ACL/metadata unchanged; zero Cloud

 ✓ docs/testes/issue333/pg/hash-check-pending.test.ts (22 tests) 3469ms

 Test Files  1 passed (1)
      Tests  22 passed (22)
   Start at  02:38:36
   Duration  4.21s (transform 89ms, setup 0ms, collect 114ms, tests 3.47s, environment 0ms, prepare 234ms)


```
## handler-tests.log
```text

 RUN  v3.2.7 /dev-server

 ✓ src/lib/__tests__/standalone-hash-check-pending.test.ts (3 tests) 15ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  02:36:50
   Duration  1.77s (transform 93ms, setup 116ms, collect 81ms, tests 15ms, environment 534ms, prepare 387ms)


```
## tsgo.log
```text

```
## controls-sanitized.json
```text
{"capabilities": {"scanner_create": false, "accountant_edit": false}, "sessions": 0, "new_accounts_banned": 1, "new_attempts": 0, "managed_baselines_equal": true}
```
