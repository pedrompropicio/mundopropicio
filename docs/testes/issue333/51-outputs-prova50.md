# #333 — Outputs sanitizados prova50

Sem IDsfixture/credenciais/baselines privadas.

```json
[
  {
    "case": "ONE AuthAdmin account created without delivery/login",
    "status": "PASS"
  },
  {
    "case": "Canonical editor context",
    "status": "PASS"
  },
  {
    "case": "Capabilities false/false",
    "status": "PASS"
  },
  {
    "case": "ONE correct check",
    "status": "PASS"
  },
  {
    "case": "ONE wrong hash RPC",
    "status": "PASS",
    "http": 403,
    "code": "42501",
    "seconds": 0.148
  },
  {
    "case": "ONE wrong hash endpoint",
    "status": "PASS",
    "http": 409,
    "body_status": "pendente",
    "seconds": 0.858
  },
  {
    "case": "Global logout",
    "status": "PASS",
    "http": 204
  },
  {
    "case": "Ban ONLY new account",
    "status": "PASS",
    "http": 200
  }
]
```

```text
SELECT controls: banned=true; sessions=0; effects=[0,0,0,0]; role_audits=2; canonical_hash_valid=true; flags=[0,0]; internal_exec=[false,false,false]
16 before/after count+hash pairs identical, fixture exclusions explicit

 RUN  v3.2.7 /dev-server

 ✓ docs/testes/issue333/pg/fixture-preparation47.test.ts (24 tests) 4141ms

 Test Files  1 passed (1)
      Tests  24 passed (24)
   Start at  03:08:57
   Duration  5.15s (transform 171ms, setup 0ms, collect 207ms, tests 4.14s, environment 1ms, prepare 333ms)


```
