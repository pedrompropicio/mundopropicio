# #335 Bloco7 — permissions and replay (artifact-only investigation)

No project edits, database connections, Live reads, test execution, or installation were performed. Only this temporary report was written. “Allowed” below means authorization admission, not a guarantee that financial/business validation succeeds. Catalog captures are historical local artifacts, not current Live assertions.

## Guidance and authoritative candidate
- `AGENTS.md:33-36`: manual-only; private backend/transaction context; faithful catalog controls; session identity rather than superuser SET ROLE.
- `supabase/AGENTS.md:1-3`: private NOLOGIN executor and non-superuser deployment.
- Candidate: `supabase/manual/20261021_issue335_offset_core.INERTE.sql`, NOT a migration. Execute gate at 214-241; reversal at 371-389; bank offset adapter at 847-922; dispatch/private context and public wrappers at 1080-1148.

## Exact role matrix (single business role, active company, no platform-admin privilege)

| Actor | direct transaction_offset_execute | reconcile_bank_line offset, no override | bank offset with manage_bank_reconciliation=true | bank offset with false | transaction_offset_reverse |
|---|---|---|---|---|---|
| admin | allow | allow | allow | allow | allow |
| manager | allow | allow | allow | allow | deny |
| editor | allow | deny unless role_permissions supplies permission | allow | deny | deny |
| accountant | deny | deny | deny (outer gate passes, inner execute denies) | deny | deny |
| user | deny | deny | deny (outer gate passes, inner execute denies) | deny | deny |
| anon SQL role | ACL deny | ACL deny | ACL deny | ACL deny | ACL deny |

Evidence: core:224 restricts execute to admin/manager/editor, and core:901 bank additionally requires platform admin OR admin OR manager OR has_permission(manage_bank_reconciliation). Both gates apply: permission alone does NOT authorize accountant/user to settle offset. Core:376 reversal requires admin; no manage_bank_reconciliation override is consulted. Explicit false cannot veto admin/manager's direct OR branches. Versioned seed grants bank permission to admin/manager (`supabase/migrations/20260909213213_c596a50f-84da-4257-a6d3-f2c1f9d3bce3.sql:99-101`); actual role_permissions data must be measured in the local reference-data harness. Multi-role users satisfy any permitted role. Captured has_role treats platform admins as satisfying any role (see catalog references below), so platform-admin behavior differs from a pure accountant/user.

Public SQL ACL: core:1069-1070,1134-1135 grants authenticated/service_role and revokes PUBLIC/anon on these RPCs. service_role EXECUTE is not automatic business authorization: actor JWT/current company still matters. Inner execute/reverse are revoked from clients (1080-1081); command view allows authenticated/service_role INSERT/SELECT (1082-1084), dispatch creates private context (1085-1115). No valid context from a GUC alone. Offset reconcile uses trigger dispatch; legacy non-offset branch is not covered by this matrix.

## Overrides, ACL and RLS
Use captured DDL rather than assuming older migrations are the last definition. Captured has_permission is SECURITY DEFINER, active-company override first (false is effective), then platform-admin OR active-company role_permissions. Captured has_role is SECURITY DEFINER, platform-admin OR matching active-company role. Migration 20260514131452…:60-81 explains override precedence but its platform-admin fallback is NOT byte-identical to the captured definition.

Captured user_permissions: RLS enabled; broad table ACL includes SELECT/INSERT/UPDATE/DELETE and even TRUNCATE/TRIGGER for anon/authenticated/service_role. ACL permission alone does not establish row access. Permissive SELECT permits own user OR admin OR manager; permissive ALL/write policy permits admin only. Restrictive ALL requires own user OR active company OR platform-admin, for both USING and WITH CHECK. Thus manager reads active-company others plus own rows across companies, but cannot self-grant through ordinary row INSERT/UPDATE/DELETE; editor/accountant/user read own rows only, including own cross-company rows, and cannot self-grant. Anon has no applicable permissive policy for row access. Admin writes are still intersected with restrictive checks. Do not claim restrictive own-row checks grant writes: permissive admin policy is also required. has_permission itself scopes evaluation to active company even if own cross-company rows are SELECT-visible. Unique key is (user_id,company_id,permission). SECURITY DEFINER helpers may read beyond caller table RLS. Important separate audit: TRUNCATE is not protected by row RLS; captured broad ACL deserves an explicit disposable-local probe, not a claim that all mutation is RLS-blocked.

### Exact catalog anchors
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:7158-7163` — "key": "fn:has_permission(uuid,text)",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:7170-7175` — "key": "fn:has_role(uuid,app_role)",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:35964-35969` — "key": "rls:public.user_permissions",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:47688-47693` — "key": "pol:public.user_permissions.User permissions manageable by admin",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:47694-47699` — "key": "pol:public.user_permissions.User permissions viewable by own user or admin",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:47700-47705` — "key": "pol:public.user_permissions.company_isolation_user_permissions",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65448-65453` — "key": "facl:has_permission(uuid,text):postgres:PUBLIC:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65454-65459` — "key": "facl:has_permission(uuid,text):postgres:anon:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65460-65465` — "key": "facl:has_permission(uuid,text):postgres:authenticated:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65466-65471` — "key": "facl:has_permission(uuid,text):postgres:postgres:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65472-65477` — "key": "facl:has_permission(uuid,text):postgres:sandbox_exec_sfohvvlqccmmebvjgibx:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65478-65483` — "key": "facl:has_permission(uuid,text):postgres:service_role:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65484-65489` — "key": "facl:has_permission(uuid,text):revoke",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65490-65495` — "key": "facl:has_permission_in(uuid,text,uuid):postgres:PUBLIC:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65496-65501` — "key": "facl:has_permission_in(uuid,text,uuid):postgres:anon:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65502-65507` — "key": "facl:has_permission_in(uuid,text,uuid):postgres:authenticated:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65508-65513` — "key": "facl:has_permission_in(uuid,text,uuid):postgres:postgres:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65514-65519` — "key": "facl:has_permission_in(uuid,text,uuid):postgres:sandbox_exec_sfohvvlqccmmebvjgibx:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65520-65525` — "key": "facl:has_permission_in(uuid,text,uuid):postgres:service_role:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65526-65531` — "key": "facl:has_permission_in(uuid,text,uuid):revoke",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65532-65537` — "key": "facl:has_role(uuid,app_role):postgres:PUBLIC:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65538-65543` — "key": "facl:has_role(uuid,app_role):postgres:anon:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65544-65549` — "key": "facl:has_role(uuid,app_role):postgres:authenticated:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65550-65555` — "key": "facl:has_role(uuid,app_role):postgres:postgres:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65556-65561` — "key": "facl:has_role(uuid,app_role):postgres:sandbox_exec_sfohvvlqccmmebvjgibx:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65562-65567` — "key": "facl:has_role(uuid,app_role):postgres:service_role:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65568-65573` — "key": "facl:has_role(uuid,app_role):revoke",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65574-65579` — "key": "facl:has_role_in(uuid,app_role,uuid):postgres:postgres:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65580-65585` — "key": "facl:has_role_in(uuid,app_role,uuid):postgres:sandbox_exec_sfohvvlqccmmebvjgibx:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65586-65591` — "key": "facl:has_role_in(uuid,app_role,uuid):postgres:service_role:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:65592-65597` — "key": "facl:has_role_in(uuid,app_role,uuid):revoke",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:89898-89903` — "key": "tacl:public.user_permissions:postgres:anon:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:89904-89909` — "key": "tacl:public.user_permissions:postgres:authenticated:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:89910-89915` — "key": "tacl:public.user_permissions:postgres:postgres:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:89916-89921` — "key": "tacl:public.user_permissions:postgres:sandbox_exec:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:89922-89927` — "key": "tacl:public.user_permissions:postgres:sandbox_exec_sfohvvlqccmmebvjgibx:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:89928-89933` — "key": "tacl:public.user_permissions:postgres:service_role:False",
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json:89934-89939` — "key": "tacl:public.user_permissions:revoke",

## Replay semantics
- Execute core:221-239 checks context, enabled control, role/company, input structure and forbidden document-value fields BEFORE durable replay; role removal or kill-switch closure denies even a formerly successful request.
- Hash at core:228 includes supplier/items/movement/date/note (JSON array order remains relevant); request serialized by company+request_id lock (230). Same company/request: differing hash -> request_changed (238), then different actor -> request_actor_mismatch (239), then only applied/reversed accepted (240), returning durable result plus current status (241). Same actor exact replay is not a second financial application. Changed payload from another actor reports request_changed first.
- Bank replay core:904-915 first checks attached group's request ID, then calls execute, so same request/payload from a second authorized actor still hits request_actor_mismatch; matching line/request does not bypass creator check. If execution result is reversed, bank path raises group_not_applied (914).
- Reverse core:376-389: admin gate, reason, reverse-enabled, active-company group lookup; reversed group returns replay only for exact reversal_request_id AND reason. Different tuple -> already_reversed. No reversal actor-equality check: another same-company admin may replay the same reversal tuple. Contrast this intentionally with execute actor-binding; probe rather than assuming symmetry.
- Context-token replay is separate from business request replay. `supabase/tests/issue335/phase2n-context.py:27-40,60-100` tests session identity, token replay after COMMIT/ROLLBACK, new transaction and cross session. Do not present it as existing coverage for durable cross-user request IDs.

## Faithful local fixtures and helpers
- `supabase/tests/issue335/phase2h-run.sh:9-23`: exact PG17.6, disposable /tmp socket, no TCP listener, NOSUPERUSER postgres, install captured DDL and compare capture. `phase2h-install.py:12-17,20-34,64-70,127-135` restores owners/ACL/RLS and asserts postgres is not superuser. Do not run live/phase2h-extract.py: use existing captures.
- `phase2h-suite.sh:5-13,16-35`: OUT/adapted in /tmp, replay reference permission seeds, real fixtures, install candidates as postgres in group_storage/core/approval/invariants/balance order, sequential test state. This suite performs LOCAL writes; only recommend it, not execute it in this read-only investigation.
- `phase2h-fixtures.sql:7-35,37-60,66-75`: company A …001, B …002; admin A …010, viewer/user A …011, eventual manager A …012, manager A …016, editor A …017, users B …013/014/015, admin B …019; real auth trigger also creates user roles. Supplier …020, bank …030, cash …031, statement …040. Only manage_bp override is seeded for admin (53-54), NOT bank reconciliation override. Accountant actor is not supplied here: create one locally through real Auth path and grant accountant as service_role; also add a second admin A for reversal replay. B user …015 is not a suitable same-company baseline without explicitly relocating/adding membership.
- `phase2j.sql:6-10` grants …016 manager / …017 editor; `phase2j.sql:14-30` j_group creates approved income 100/expense 40 and cash movement 60 with real wrapper. It uses gen_random_uuid internally and returns group ID only: retain group.request_id AND reconstruct exact original input, or use a probe helper with explicit fixed request ID; do not invent a replay payload after execution.
- `scenarios.sql:1-21,32-61` existing same-request and changed-request replay tests; not proof of cross-user matrix.
- `phase2n-context.py:20-40` faithful session-authorization actor connection pattern; use SET SESSION AUTHORIZATION authenticated/anon (not merely SET ROLE from supabase_admin), set JWT sub, verify session_user/current_user and rolsuper=false. Set/check current_company_id for every actor.

## Recommended LOCAL probes (not executed)
1. Launch a separately authorized disposable faithful PG17.6 harness, with all PG* inherited variables removed (including PGSERVICE/PGSERVICEFILE/PGPASSFILE/PGOPTIONS, not only runner's common five); explicit /tmp socket, port, database, user, sslmode=disable. Never use inherited connection defaults or any hosted connection. All outputs /tmp. Keep a separate no-candidate faithful control if comparing legacy behavior.
2. Under authenticated real actor sessions, record has_role for all six business roles, has_permission(manage_bank_reconciliation), current_company_id, has_function_privilege for all three RPCs. Seed fresh valid two-leg documents/line for each matrix cell, test no override/true/false with overrides written only as authorized local fixture administrator. Assert exact denial layer/message and zero financial/audit/line changes on failure. Add accountant and same-company plain user, not viewer-only or foreign-company stand-ins.
3. Apply one explicit request as admin A, replay same actor unchanged: same result, no duplicate group/items/payments/offsets/audits. Replay as manager A, editor A (bank requires permission), second admin A: request_actor_mismatch for identical input; modified payload: request_changed. Plain user/accountant must be permission_denied before replay. Foreign company must never receive A result; probe using foreign fixtures to distinguish supplier_not_found/group_not_found from role denial. Test role revocation and disabled-control replay separately.
4. Bank offset equivalent replay on attached line with same request; changed request -> line_already_matched; same request new actor -> request_actor_mismatch if outer gate passes. Exact same actor replay must not duplicate bank links/audits. Reverse once as admin, repeat same tuple as same/second admin; nonadmins deny, changed tuple already_reversed. Execute replay after reversal returns reversed; bank adapter refuses group_not_applied.
5. user_permissions row matrix: own/other × A/B × SELECT/INSERT/UPDATE/DELETE, including attempted self-grant and switching company. Capture SQLSTATE and affected rows: UPDATE/DELETE may silently affect zero rows. Verify permission fallback and explicit false using has_permission. Separately inspect and locally test TRUNCATE privilege because RLS does not govern it; use disposable fixture/transaction rollback only, never Live.
6. Snapshot before/after groups/items/payments/offsets/transactions, bank line/link state, transaction/system audit rows, private execution context. Require successful positive controls; no invalid inputs or missing actors counted as security passes. Hash inputs/outputs and record actor identities and exact errors.

## Read manifest and integrity
This investigation read the ranges below; hashes describe full file bytes, NOT a claim of full reading for partial entries. Catalog entries were selected by key; large captures were not read in full. Existing historical read manifest `docs/testes/issue335-fase2n-leituras.md:1-18` has older core N=1130/hash, whereas the current candidate has 1148 lines; do not reuse the historical hash as current evidence.

- `AGENTS.md` | N=41 | sha256=4c5e8033c549a41636f29aa9496160566d638114421e36dfac5dbe99b986342d | read: 1-40
- `supabase/AGENTS.md` | N=3 | sha256=c4a593a91c43a79de00879fea8e566841a74d212962ee9a3dda8ffca46237b17 | read: 1-3
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql` | N=1148 | sha256=2c08b10602862d0e7cae08be6715970f8ce7c43d2efb4e1a7690e6161a50659a | read: 210-255,365-405,847-937,1080-1139; additional permission/replay/ACL lines via rg
- `supabase/tests/issue335/live/phase2h-catalog-ddl.json` | N=93223 | sha256=1c85fef0b728c92bf921404279d5e401e0d1172a498fb7503b068cb402709d6d | read: selected statements keyed above (not integral)
- `supabase/tests/issue335/phase2h-install.py` | N=135 | sha256=01e1dc9641e84163cfe0f1426abddf595036521e9f05fdad8f5fd9a443603e96 | read: 1-135
- `supabase/tests/issue335/phase2h-run.sh` | N=23 | sha256=65299cf90cf0e194d32636d8d4a91d1a4fcf63930e6bbc40606aa59ccbe01c52 | read: 1-23
- `supabase/tests/issue335/phase2h-suite.sh` | N=62 | sha256=cf57fb73e831392b54a3496c15430fc586186d90c2fb56929ae789fa93d35ad9 | read: 1-35
- `supabase/tests/issue335/phase2h-fixtures.sql` | N=75 | sha256=0e18c816017d5db7f3f46f4a2e69250a73690e851665647ed713b8a66bfcbb03 | read: 1-75
- `supabase/tests/issue335/phase2j.sql` | N=345 | sha256=84b08bc489e68ee3b754692d9ca565613df3b4303e5455b76489c61527f6cb0f | read: 1-40; replay/helper search matches
- `supabase/tests/issue335/phase2n-context.py` | N=229 | sha256=67c31a48bcd38ee3dcbbb6394d5bc91453acc00ed04802d6fe55af6be5df4f9f | read: 1-120
- `docs/testes/issue335-fase2n-leituras.md` | N=252 | sha256=8fe967fa3c57e8b13d206789c8a0fd96b85847c785e4e66ac494a2b364e369cf | read: 1-18; manifest search matches
