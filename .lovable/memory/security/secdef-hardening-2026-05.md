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

## Cat. C — concluída (2026-05-09)

5 funções read-only confirmadas `SECURITY INVOKER` em Test e Live (`prosecdef=false` via `pg_get_functiondef`):

| Função | Caller | Mudança visível |
|---|---|---|
| `bp_version_linked_tx_count(uuid)` | `useBPVersions.ts` | nenhuma (RLS event_forecasts cobre) |
| `list_bp_versions(uuid)` | UI BP + Portal Sócio | partner agora respeita policy "Staff sees all, partners only active" — alinhado com `bp-versions-partner-portal` |
| `list_orphan_transactions_for_event(uuid)` | UI admin/manager | nenhuma |
| `find_admin_absorbing_events(date,uuid)` | só `service_role` (cron) | no-op (service_role bypassa RLS) |
| `suggest_formalidade(uuid)` | UI staff | nenhuma |

Script renomeado para `scripts/secdef-hardening/02-cat-C-security-invoker.APPLIED.txt`. Plano com análise role-a-role + smoke matrix em `.lovable/plan.md`.

Smoke matrix mínima pós-publish (4 cenários):
1. admin em `/eventos/<X>/bp` → vê todas versões (idêntico a antes).
2. partner no Portal → vê só versão `active` do seu evento.
3. partner tenta evento alheio → 0 linhas.
4. admin abre "Reconciliar transações órfãs" → lista igual a antes.

## Fase 2 — fechada

A: 9 intactas · B.1+B.2+B.3: 38 endurecidas · C: 5 INVOKER · D: 11 com guards no body · Total 63/63 auditadas, 0 pendentes.



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
