# #335 local catalog replay — phase 2d, NOT certified for Live application

All source definitions were retrieved by SELECT to the catalog only; no financial rows were read.
54 real triggers and the installed identity helper bodies are replayed. current_company_id,
has_role and has_staff_role are SECURITY DEFINER in Live and locally; prior claims of INVOKER were incorrect.

`run.sh` bootstraps only setup with supabase_admin. The three INERTE candidates and their
rollbacks execute as postgres NOSUPERUSER, CREATEROLE, BYPASSRLS, with Live public default
privileges and auth USAGE without grant option. Privileged corruption fixtures use supabase_admin;
application attack tests switch to authenticated/anon/service_role. This distinction is explicit.

The dedicated NOLOGIN executor receives temporary SET membership for postgres and temporary
public CREATE for ownership transfer, revoked before commit. App roles never receive membership.
No executor grants are attempted in auth. A postgres-owned private identity accessor uses auth.uid.
Identity helpers are DEFINER, but the installed PUBLIC companies SELECT policy directly queries
user_roles: caller-only `issue335_company_membership` SELECT remains necessary. profiles grants are removed.

Rollback order: invariants -> core -> group_storage. Wrong order raises rollback_order;
any group history raises groups_exist_keep_guards. DROP OWNED is not used. Unexpected role
dependencies cause DROP ROLE to fail and the surrounding transaction rolls back.

Remaining limitations: 22 FK dependencies not replayed; role/default/schema model is scoped
(not the entire hosted role system). Comparator checks constraint names, not their complete semantics.
No real REST server is started: storage-only attacks use its exact authenticated SQL role.
Three-session tests retain timing sleeps; not an exhaustive deterministic scheduler proof.
Restore atomic/administrative-window integration and server debit balance guard remain unproven.
The local balance regression explicitly reproduces canonical paid_amount counting compensation:
100 account delta versus 60 cash. This is an OPEN blocker, not a passing financial invariant.

No migration tool, migrations directory, DDL/DML in Live, deploy or Publish is authorized.
A–C remain separate approvals after technical acceptance. Fixtures and sockets are disposable/local.
