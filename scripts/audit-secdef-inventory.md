# SECDEF Inventory — schema `public`

**Gerado em:** 2026-05-09 contra **Live**.
**Escopo:** funções com `prosecdef = true` em `public`.

> **UPDATE 2026-05-09 (pós B.1+B.2+B.3):** auditoria fresca via `pg_get_functiondef` mostrou que **todas as 11 funções listadas como Cat. D já têm role + tenant + platform_admin guards no body** (endurecidas em migrations anteriores: `bp-versions-rls-and-trash`, `bp-versions-scenarios`, `formalidade-bulk-audit`, `multi-tenant-leaky-policies-fix`). O regex usado neste inventário (`has_role\(auth\.uid`) deu falso negativo em `merge_forecasts_into_active_snapshot` (usa `EXISTS user_roles` inline — funcionalmente equivalente). **Cat. D fechada — sem patches a aplicar.** Os 2 wrappers internos (`_revert_event_to_version`, `reconcile_bp_overrides_for_event`) continuam sem guards mas estão protegidos por `REVOKE … FROM anon, authenticated` (lote B.2). Próxima frente: Cat. C (`SECURITY INVOKER`).

**Estado actual de GRANTs:** todas com `EXECUTE` por defeito a `PUBLIC` (a menos que uma migration tenha emitido `REVOKE`); `information_schema.role_routine_grants` não distingue "default `PUBLIC`" vs "post-`REVOKE` sem grants explícitos", por isso a Fase 2 deve emitir `REVOKE … FROM PUBLIC, anon, authenticated` explícito mesmo onde uma migration anterior já o tenha feito (idempotente).

---

## Sumário

| Total | Triggers (`RETURNS trigger`) | Callables |
|---:|---:|---:|
| **63** | **15** | **48** |

| Categoria | Nº | Acção Fase 2 |
|---|---:|---|
| **A** — manter (`EXECUTE TO authenticated`) | **9** | nenhuma |
| **B.1** — triggers (revoke total) | **17** | `REVOKE FROM PUBLIC, anon, authenticated` |
| **B.2** — cron/edge-only (revoke + grant service_role) | **15** | `REVOKE … ; GRANT TO service_role` |
| **B.3** — admin RPC (revoke `anon`, manter `authenticated`) | **6** | `REVOKE FROM anon` |
| **C** — passar a `SECURITY INVOKER` | **5** | `CREATE OR REPLACE` |
| **D** — adicionar guard de role + tenant no body | **11** | `CREATE OR REPLACE` com `IF NOT has_role …` + tenant check |

> Algumas funções aparecem em **mais que uma** categoria (ex.: `bp_version_linked_tx_count` é A e candidata a C; `restore_bp_versions_from_trash` é B.3 mas precisa de tenant check ⇒ também D). O total de funções alteradas em Fase 2 ≈ **45 distintas**.

---

## Categoria A — Manter (wrappers RLS + read-only seguros)

| Função | Args | Callers | Guard interno | Notas |
|---|---|---|---|---|
| `current_company_id` | `()` | RLS de ~80 tabelas (RESTRICTIVE) | usa `auth.uid()` + lê `profiles.company_id`/`active_company_id` | crítica para multi-tenant. Não tocar. |
| `is_platform_admin` | `(_user_id uuid)` | RLS + RPC | lê `user_roles` | |
| `has_role` | `(_user_id uuid, _role app_role)` | RLS + RPC | lê `user_roles` | |
| `has_permission` | `(_user_id uuid, _permission text)` | RLS | lê `user_permissions` + `role_permissions` | |
| `get_user_role` | `(_user_id uuid)` | helpers | lê `user_roles` | |
| `has_partner_access` | `(_user_id uuid, _event_id uuid)` | RLS de `events`, `event_forecasts`, `bp_versions` | lê `event_partners` | |
| `row_belongs_to_current_company` | `(_row_company_id uuid)` | RLS RESTRICTIVE | `current_company_id()` + `is_platform_admin()` | |
| `storage_path_belongs_to_current_company` | `(_name text)` | RLS de `storage.objects` | idem + parsing do path | |
| `bp_version_linked_tx_count` | `(_event_id uuid)` | `useBPVersions.ts` (RPC) | nenhum — só lê `event_forecasts` filtrado por `event_id` | RLS de `event_forecasts` já protege. ✅ Também candidato a Cat. C. |

---

## Categoria B.1 — Triggers (revoke total de PUBLIC/anon/authenticated)

Todas têm `RETURNS trigger`. Triggers continuam a disparar como owner; revogar `EXECUTE` apenas impede chamadas directas via RPC, que não fazem sentido.

| Função | Trigger anexo | Tabela(s) |
|---|---|---|
| `auto_create_initial_bp_version` | ✅ | `events` (status transitions) |
| `auto_create_retroactive_split_snapshots` | ✅ | `bp_versions` |
| `handle_new_user` | ✅ | `auth.users` (insert) |
| `log_formalidade_change` | ✅ | `event_forecasts` |
| `log_table_change` | ✅ | múltiplas (alimenta `system_audit_log`) |
| `prevent_split_absorbs_admin` | ✅ | `event_forecasts` |
| `reimbursement_propagate_payment` | ✅ | `transactions` |
| `reimbursement_revert_on_tx_delete` | ✅ | `transactions` |
| `set_company_id_on_insert` | ✅ | ~80 tabelas (default `company_id`) |
| `set_event_ab_company_id` | ✅ | `event_ab_scenarios` |
| `snapshot_bp_versions_to_trash` | ✅ | `events` (delete cascade) |
| `tg_sponsorship_pipeline_autolog` | ✅ | `sponsorship_pipeline` |
| `validate_category_allocate_flag` | ✅ | `account_categories` |
| `validate_event_admin_absorption` | ✅ | `event_forecasts` |
| `audit_generic_changes` | via wrappers `audit_*_changes` (memória 2026-04). Migration `20260429195212` já fez `REVOKE FROM PUBLIC, anon, authenticated` ✅. Confirmar em Live. | suppliers, companies, user_roles, user_permissions, financial_accounts |
| `set_combo_pass_company_id` | a confirmar attach (migração `20260503032951` cria; trigger `pg_trigger` query devolveu `false` ⇒ verificar) | `combo_passes` |
| `set_combo_pass_child_company_id` | idem | `combo_pass_children` |

---

## Categoria B.2 — Cron / edge-only (revoke + `GRANT TO service_role`)

Nenhuma destas é chamada com cast `as any` no frontend (verificado por grep). Todas correm com service-role key (cron jobs ou edge functions internas).

| Função | Args | Caller real | Mutativa? |
|---|---|---|---|
| `cleanup_old_backups` | `()` | cron `cleanup-old-backups` (mas Live usa cron com DELETE inline; função existe mas não é chamada) | DELETE em `storage.objects` + INSERT em `system_audit_log` |
| `test_latest_backup` | `()` | cron `monthly-backup-test` (Live usa DO block inline; função não wired) | só lê |
| `run_rls_legacy_audit_cron` | `()` | cron diário (não encontrado em `cron.job` de Live; provavelmente em Test) | wrapper de `run_rls_legacy_audit` |
| `audit_multi_tenant_isolation` | `()` | só em `types.ts` — sem caller no app | só lê metrics |
| `_revert_event_to_version` | `(_event_id, _target_version_id, …, _force)` | DB-internal: chamada por `revert_to_bp_version` (confirmado via `pg_get_functiondef` cross-search) | DELETE+INSERT em `event_forecasts` + INSERT em `bp_versions` |
| `apply_formalidade_suggestions` | `(_forecast_ids, _new_state)` | sem caller (substituída por `_map`) | UPDATE `event_forecasts` |
| `mark_forecasts_fechado_auto` | `(_ids)` | `MarkAsFechadoDialog.tsx` (cast `as any`) — **CORRIGIR**: este é client-call, mover para B.3 | UPDATE `event_forecasts` |
| `set_formalidade_auto_suggested` | `(_value)` | sem caller no app; helper de session local (`SET LOCAL`) | só `SET LOCAL` |
| `reconcile_bp_overrides_for_event` | `(_event_id, _trigger_version_id, …)` | DB-internal: chamada por `create_bp_snapshot` | DML em `event_forecasts` |
| `relink_orphan_transactions` | `(_event_id, _pairs, …)` | sem caller no app — RPC admin não exposta | UPDATE `transactions.category_id` |
| `recalculate_pax_benchmarks` | `(_company_id)` | sem caller no app — admin batch | UPDATE em `events` |
| `enqueue_email` | `(queue_name, payload)` | `auth-email-hook`, `create-user`, `request-password-reset`, `resend-reset-email`, `send-transactional-email` (5 edge fns, todas service-role) | wrapper `pgmq.send` |
| `read_email_batch` | `(queue_name, batch_size, vt)` | `process-email-queue` | wrapper `pgmq.read` |
| `delete_email` | `(queue_name, message_id)` | `process-email-queue` | wrapper `pgmq.delete` |
| `move_to_dlq` | `(source_queue, dlq_name, message_id, payload)` | `process-email-queue` | wrapper |
| `find_admin_absorbing_events` | `(p_date, p_company_id)` | sem caller no app (só `types.ts`) | só lê |

**⚠️ Reclassificação:** `mark_forecasts_fechado_auto` foi inicialmente colocada em B.2 mas é chamada pelo cliente (`MarkAsFechadoDialog.tsx` com cast `as any`) ⇒ **mover para B.3** ou D (mutativa, sem guard role no body).

---

## Categoria B.3 — Admin RPC (revoke só de `anon`)

Têm guard `has_role`/`is_platform_admin` no body; aceitam ser callable por `authenticated` (a função rejeita).

| Função | Args | Guard | Caller |
|---|---|---|---|
| `run_rls_legacy_audit` | `(_triggered_by, _user)` | role check externo (na edge fn) | edge `run-rls-legacy-audit` + page `/admin/auditoria-rls` |
| `set_active_company` | `(target_company_id)` | `is_platform_admin()` | `useCompany.ts` |
| `analyze_formalidade_bulk` | `(_event_ids)` | `has_role(admin\|manager)` ✅ | `/admin/formalidade` |
| `apply_formalidade_suggestions_map` | `(_payload)` | `has_role(admin\|manager)` ✅ | `/admin/formalidade` |
| `formalidade_audit_stats` | `(_event_ids)` | `has_role(admin\|manager)` ✅ | `/admin/formalidade` |
| `mark_forecasts_fechado_auto` | `(_ids)` | **falta** ⇒ adicionar (também aparece em D) | `MarkAsFechadoDialog.tsx` |

---

## Categoria C — Migrar para `SECURITY INVOKER`

> **UPDATE 2026-05-09 — Cat. C concluída.** Auditoria via `pg_get_functiondef` em Test **e** Live confirmou que as 5 funções abaixo já estão `SECURITY INVOKER` (`prosecdef=false`). Migration aplicada em Test (`02-cat-C-security-invoker.APPLIED.txt`); Live ou já estava migrada de uma corrida anterior, ou nunca foi DEFINER (mesma classe de erro de inventário detectada na Cat. D). Plano completo de validação role-a-role em `.lovable/plan.md`. Smoke role-matrix (admin/manager/editor/viewer/partner próprio/partner alheio + tentativa cross-tenant) deve correr pós-publicação como defesa em profundidade.

Read-only que só lê tabelas com RLS já bem definida. Tornar `SECURITY INVOKER` faz com que respeitem o RLS do caller (defesa em profundidade).

| Função | Risco RLS | Tabelas | Decisão |
|---|---|---|---|
| `bp_version_linked_tx_count(_event_id)` | baixo | `event_forecasts` | ✅ migrar |
| `list_bp_versions(_event_id)` | médio — partner pode passar a ver só `state='active'` (já é o pretendido pela memória) | `bp_versions` | ✅ migrar mas validar com canonical scenarios "Portal do Sócio" |
| `list_orphan_transactions_for_event(_event_id)` | baixo (só admin/manager acede via UI) | `transactions`, `event_forecasts` | ✅ migrar |
| `find_admin_absorbing_events(p_date, p_company_id)` | baixo (já filtra por `p_company_id`) | `events` | ✅ migrar (duplo: também B.2) |
| `suggest_formalidade(_forecast_id)` | baixo | `event_forecasts`, `transactions` | ✅ migrar |

> `formalidade_audit_stats` foi avaliada mas **fica em B.3** (precisa do bypass de RLS para varrer múltiplos eventos por admin/manager; SECURITY INVOKER limitaria sem ganho real).

---

## Categoria D — Investigação caso-a-caso (HIGH RISK)

Mutativas e SEM guard adequado. Sendo `SECURITY DEFINER`, **ignoram RLS** dentro do corpo ⇒ qualquer `authenticated` com um UUID válido pode invocá-las e modificar dados de outro tenant.

Matriz de guards (lida directamente do `pg_get_functiondef`):

| Função | `has_role` | `is_platform_admin` | `current_company_id` | `auth.uid()` | `RAISE` |
|---|:-:|:-:|:-:|:-:|:-:|
| `_revert_event_to_version` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `archive_bp_version` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `create_bp_snapshot` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `discard_bp_version_draft` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `merge_forecasts_into_active_snapshot` | ❌ | ❌ | ❌ | ✅ (só metadata) | ✅ |
| `promote_scenario_to_active` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `reconcile_bp_overrides_for_event` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `recalculate_pax_benchmarks` | ✅ | ✅ | ❌ (mas `_company_id` é param) | ✅ | ✅ |
| `relink_orphan_transactions` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `revert_to_bp_version` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `unarchive_bp_version` | ❌ | ❌ | ❌ | ❌ | ✅ |

### `_revert_event_to_version(_event_id uuid, _target_version_id uuid, _performed_by uuid, _performed_by_label text, _force boolean)`
- **Definição (chave):** `DELETE FROM event_forecasts WHERE event_id = _event_id;` + `INSERT INTO bp_versions (...) VALUES (_event_id, ...)`. Valida só que `target.event_id == _event_id`.
- **Caller:** DB-internal — chamada por `revert_to_bp_version`. Sem caller externo.
- **`SET search_path`?** ✅ `public`
- **Tenant check?** ❌
- **Role check?** ❌
- **Idempotente?** ❌ (sempre cria nova `bp_versions` row)
- **Risco:** **alto** se exposta — qualquer `authenticated` pode wipe-and-replace BP de qualquer evento.
- **Recomendação Fase 2:** **B.2** (revoke total + grant service_role) — já é wrapper interno; não precisa de role check no corpo se for inacessível externamente.

### `revert_to_bp_version(_version_id uuid, _force boolean, _performed_by uuid, _performed_by_label text)`
- **Definição (chave):** lê `bp_versions` para obter `event_id`; depois `PERFORM public._revert_event_to_version(...)`.
- **Caller:** `src/hooks/useBPVersions.ts` (cliente).
- **`SET search_path`?** ✅
- **Tenant check?** ❌
- **Role check?** ❌
- **Risco:** **alto** — wrapper exposto sem nenhum guard.
- **Recomendação Fase 2:** **D** — adicionar `IF NOT has_role(auth.uid(),'admin'|'manager') THEN RAISE` + tenant check `(SELECT company_id FROM events WHERE id = (SELECT event_id FROM bp_versions WHERE id=_version_id)) = current_company_id()`.

### `promote_scenario_to_active(_scenario_version_id uuid, _description text, _performed_by uuid, _performed_by_label text, _force boolean, _other_scenarios_actions jsonb)` (~18 KB de body)
- **Definição (chave):** cascade Master→Splits, mexe em `bp_versions`, `event_forecasts`. Sem nenhum guard `has_role`/`current_company_id` no body.
- **Caller:** `src/hooks/useBPVersions.ts` + edge `apply-coala-bp` (potencialmente).
- **`SET search_path`?** ✅
- **Tenant check?** ❌
- **Role check?** ❌
- **Idempotente?** parcial (transição de estado é, mas auditoria não)
- **Risco:** **crítico** — função mais complexa do projeto, totalmente desprotegida.
- **Recomendação Fase 2:** **D** — adicionar guards no topo do body. Validar com canonical scenarios `bp-versions-scenarios` antes de publicar.

### `promote_scenario_draft_to_active(_scenario_version_id uuid, _new_active_label text, _new_active_description text)`
- **Caller:** sem caller no código (variante antiga).
- **Guards:** `has_role` ✅ + `auth.uid()` ✅
- **Recomendação Fase 2:** **B.2** revoke (e candidata a `DROP` em volta futura, depois de confirmar com utilizador).

### `archive_bp_version(_version_id uuid, _performed_by uuid, _performed_by_label text)`
- **Definição (chave):** UPDATE state em `bp_versions` + cascade aos splits via `cascaded_from_version_id`.
- **Caller:** `useBPVersions.ts`.
- **Guards:** ❌ todos
- **Risco:** **médio** — qualquer authenticated pode arquivar versões de outro tenant se conhecer o UUID (degrada UI mas não destrói dados).
- **Recomendação Fase 2:** **D** — adicionar role + tenant check.

### `unarchive_bp_version(_version_id, _performed_by, _performed_by_label)`
- Igual a `archive_bp_version` (UPDATE state inverso).
- **Recomendação Fase 2:** **D** — adicionar guards.

### `discard_bp_version_draft(_version_id uuid, _performed_by uuid, _performed_by_label text)`
- **Definição (chave):** DELETE em `bp_versions`.
- **Caller:** `useBPVersions.ts`.
- **Guards:** ❌ todos
- **Risco:** **médio-alto** — DELETE cross-tenant se UUID conhecido.
- **Recomendação Fase 2:** **D** — adicionar role + tenant check.

### `create_bp_snapshot(_event_id, _description, _approve_immediately, _scenario_label, _scenario_assumptions, _is_pinned_scenario, _created_by, _created_by_label)` (~11 KB)
- **Definição (chave):** `SELECT … FROM events WHERE id = _event_id`; INSERT em `bp_versions`; chama `reconcile_bp_overrides_for_event`. Cascade Master→Splits.
- **Caller:** `useBPVersions.ts` + edge `apply-coala-bp`.
- **Guards:** ❌ todos
- **Risco:** **alto** — pode criar versões em eventos de outro tenant.
- **Recomendação Fase 2:** **D** — adicionar `IF events.company_id <> current_company_id() THEN RAISE` (o evento já é lookup, basta validar `v_event.company_id`).

### `merge_forecasts_into_active_snapshot(_event_id uuid, _forecast_ids uuid[])`
- **Definição (chave):** UPDATE `bp_versions.snapshot_payload` + INSERT `bp_version_audit_log`.
- **Caller:** `src/components/SponsorsImportModal.tsx`.
- **Guards:** `auth.uid()` ✅ (só para metadata) — **nenhum role/tenant**.
- **Risco:** **alto** — corrompe snapshot de qualquer event_id.
- **Recomendação Fase 2:** **D** — adicionar role + tenant check.

### `relink_orphan_transactions(_event_id uuid, _pairs jsonb, _performed_by uuid, _performed_by_label text)`
- **Definição (chave):** UPDATE `transactions.category_id` em massa.
- **Caller:** sem caller no app (admin RPC não exposta).
- **Guards:** ❌ todos
- **Risco:** **crítico** — pode reatribuir categorias de transações de outro tenant.
- **Recomendação Fase 2:** **D + B.2** — primeiro revoke geral; depois adicionar guards (caso reaberta).

### `reconcile_bp_overrides_for_event(_event_id, _trigger_version_id, _trigger_version_number, _performed_by, _performed_by_label)`
- **Definição (chave):** DML em `event_forecasts` para reflectir overrides do snapshot.
- **Caller:** DB-internal — chamada por `create_bp_snapshot`.
- **Guards:** ❌ todos (nem `RAISE`)
- **Risco:** **médio** se exposta — corrompe forecasts.
- **Recomendação Fase 2:** **B.2** — revoke total + grant service_role; sem necessidade de adicionar guard se for inacessível externamente.

### `recalculate_pax_benchmarks(_company_id uuid DEFAULT NULL)`
- **Definição (chave):** UPDATE em `events.pax_benchmark`.
- **Caller:** sem caller no app.
- **Guards:** `has_role(admin)` ✅ + `is_platform_admin()` ✅ + `auth.uid()` ✅. **Falta:** garantir `_company_id = current_company_id()` quando o caller não é platform_admin.
- **Risco:** **médio** — admin de uma empresa pode passar `_company_id` de outra empresa e disparar recálculo.
- **Recomendação Fase 2:** **D** — adicionar `IF _company_id IS NOT NULL AND _company_id <> current_company_id() AND NOT is_platform_admin(auth.uid()) THEN RAISE`.

### `restore_bp_versions_from_trash(_trash_id uuid)`
- **Caller:** sem caller no app (apenas `types.ts`); UI Lixo provavelmente está noutra trilha.
- **Guards:** `has_role(admin|manager)` ✅ + `auth.uid()` ✅. **Falta:** validar tenant do `_trash_id`.
- **Recomendação Fase 2:** **D** (light) — adicionar tenant check; manter `EXECUTE TO authenticated` (B.3).

### `consume_recovery_code(_code_hash text)` e `validate_trusted_device(_token_hash text)`
- Filtram por `auth.uid()` ✅ no body. **Sem risco de cross-tenant** — só age sobre os próprios códigos.
- **Recomendação Fase 2:** **B.3** — `REVOKE FROM anon`; manter `authenticated`. Não migrar para SECURITY INVOKER (precisam do DEFINER para escrever em `mfa_recovery_codes`/`mfa_trusted_devices` com RLS apertado).

### `create_scenario_draft` / `discard_scenario_draft`
- Têm `has_role` + `auth.uid()` ✅. Falta tenant check (event do snapshot pode ser de outro tenant).
- **Recomendação Fase 2:** **D** (light) — adicionar tenant check via `bp_versions → events.company_id`.

---

## Reclassificações vs plano original

| Função | Original | Final | Razão |
|---|---|---|---|
| `mark_forecasts_fechado_auto` | B.2 (cron/edge) | **B.3 + D** | É chamada pelo cliente em `MarkAsFechadoDialog.tsx` com cast `as any` — não detectada no primeiro grep |
| `find_admin_absorbing_events` | A | **B.2 + C** | Sem caller no código real; também é read-only adequada a SECURITY INVOKER |
| `audit_multi_tenant_isolation` | B.2 | **B.2 + candidata DROP** | Sem caller real; só usada manualmente uma vez na migration |
| `cleanup_old_backups`, `test_latest_backup`, `run_rls_legacy_audit_cron` | B.2 | **B.2 (mas validar wiring)** | Em Live os crons fazem o trabalho **inline** (DELETE/DO block), as funções existem mas não estão wired. Manter revoke; opção: DROP em volta futura. |
| `reconcile_bp_overrides_for_event` | B.2 | **B.2 (não D)** | É puramente DB-internal; não precisa de guard interno se não for callable externamente |
| `_revert_event_to_version` | D | **B.2 (não D)** | Mesma lógica — wrapper interno chamado por `revert_to_bp_version`; basta revoke |
| `restore_bp_versions_from_trash` | B.2 | **B.3 + D (light)** | Tem guard `has_role` mas falta tenant check |
| `recalculate_pax_benchmarks` | B.2 | **D (light)** | Tem guards parciais; precisa só de tenant check sobre `_company_id` |

---

## Funções candidatas a `DROP` em volta futura (não nesta)

| Função | Razão |
|---|---|
| `apply_formalidade_suggestions(_ids, _state)` | substituída por `apply_formalidade_suggestions_map(_payload)` |
| `promote_scenario_draft_to_active(_v, _label, _desc)` | substituída por `promote_scenario_to_active` (6 args) |
| `audit_multi_tenant_isolation()` | sem caller no app; era ferramenta de debug pré-batch 9 |
| `cleanup_old_backups()`, `test_latest_backup()`, `run_rls_legacy_audit_cron()` | crons em Live fazem o trabalho inline |
| `find_admin_absorbing_events(p_date, p_company_id)` | sem caller no app (verificar se será usada na Fase 8) |

⇒ **Não dropar nesta volta** — só listar para reapreciação.

---

## Funções Cat. D que precisam de patch individual (Fase 2)

Lista final, por prioridade decrescente de risco:

1. **`promote_scenario_to_active`** — crítico, 18 KB de body, cascade Master→Splits
2. **`relink_orphan_transactions`** — crítico, UPDATE em `transactions.category_id`
3. **`merge_forecasts_into_active_snapshot`** — alto, UPDATE em `snapshot_payload`
4. **`revert_to_bp_version`** — alto, wrapper de DELETE+INSERT em `event_forecasts`
5. **`create_bp_snapshot`** — alto, INSERT em `bp_versions` (qualquer evento)
6. **`archive_bp_version`** — médio, UPDATE state
7. **`unarchive_bp_version`** — médio, UPDATE state
8. **`discard_bp_version_draft`** — médio-alto, DELETE
9. **`recalculate_pax_benchmarks`** — médio (já tem guards parciais; falta tenant)
10. **`restore_bp_versions_from_trash`** — médio (já tem `has_role`; falta tenant)
11. **`mark_forecasts_fechado_auto`** — médio (sem nenhum guard, chamada pelo cliente)

Adicionalmente em `D (light)`: `create_scenario_draft`, `discard_scenario_draft` (já têm role; falta tenant via JOIN).

---

## Próximos passos (não execução)

A Fase 2 deve produzir 5 ficheiros `.txt` em `scripts/secdef-hardening/`:

1. `01-triggers-revoke.txt` — Cat. B.1 (17 fns)
2. `02-cron-edge-revoke.txt` — Cat. B.2 (15 fns)
3. `03-admin-rpc-tighten.txt` — Cat. B.3 (`REVOKE FROM anon` em 6 fns)
4. `04-secinv-readonly.txt` — Cat. C (5 fns recriadas com `SECURITY INVOKER`)
5. `05-cat-d-fixes/` — uma migration por função Cat. D (11 ficheiros)

Cada lote deve ser corrido em **Test → smoke test → Live**, com snapshot pré/post de `role_routine_grants` em `/mnt/documents/secdef-grants-pre-<batch>.tsv`.
