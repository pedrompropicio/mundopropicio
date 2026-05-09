
# Hardening das funções `SECURITY DEFINER` (schema `public`)

## Resumo do inventário (já corrido em Live, read-only)

- Total de funções `SECURITY DEFINER` em `public`: **63**
  - **14** são funções de **trigger** (assinatura `() RETURNS trigger`) — não são chamáveis por RPC, mas têm `EXECUTE` para `PUBLIC` por defeito, o que é desnecessário.
  - **49** são **funções chamáveis** (RPC ou helpers internos).
- Nenhuma tem `REVOKE` explícito — todas herdam o GRANT default `EXECUTE TO PUBLIC`, ou seja, callable por `anon` e `authenticated` via PostgREST/SQL.
- Cruzando com `grep` no código (`src/` + `supabase/functions/`), identifiquei **25 RPCs efetivamente chamados pelo cliente ou edge functions**. Os restantes ~24 callables são helpers internos / cron / edge-only ⇒ candidatos óbvios a revoke.

> Nota: o linter Supabase reporta ~110 ocorrências porque conta o cartesiano função × grantee em todos os schemas. O nosso âmbito real são estas 63 em `public`.

---

## Fase 1 — Inventário detalhado e classificação

Output a produzir: ficheiro `scripts/audit-secdef-inventory.txt` com 4 tabelas (uma por categoria). Cada linha tem `function(args) → return | callers | guard interno | recomendação`.

### Categoria A — Necessária e segura (manter `EXECUTE` para `authenticated`)

Wrappers usados em policies RLS ou auto-protegidos por filtragem por `auth.uid()`:

```
current_company_id()
is_platform_admin(_user_id)
has_role(_user_id, _role)
has_permission(_user_id, _permission)
get_user_role(_user_id)
has_partner_access(_user_id, _event_id)
row_belongs_to_current_company(_row_company_id)
storage_path_belongs_to_current_company(_name)
bp_version_linked_tx_count(_event_id)        -- só lê, filtra por event_id
list_bp_versions(_event_id)                  -- só lê
formalidade_audit_stats(_event_ids)          -- agregados read-only
suggest_formalidade(_forecast_id)            -- read-only
list_orphan_transactions_for_event(_event_id)-- read-only
find_admin_absorbing_events(p_date, p_company_id) -- read-only
```

Acção: **manter GRANT para `authenticated`**, apenas confirmar que cada uma tem `SET search_path = public, pg_temp` (já tem) e que filtra por `current_company_id()` quando devolve dados de tabelas multi-tenant. Para `list_orphan_transactions_for_event`, `find_admin_absorbing_events`, `formalidade_audit_stats`, `bp_version_linked_tx_count`, `list_bp_versions`, `suggest_formalidade`: validar manualmente que aplicam o filtro de tenant (parecem fazê-lo via `event_id` mas é preciso confirmar caso a caso).

### Categoria B — Restringir GRANT (revoke de `anon`/`authenticated`)

#### B.1 — Funções de trigger (14): só o engine de triggers as deve invocar

```
auto_create_initial_bp_version
auto_create_retroactive_split_snapshots
handle_new_user
log_formalidade_change
log_table_change
prevent_split_absorbs_admin
reimbursement_propagate_payment
reimbursement_revert_on_tx_delete
set_company_id_on_insert
set_event_ab_company_id
snapshot_bp_versions_to_trash
tg_sponsorship_pipeline_autolog
validate_category_allocate_flag
validate_event_admin_absorption
audit_generic_changes        -- listada como não-trigger, mas é trigger fn (RETURNS trigger)
set_combo_pass_company_id
set_combo_pass_child_company_id
```

Patch:
```sql
REVOKE EXECUTE ON FUNCTION public.<fn>() FROM PUBLIC, anon, authenticated;
```

(Triggers continuam a disparar; o GRANT só limita chamadas diretas via RPC, que não fazem sentido.)

#### B.2 — Cron/edge-function-only (chamadas com service-role key)

```
cleanup_old_backups()                        -- cron monthly
test_latest_backup()                         -- cron monthly
run_rls_legacy_audit_cron()                  -- cron diário
audit_multi_tenant_isolation()               -- ferramenta admin (chamada por edge fn)
recalculate_pax_benchmarks(_company_id)      -- batch admin
restore_bp_versions_from_trash(_trash_id)    -- admin
relink_orphan_transactions(_event_id, ...)   -- admin
reconcile_bp_overrides_for_event(...)        -- chamada por outras fns DB
_revert_event_to_version(...)                -- interno (prefixo "_")
apply_formalidade_suggestions(_ids, _state)  -- versão antiga, _map é a usada pelo cliente
mark_forecasts_fechado_auto(_ids)            -- chamada por edge close-camarim-session
set_formalidade_auto_suggested(_value)       -- helper interno (session local)
move_to_dlq(...)                             -- pgmq plumbing
read_email_batch(...)                        -- worker process-email-queue (service role)
delete_email(...)                            -- worker
enqueue_email(...)                           -- triggers + edge (service role)
```

Patch:
```sql
REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.<fn>(...) TO service_role;
```

> ⚠️ Antes de revogar `enqueue_email`/`read_email_batch`/`delete_email`/`move_to_dlq` confirmar com `pg_trigger` e `cron.job` que nenhuma é chamada como `authenticated`. Se o trigger BEFORE INSERT em `email_send_log` correr no contexto do utilizador, a função tem de continuar callable por authenticated (ou ser elevada para SECURITY DEFINER pura sem GRANT, basta que a trigger a invoque).

#### B.3 — RPCs de admin/platform_admin (UI de Admin Panel)

Têm guard interno via `has_role`/`is_platform_admin`. Estão OK serem callable por `authenticated` (o guard rejeita), mas o ideal é revogar de `anon`:

```
run_rls_legacy_audit(_triggered_by, _triggered_by_user)
set_active_company(target_company_id)
restore_bp_versions_from_trash(_trash_id)        -- já em B.2
analyze_formalidade_bulk(_event_ids)
apply_formalidade_suggestions_map(_payload)
```

Patch:
```sql
REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM anon;   -- mantém em authenticated
```

### Categoria C — Pode virar `SECURITY INVOKER`

Funções que só leem dados que o caller já vê via RLS (não precisam de elevação):

```
bp_version_linked_tx_count(_event_id)
list_bp_versions(_event_id)
formalidade_audit_stats(_event_ids)
list_orphan_transactions_for_event(_event_id)
find_admin_absorbing_events(p_date, p_company_id)
suggest_formalidade(_forecast_id)
```

Patch (CREATE OR REPLACE com `SECURITY INVOKER`). Risco: se alguma dessas funções faz JOIN em tabelas com RLS mais restrita (ex. `event_forecasts` filtrado por partner), pode passar a devolver menos linhas. Deve ser validado caso-a-caso antes de migrar.

### Categoria D — Suspeitas / a investigar manualmente

```
1. promote_scenario_to_active(...)            -- 6 args, cascade Master→Splits, sensível
2. promote_scenario_draft_to_active(...)      -- variante mais antiga, ainda usada?
3. revert_to_bp_version(_version_id, _force, ...) -- destrutivo
4. _revert_event_to_version(...)              -- interno mas DELETE em event_forecasts
5. merge_forecasts_into_active_snapshot(...)
6. relink_orphan_transactions(...)            -- modifica chaves
7. consume_recovery_code(_code_hash)          -- segurança MFA, validar one-shot
8. validate_trusted_device(_token_hash)       -- segurança MFA
9. recalculate_pax_benchmarks(_company_id)    -- valida que filtra _company_id == current
10. apply_formalidade_suggestions_map(_payload)-- valida ownership de cada forecast_id
11. archive_bp_version / unarchive_bp_version / discard_bp_version_draft / discard_scenario_draft / create_bp_snapshot / create_scenario_draft -- todas mutativas: confirmar guard de tenant + role
```

Acção Fase 1: para cada uma, ler `pg_get_functiondef`, anotar:
- (a) tem `SET search_path` ✅?
- (b) verifica `current_company_id() = X.company_id`?
- (c) verifica `has_role(auth.uid(), ...)`?
- (d) é idempotente / tem proteção contra replay?

Output: tabela em markdown no inventário, uma linha por função.

---

## Fase 2 — Plano de patches por lotes

Cada lote = 1 ficheiro `.txt` em `scripts/secdef-hardening/` para correr em **Test → Live**, na ordem:

```text
secdef-hardening/
  01-triggers-revoke.txt          (Cat. B.1, ~17 fns, baixo risco)
  02-cron-edge-revoke.txt         (Cat. B.2, ~16 fns, médio risco)
  03-admin-rpc-tighten.txt        (Cat. B.3, ~5 fns, baixo risco)
  04-secinv-readonly.txt          (Cat. C, ~6 fns, médio — testar UI)
  05-cat-d-fixes/                 (uma migration por função, alto risco)
    01-promote-scenario-to-active.txt
    02-revert-to-bp-version.txt
    03-_revert-event-to-version.txt
    ...
```

Template de lote (B.1 exemplo):
```sql
BEGIN;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_table_change()                   FROM PUBLIC, anon, authenticated;
-- ... (uma por linha)

-- Verificação: nenhuma das fns abaixo deve ter EXECUTE para anon/authenticated
SELECT r.routine_name, g.grantee
FROM information_schema.role_routine_grants g
JOIN information_schema.routines r USING (specific_name)
WHERE r.specific_schema='public'
  AND r.routine_name IN ('handle_new_user','log_table_change', /* ... */)
  AND g.grantee IN ('anon','authenticated');
-- Esperado: 0 linhas

COMMIT;
```

Para Cat. C (SECURITY INVOKER), template:
```sql
CREATE OR REPLACE FUNCTION public.list_bp_versions(_event_id uuid)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY INVOKER         -- ← era DEFINER
STABLE
SET search_path = public, pg_temp
AS $$ ... corpo idêntico ... $$;
```

---

## Fase 3 — Verificação e regressão

### 3.1 — Snapshot pré-mudança (correr antes de cada lote, em Test e Live)

```sql
-- Snapshot de grants atuais
SELECT r.routine_name,
       string_agg(DISTINCT g.grantee, ',' ORDER BY g.grantee) AS grantees
FROM information_schema.routines r
LEFT JOIN information_schema.role_routine_grants g
  ON g.specific_name = r.specific_name AND g.privilege_type='EXECUTE'
WHERE r.specific_schema='public'
  AND r.security_type='DEFINER'
GROUP BY r.routine_name
ORDER BY r.routine_name;
```
Guardar em `/mnt/documents/secdef-grants-pre-<batch>.tsv`.

### 3.2 — Testes funcionais por lote

| Lote | Como verificar |
|---|---|
| B.1 (triggers) | INSERT/UPDATE/DELETE em cada tabela alvo continua a disparar trigger (criar 1 linha de teste em cada uma). |
| B.2 (cron/edge) | Disparar manualmente cada cron (`select cron.schedule_in_database` ou edge fn `--invoke`) e ver logs. |
| B.3 (admin RPC) | Logar como user **viewer** → cada RPC deve devolver 403/permission denied. Logar como **admin** → 200. |
| C (SECURITY INVOKER) | Comparar contagem de linhas antes/depois para o mesmo user (admin e viewer). Diferenças = RLS está a esconder; reverter se inesperado. |
| D (caso a caso) | Rodar cenários canónicos do `mem://features/canonical-test-scenarios` — promoção de cenário, reversão de BP, MFA. |

### 3.3 — Re-correr o linter

```bash
# Após cada lote
supabase--linter --environment production
# Esperado: contagem de SUPA_0028/SUPA_0029 desce monotonicamente
```

### 3.4 — Smoke test do app em Test

Checklist mínimo (manual, ~10 min):
1. Login como user normal → carrega Dashboard sem erros.
2. Abrir Eventos → clicar num evento → BP carrega.
3. Criar transação → aparece em "Pendente".
4. Pagamento → liquidar → status passa a "Pago".
5. Admin Panel → Backups → lista carrega.
6. /admin/auditoria-rls → run manual funciona.
7. MFA flow (recovery code + trusted device) ainda funciona.

### 3.5 — Critério de rollback

Se qualquer query SQL ou ação de UI falhar com `permission denied for function ...` num role esperado:
```sql
GRANT EXECUTE ON FUNCTION public.<fn>(...) TO authenticated;
```
e voltar a classificar a função.

---

## Restrições respeitadas

- ✅ Wrappers de RLS (`current_company_id`, `has_role`, etc.) ficam callable por `authenticated`.
- ✅ Triggers internas continuam a disparar (revogar EXECUTE não afeta triggers).
- ✅ Funções de Auth (`handle_new_user` é trigger; não há outras tocadas pelo Supabase Auth nas listadas).
- ✅ Sem nenhuma alteração feita nesta volta — só inventário read-only.

---

## Próximo passo após aprovação

Implementar **Fase 1 completa** primeiro (gerar `scripts/audit-secdef-inventory.txt` com a tabela final A/B/C/D revista função-a-função, lendo cada `pg_get_functiondef`). Só depois desse output é que se decidem os patches concretos da Fase 2 — algumas reclassificações são esperadas (especialmente entre C e D).
