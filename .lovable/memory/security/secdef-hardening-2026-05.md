---
name: SECDEF hardening 2026-05
description: Auditoria + endurecimento das ~63 funções SECURITY DEFINER em public — Cat. A intacta; B.1+B.2+B.3+C aplicadas; D já estava endurecida (Fase 2 concluída)
type: feature
---

## Sumário

Auditoria completa em 2026-05-09 das 63 funções `SECURITY DEFINER` no schema `public` (inventário em `scripts/audit-secdef-inventory.md`). Categorias e estado:

| Cat. | Nº | Estratégia | Estado |
|---|---:|---|---|
| A | 9 | manter (`EXECUTE TO authenticated`, RLS wrappers) | ✅ intacta |
| B.1 | 17 | `REVOKE` total (triggers) | ✅ aplicada Live |
| B.2 | 15 | `REVOKE` total + `GRANT TO service_role` (cron/edge) | ✅ aplicada Live |
| B.3 | 6 | `REVOKE FROM anon` (admin RPC) | ✅ aplicada Live |
| C | 5 | passar a `SECURITY INVOKER` (read-only) | ✅ aplicada 2026-05-09 (`02-cat-C-security-invoker.APPLIED.txt`) |
| D | 11 | adicionar role+tenant guards no body | ✅ **já estavam endurecidas** (descoberta pós-B.3) |

## Cat. D — descoberta importante

Inventário inicial dizia que 11 funções faltavam guards. Auditoria fresca via `pg_get_functiondef` (2026-05-09) mostrou que **todas as 11 já têm role + tenant + platform_admin guards no body**, vindas de migrations anteriores (`bp-versions-rls-and-trash`, `bp-versions-scenarios`, `formalidade-bulk-audit`, `multi-tenant-leaky-policies-fix`).

`merge_forecasts_into_active_snapshot` deu falso negativo na regex porque usa `EXISTS user_roles` inline em vez de `has_role()` — funcionalmente equivalente (admin/manager/editor + tenant + platform_admin bypass).

**Não há patches Cat. D para escrever.** Os 2 wrappers DB-internal (`_revert_event_to_version`, `reconcile_bp_overrides_for_event`) continuam sem guards no body mas já estão protegidos pelo `REVOKE … FROM anon, authenticated` da B.2.

## Cat. C — próxima frente

5 funções read-only candidatas a `SECURITY INVOKER`:
- `bp_version_linked_tx_count`
- `list_bp_versions` (validar Portal do Sócio)
- `list_orphan_transactions_for_event`
- `find_admin_absorbing_events`
- `suggest_formalidade`

Script preparado em `scripts/secdef-hardening/02-cat-C-security-invoker.txt`.

## Como verificar Cat. D em Live

```sql
SELECT p.proname,
  (pg_get_functiondef(p.oid) ~* '(has_role\(auth\.uid|EXISTS \(.+user_roles)') AS role_guard,
  (pg_get_functiondef(p.oid) ~* 'current_company_id') AS tenant_guard,
  (pg_get_functiondef(p.oid) ~* 'is_platform_admin') AS pa_guard
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'promote_scenario_to_active','relink_orphan_transactions','merge_forecasts_into_active_snapshot',
  'revert_to_bp_version','create_bp_snapshot','archive_bp_version','unarchive_bp_version',
  'discard_bp_version_draft','recalculate_pax_benchmarks','restore_bp_versions_from_trash',
  'mark_forecasts_fechado_auto')
ORDER BY p.proname;
-- esperado: 11 linhas com 3 colunas TRUE
```

## Limpeza opcional (volta futura)

Normalizar `merge_forecasts_into_active_snapshot` para usar `has_role()` em vez de `EXISTS user_roles` — risco 0, só cosmético, evita falsos negativos em auditorias regex futuras.
