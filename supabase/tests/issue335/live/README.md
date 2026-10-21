# Local catalog replay — not certified Live parity

Catalog collected by SELECT only on 2026-10-21; no financial rows read.
`catalog.json` records 54 triggers and 74 function definitions. `functions.sql`
loads 67 definitions; `triggers.sql` installs all 54 trigger definitions.

Substitutions, explicitly not production authorization proofs:
- auth.uid and auth.jwt: disposable session settings / empty JSON.
- current_company_id: disposable session setting.
- has_role and has_staff_role: local roles table / simplified staff set.
- has_permission_in: local admin check, not the effective permission model.
- is_platform_admin(uuid) and is_platform_admin(): false.
- _effective_permissions_for and row_belongs_to_current_company: recorded only,
  not loaded, because their transitive authorization dependencies are incomplete.

No catalog-listed trigger definition is omitted. That does not prove all paths:
owners and ACLs are not replayed, RLS is simplified, nullability and foreign keys
are incomplete, and transitive tables/constraints are only partially present.
The Coala forecast category trigger emits `record new has no field supplier_id`;
this installed definition catches its own error. It was not silently repaired or
disabled; matching scenarios pass while that side effect is not certified.

Tests use Unix sockets with external PG variables removed. Fixtures are created
only in a disposable local cluster. Nothing here authorizes A–C or Live writes.