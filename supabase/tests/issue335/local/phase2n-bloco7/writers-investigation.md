# Issue #335 — Bloco7 local read-only writer investigation

## Scope and evidentiary limits
Read AGENTS.md and supabase/AGENTS.md. No network, database connection, SQL execution, installation, or repository edit was performed. All conclusions describe repository source and saved catalog artifacts, not current deployed state. Candidates remain INERTE/manual-only. Searches covered src, supabase/functions, supabase/manual, supabase/migrations, drizzle/migrations, and repository-wide SQL/table references. sandbox_exec* is a database-role family, not a separate discovered SQL source directory.

Classification: **legacy safe** = ordinary ungrouped legacy path or approved private-context command; **bypass guard** = direct managed-row attempt outside that command (normally rejected by candidate guard, NOT proof of successful bypass); **irrelevant** = read-only, metadata/ACL, historical fixture, or other-table write. Classification is conditional on candidate installation, which is NOT established here.

## Frontend exhaustive direct-write inventory
All direct application writers found are in src/pages/BankReconciliation.tsx; no table-name references or direct writers to these three tables were found in supabase/functions.

| File:lines | Operation | Classification and managed behavior |
|---|---|---|
| src/pages/BankReconciliation.tsx:1273-1303 | bank_statement_lines upsert, conflict financial_account_id,line_hash, ignoreDuplicates:true | legacy safe: INSERT/DO NOTHING, not replacement/update of existing linked offsets; rows omit offset_group_id. New auto-matches do not create offset groups. |
| src/pages/BankReconciliation.tsx:1453-1467 | confirmIgnore UPDATE bank_statement_lines; clears matching pointers, changes status/note | legacy safe on ungrouped rows; bypass guard attempt on grouped anchor, rejected by core:165-169. No offset-group-aware UI predicate. |
| src/pages/BankReconciliation.tsx:1469 | confirmIgnore DELETE bank_line_transactions by line_id | legacy safe ungrouped; bypass guard attempt on active grouped anchor, rejected core:170-175. Separate HTTP write after header update, not atomic as a pair. |
| src/pages/BankReconciliation.tsx:1536-1547 | rerunReconcile UPDATE bank_statement_lines per line | legacy safe normal auto/unmatched rows; bypass guard if grouped row reaches branch. Filter :1492-1496 selects unmatched or auto: matched; canonical offset: matched rows excluded. |
| src/pages/BankReconciliation.tsx:1550-1551 | rerunReconcile DELETE bank_line_transactions | same conditional classification; active-group OLD/NEW line lookup protects bridge. Separate per-row HTTP writes can leave partial legacy progress. |
| src/pages/BankReconciliation.tsx:1253-1268 | INSERT bank_statements header | irrelevant to direct three-table writes; parent creation for import. |
| src/pages/BankReconciliation.tsx:1306-1313 | count children then DELETE newly created empty bank_statements header | legacy safe expected empty-header cleanup; indirect cascade to lines is protected by guard/restrict when linked. Count query error is not checked: null count also takes deletion branch; constraints, not this precheck, are authority. |

src/lib/transaction-offsets.ts:36-42 reads offsets; :82-89 calls transaction_offset_create, :93-95 calls transaction_offset_remove — irrelevant as direct frontend writes, but RPC SQL writers included below. BankReconciliation.tsx:1405-1408 calls reconcile_bank_line, likewise indirect. No direct frontend INSERT/UPDATE/DELETE transaction_offsets was found.

## Exact guard and constraint citations
- Core :29 defines private NOLOGIN/NOBYPASSRLS executor; :33-49 stores inaccessible backend_pid + xid8 + token + operation context and validates trigger depth, backend, transaction, token and optional operation. Merely setting role or GUC is insufficient.
- Core :150-163 protects managed transaction_offsets, OLD/NEW group identity, and new/changed legacy pairs touching active managed items; :157-158 KEY SHARE locks transaction parents before checking active groups. DELETE grouped offsets is always rejected.
- Core :165-169 protects bank_statement_lines with OLD/NEW coalesced offset_group_id; untrusted mutation raises managed_bank_anchor_immutable, even trusted DELETE raises reverse_entire_group.
- Core :170-175 protects bank_line_transactions on either OLD or NEW line_id when referencing group has status preparing/applied/reversing; it is not a blanket prohibition on ordinary bridge writes or historical reversed groups.
- Core :208-213 attaches BEFORE INSERT OR UPDATE OR DELETE row triggers on all seven protected tables. This is not a TRUNCATE trigger. Owner/DDL trigger changes remain outside this guarantee.
- Core :1082-1117 command view + INSTEAD OF trigger creates and clears private context; :1126-1133 public invoker wrappers enqueue commands; :1135-1146 hardens sandbox/default-ACL exposure. Trusted command path is deliberate authority, not an accidental bypass.
- supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql:11: groups.bank_line_id REFERENCES bank_statement_lines(id) ON DELETE RESTRICT, no status predicate. Reversed retained group still holds this reference.
- Same storage file :36,38-39 protects group/item/transaction/forecast history; :63,73-74 payments/offsets/bank lines reference groups ON DELETE RESTRICT. In particular :74 protects deletion of a GROUP referenced by a line; :11 is the opposite direction protecting deletion of the LINE.
- supabase/migrations/20260909213213_c596a50f-84da-4257-a6d3-f2c1f9d3bce3.sql:20 statement deletion cascades to lines; :21 account deletion cascades to lines; :39 unique(account,line_hash). supabase/migrations/20260912142408_a8e6186b-676f-4502-a412-f4895769c1ad.sql:3 bridge line FK cascades; :4 transaction FK cascades. Cascades do not waive restricting references.

## Import deletion/upsert with linked offsets
Import never deletes/replaces existing line records: :1303 ignoreDuplicates yields DO NOTHING for existing account/hash and preserves original statement_id and managed offset linkage. BEFORE INSERT checks apply to proposed ungrouped rows, but no conflicting existing-row UPDATE is requested. Cleanup :1313 deletes only the new header, not the reused/original header; :1308-1312 is a non-atomic count and is not proof of emptiness. Deleting a header containing a managed line cascades into line deletion and is refused by candidate line guard and/or group bank_line_id FK. Whole SQL statement rolls back; no unlink-and-delete shortcut exists here.
Canonical reverse core:403-412 sets reversing, deletes bridge :408 and clears line offset_group_id :409, then retains group as reversed :412; it does NOT clear group.bank_line_id. Therefore after reverse the line guard no longer rejects an ungrouped line deletion, but storage :11 STILL restricts deletion of the historical bank line and consequently its statement/account. This is retention, not a claim that reverse makes import deletion possible. Upsert collision remains harmless before and after reverse.

## sandbox_exec* and SQL writer inventory
Saved baseline ACL: supabase/tests/issue335/live/phase2c-auth.sql:860-880 and :1114-1119 gives sandbox roles INSERT/SELECT, not blanket UPDATE/DELETE; :1200-1204 grants reconcile RPC to project-specific sandbox role. Saved role fixture phase2d-role.sql:11-14 marks roles BYPASSRLS and default INSERT/SELECT/EXECUTE grants. BYPASSRLS does not bypass triggers/FKs; function invoker/definer rights still matter. No role-identity or live ACL validation was attempted.
Candidate trusted writes (legacy safe within private context): core:345 adopts eligible legacy offsets; :408 DELETE bridge, :409 UPDATE line on reverse; :919 UPDATE grouped line and :920-921 INSERT cash-item bridge on bank attachment. Core:1046-1054, :1061, :1063-1064 are legacy reconciliation line UPDATE / bridge DELETE / bridge INSERT; :887 locks line, :925-929 rejects already-linked lines, :990 forbids managed payment date alignment. Untrusted attempts on anchors are rejected by guard; legacy reconciliation does not acquire managed authority just by being an RPC.
Baseline reconcile saved functions.sql:339-351 UPDATE line, :354 DELETE bridge, :356-357 INSERT bridge; rollback candidate :294-306, :309, :311-312 restores same legacy writers. These are legacy safe ungrouped; direct managed targeting is bypass guard attempt when candidate guards remain present. Rollback is not a deployment instruction.
Legacy offset_create INSERT and offset_remove DELETE are in migration 20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql:320-322 and :349. phase2d-legacy.sql:10-12 duplicates creation baseline. Legacy safe ungrouped; active-managed-document creation and grouped removal become bypass guard attempts and are rejected. _apply_transaction_offset/_reverse_transaction_offsets_for/apply_transaction_offsets read offsets but write payments, NOT the three target tables; irrelevant as direct target writers (core:426, baseline functions.sql:960,1027,2094).

### Exhaustive migration/SQL direct-DML occurrence list
The following is lexical inventory of production migrations, candidate SQL, rollback, and saved baseline function SQL. Test fixture DML is separate from production writers; repeated definitions are retained, not silently deduplicated.
- `drizzle/migrations/0066_derp218_silent_writes_partner_extra_reversal_link_date.sql:308` — `update public.bank_statement_lines` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `drizzle/migrations/0066_derp218_silent_writes_partner_extra_reversal_link_date.sql:323` — `delete from public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `drizzle/migrations/0066_derp218_silent_writes_partner_extra_reversal_link_date.sql:325` — `insert into public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql:345` — `UPDATE public.transaction_offsets` — **legacy safe — private-context managed command**.
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql:408` — `DELETE FROM public.bank_line_transactions` — **legacy safe — private-context managed command**.
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql:409` — `UPDATE public.bank_statement_lines` — **legacy safe — private-context managed command**.
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql:919` — `update public.bank_statement_lines` — **legacy safe — private-context managed command**.
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql:920` — `insert into public.bank_line_transactions` — **legacy safe — private-context managed command**.
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql:1046` — `update public.bank_statement_lines` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql:1061` — `delete from public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/manual/20261021_issue335_offset_core.INERTE.sql:1063` — `insert into public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql:294` — `update public.bank_statement_lines` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql:309` — `delete from public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql:311` — `insert into public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/migrations/20260910214128_18e50f55-3a0d-4050-a416-093fbce07ef2.sql:8` — `UPDATE public.bank_statement_lines` — **irrelevant historical targeted data repair; guarded if replayed against managed anchor**.
- `supabase/migrations/20260918164711_6b91dad2-0ce7-47a5-b183-4e6f55d3f9fc.sql:123` — `update public.bank_statement_lines` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/migrations/20260918165632_19308e54-fb06-4932-bdbb-25550e463e83.sql:123` — `update public.bank_statement_lines` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/migrations/20260922175952_c2dfd13e-4f5b-4f61-9da7-45a29d86460c.sql:128` — `update public.bank_statement_lines` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/migrations/20260922175952_c2dfd13e-4f5b-4f61-9da7-45a29d86460c.sql:142` — `delete from public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/migrations/20260922175952_c2dfd13e-4f5b-4f61-9da7-45a29d86460c.sql:144` — `insert into public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/migrations/20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql:320` — `INSERT INTO public.transaction_offsets` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/migrations/20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql:349` — `DELETE FROM public.transaction_offsets` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/migrations/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql:216` — `update public.bank_statement_lines` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/tests/issue335/live/functions.sql:339` — `update public.bank_statement_lines` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/tests/issue335/live/functions.sql:354` — `delete from public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/tests/issue335/live/functions.sql:356` — `insert into public.bank_line_transactions` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.
- `supabase/tests/issue335/live/phase2d-legacy.sql:10` — `INSERT INTO public.transaction_offsets` — **legacy safe (ungrouped); bypass guard if managed anchor targeted**.

## Irrelevant references and fixture scope
src/lib/bank-link-date.ts, src/hooks/useBankMovementGroups.ts, src/hooks/useSepaBankExecution.ts, src/components/bank/BankLineDocumentsDialog.tsx contain SELECT/read/decomposition only. src/integrations/supabase/types.ts is generated type metadata, not a writer; postgrest JSON files are metadata. SQL invariant readers, realtime publication changes, policies, grants, FK DDL, trigger watches and documentation references are irrelevant as direct DML. phase2*.sql/.py/scenarios/stub/local suite output under supabase/tests/issue335 are inert probe/fixture writers, not frontend/edge production entry points. JSON catalog copies are stored evidence, not executed sandbox SQL. No successful guard bypass or installation is asserted. No live runtime success, concurrent scheduling, or current schema parity is inferred from static reads.

## Read manifest
Complete relevant source reads were emitted in <=200-line intervals (large batched command output is retained in execution logs). SHA-256 below is of complete original file bytes, not an inferred installed definition. Intervals cover each listed file completely. Repository-wide search output was used for catalog/fixture references not listed as complete source reads.

| File | Read intervals (inclusive) | SHA-256 |
|---|---|---|
| `AGENTS.md` | 1-41 | `4c5e8033c549a41636f29aa9496160566d638114421e36dfac5dbe99b986342d` |
| `drizzle/migrations/0049_derp202_285_invariante_pago_abaixo_do_bruto.sql` | 1-59 | `9700f876a707f6ca117df7365f426e5cf64e056e86e75072bdf51fed6056c726` |
| `drizzle/migrations/0066_derp218_silent_writes_partner_extra_reversal_link_date.sql` | 1-200, 201-329 | `e21a48844089ab433d52153233fb027c9a318b11d6cabc89b150d31c2894c551` |
| `drizzle/migrations/0097_derp_299_invariant_tabelas_1000_por_nome.sql` | 1-39 | `9d053e3aee77c83511bb3086005b598911441ea36d14a27d021afe49f1802a60` |
| `drizzle/migrations/0102_0102_derp_244_sepa_bank_executions.sql` | 1-40 | `147457e999890507f9eb1dab61ee6fbc79d5586ca0c523bcd5cf257619529994` |
| `drizzle/migrations/0137_realtime_event_financials.sql` | 1-16 | `276b0af17585f45d71f2d8d9ad6ea1e174dff86d8ddd77cc599f66d507bb3202` |
| `src/components/bank/BankLineDocumentsDialog.tsx` | 1-200, 201-279 | `d638b5d787ab346e5385eaa1d9ab5e98cefdbd1909f6a0c07325049db9d7469f` |
| `src/hooks/useBankMovementGroups.ts` | 1-200, 201-202 | `1f31caf2ca6b83d6dc39350c17ec807e1d320e0026e71fe2fe36139c1da2f82c` |
| `src/hooks/useSepaBankExecution.ts` | 1-94 | `ffa8b9de1e3984b0b5dfbae23d24b9a309960644f31b8a917b8c57df673fb7b6` |
| `src/lib/bank-link-date.ts` | 1-64 | `ddc85c9beafccefdb8c5a74c2fbe39116bfd48005c2b860d0e2761d143302e30` |
| `src/lib/transaction-offsets.ts` | 1-99 | `b765062cc9bdd3da0bdfb92ac434348f6c58fe13efe7ba87b4898c3c1f2c557f` |
| `src/pages/BankReconciliation.tsx` | 1-200, 201-400, 401-600, 601-800, 801-1000, 1001-1200, 1201-1400, 1401-1600, 1601-1800, 1801-2000, 2001-2200, 2201-2400, 2401-2460 | `0dad37d972ad241a5955db73824507efa44bd8cd50f9f2dd452a0620d4dd10c3` |
| `supabase/AGENTS.md` | 1-3 | `c4a593a91c43a79de00879fea8e566841a74d212962ee9a3dda8ffca46237b17` |
| `supabase/manual/20261021_issue335_offset_core.INERTE.sql` | 1-200, 201-400, 401-600, 601-800, 801-1000, 1001-1148 | `2c08b10602862d0e7cae08be6715970f8ce7c43d2efb4e1a7690e6161a50659a` |
| `supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql` | 1-200, 201-400, 401-600, 601-714 | `9371b4a265c5b4a5d509ce0d2e275371c8554559bc06e23cebefc74b19ca785c` |
| `supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql` | 1-91 | `ea8632f3dfb3d997678c03ff33092088b2838cc7ab9e38eeb3f4a29ae60abecc` |
| `supabase/migrations/20260909213213_c596a50f-84da-4257-a6d3-f2c1f9d3bce3.sql` | 1-101 | `c4f5902f261e06a9fa03d32592c58ef0d8359081d48ce6bc4388c97121f71f78` |
| `supabase/migrations/20260909220455_d6244ea1-f5b9-401f-963d-6cc20607f134.sql` | 1-94 | `d88d4a0347369b01267f42c0c97d79fa7e6c7c5e4cb1e460a1f0347375d61e87` |
| `supabase/migrations/20260909223712_0b519cd5-9b23-4e39-8e4e-68bd834d06b8.sql` | 1-2 | `2e79f1d7d0e54a73bc82dfd0d913c8f8e28e3bb49f12db1891acd735aa66d3ef` |
| `supabase/migrations/20260910012710_c3e2f078-de19-4646-abc7-1e27c3c7ae9f.sql` | 1-64 | `e55fd74291b15ce688340a6b67383960bacf9f90ee4767cebf984ff5a589b9e7` |
| `supabase/migrations/20260910214128_18e50f55-3a0d-4050-a416-093fbce07ef2.sql` | 1-17 | `6b30fab2700d1ff6536be60716a8139db6a243e50d6823a6e15e0dfee9397f74` |
| `supabase/migrations/20260912142408_a8e6186b-676f-4502-a412-f4895769c1ad.sql` | 1-66 | `5b908cd7e73341075ece65f61745f3478f2e4afee63fffb04d6e9253e086a1a1` |
| `supabase/migrations/20260912144858_e9ceb294-e9ae-4880-8d7b-d57e71bcdeaa.sql` | 1-50 | `2c8ba0db994d5ed13e15334ba31c7f0817957d6a181c534cb8f59996e99cd443` |
| `supabase/migrations/20260912145951_6776cc74-f32a-4364-9500-69d07634d7c2.sql` | 1-23 | `aa65cbb31f47f3f5e285f617c81753d563327a0e30ada4ca5a66bcbfe521e290` |
| `supabase/migrations/20260918164711_6b91dad2-0ce7-47a5-b183-4e6f55d3f9fc.sql` | 1-145 | `c52a68292ed6d7ad3f0b9dd01b4e2bc92ea923a1b5bde4bf1ae697e9d7ccf294` |
| `supabase/migrations/20260918165632_19308e54-fb06-4932-bdbb-25550e463e83.sql` | 1-145 | `e4498ac2c7338e04e8755aac2ef30d63b73a4e68b1fba5fbc04d44cdb0855aa9` |
| `supabase/migrations/20260918200744_c300c854-2dd9-4cf8-93ac-2b4f6de99fdf.sql` | 1-200, 201-204 | `d705f0510c028adf51a2e7e2d9ec6421c03677d29bc214620d5b5d226666e36d` |
| `supabase/migrations/20260918202957_24ccf1dd-1553-4a66-b6d9-915f0b6c70cc.sql` | 1-200, 201-248 | `4fc7671f88324f9c701b5c062b2e8eb477d76dfbc26a50b7ff02712cefdd4891` |
| `supabase/migrations/20260918210943_890594c9-bf16-47fd-bb6d-ae0df24ca605.sql` | 1-49 | `efd5dd173b502df62a6610390f5c3a37cf65411ad39d87e42d7b2f3d1390618b` |
| `supabase/migrations/20260922175952_c2dfd13e-4f5b-4f61-9da7-45a29d86460c.sql` | 1-153 | `bbb5db884bf11f1456dbd57dbba6d5569bc431baf0b11d9aba0a3c0d6c6c37ae` |
| `supabase/migrations/20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql` | 1-200, 201-400, 401-600, 601-608 | `e60cacc7345c1d41d740e98a3cbdebdb1775fef425c3cbb786261226ccb7e5d9` |
| `supabase/migrations/20261002103000_camarim_invariant_saldo_sessao.sql` | 1-200, 201-263 | `4d212ad61a4829bfe23b083e4cafdadec23d12799a47f39f29cba9fe9476243e` |
| `supabase/migrations/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql` | 1-200, 201-316 | `f4f8e02bbd8ba77759ff36bda926b99b28783041193948b9384e99ccd7d47783` |
| `supabase/tests/issue335/live/functions.sql` | 1-200, 201-400, 401-600, 601-800, 801-1000, 1001-1200, 1201-1400, 1401-1600, 1601-1800, 1801-2000, 2001-2200, 2201-2400, 2401-2600, 2601-2800, 2801-3000, 3001-3200, 3201-3233 | `55e6b6d91a977aa97dcd8001c50dffb9df71a290b047f24e0703634686181bf1` |
| `supabase/tests/issue335/live/phase2c-auth.sql` | 1-200, 201-400, 401-600, 601-800, 801-1000, 1001-1200, 1201-1400, 1401-1471 | `fb4768371f61b502634a2ea4d647f3924760a7db733edf8f38e6e13f3c06660f` |
| `supabase/tests/issue335/live/phase2d-constraints.sql` | 1-14 | `122ba034d0868e3af650b4c04fab9b658464403a7b0706d5ed24a70e24e8f9e9` |
| `supabase/tests/issue335/live/phase2d-legacy.sql` | 1-27 | `ae466ac60343bfdc6c2f68fa416bf68843e3241b5821557fdb01380fe94b170d` |
| `supabase/tests/issue335/live/phase2d-role.sql` | 1-19 | `533683f655d1250e6b86932fd10937b1e2f0de39bb4230c004d39414a8d15826` |
