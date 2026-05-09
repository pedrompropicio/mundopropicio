
# Fase 2 — Categoria D: relatório e plano (NÃO executar)

## ⚠️ Descoberta crítica vs. inventário

Antes de planear os 11 patches, fiz `pg_get_functiondef` direto em **Live** das 11 funções + os 2 wrappers internos. Resultado vs. o que o inventário (`scripts/audit-secdef-inventory.md`) afirmava:

| Função | Inventário dizia | Live realmente tem |
|---|---|---|
| `promote_scenario_to_active` | sem guards | ✅ role + tenant + platform_admin |
| `relink_orphan_transactions` | sem guards | ✅ role + tenant + platform_admin |
| `merge_forecasts_into_active_snapshot` | só `auth.uid()` | ✅ role (via EXISTS user_roles) + tenant + platform_admin |
| `revert_to_bp_version` | sem guards | ✅ role + tenant + platform_admin |
| `create_bp_snapshot` | sem guards | ✅ role + tenant + platform_admin |
| `archive_bp_version` | sem guards | ✅ role + tenant + platform_admin |
| `unarchive_bp_version` | sem guards | ✅ role + tenant + platform_admin |
| `discard_bp_version_draft` | sem guards | ✅ role + tenant + platform_admin |
| `recalculate_pax_benchmarks` | só role | ✅ role + tenant (param `_company_id` validado) + platform_admin |
| `restore_bp_versions_from_trash` | só role | ✅ role + tenant + platform_admin |
| `mark_forecasts_fechado_auto` | sem guards | ✅ role + tenant + platform_admin |

**Conclusão:** o inventário reflectia o estado *anterior* à corrida B.1+B.2+B.3 — ou foi escrito antes das migrations recentes do projecto que já tinham endurecido o body destas funções (memórias `bp-versions-rls-and-trash`, `bp-versions-scenarios`, `formalidade-bulk-audit`, `multi-tenant-leaky-policies-fix` apontam todas para isso). O smoke-test SQL read-only da volta anterior já tinha confirmado isto (11/11 com guards) — esta é a mesma evidência, agora com inspeção directa do `pg_get_functiondef`.

> **Não há patches Cat. D para aplicar.** O risco residual é zero ou cosmético.

## Padrão observado (igual nas 11)

```sql
-- 1. Role guard (variantes: admin|manager, ou admin|manager|editor)
IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
        OR is_platform_admin(auth.uid())) THEN
  RAISE EXCEPTION 'Permissão negada: ...';
END IF;

-- 2. Tenant lookup (varia por função: events, bp_versions→events, ou param directo)
SELECT company_id INTO v_company FROM <tabela> WHERE id = <param>;
IF v_company IS NULL THEN RAISE EXCEPTION '... not found'; END IF;

-- 3. Tenant guard com bypass platform_admin
IF NOT is_platform_admin(auth.uid()) AND v_company <> current_company_id() THEN
  RAISE EXCEPTION 'Permissão negada: ... outra empresa.';
END IF;
```

Mapa de fontes da `company_id`:
- `events.company_id`: `create_bp_snapshot`, `merge_forecasts_into_active_snapshot`
- `bp_versions → events.company_id`: `archive`, `unarchive`, `discard_bp_version_draft`, `revert_to_bp_version`, `promote_scenario_to_active`
- `event_forecasts → events.company_id`: `mark_forecasts_fechado_auto`, `relink_orphan_transactions`
- `param `_company_id` validado: `recalculate_pax_benchmarks`
- `bp_versions_trash → events.company_id`: `restore_bp_versions_from_trash`

## Item residual (1) — só normalização cosmética

`merge_forecasts_into_active_snapshot` usa `SELECT EXISTS (... FROM user_roles WHERE role IN ('admin','manager','editor'))` em vez de `has_role()`. Funcionalmente idêntico (e até evita 3 chamadas separadas), mas:
- Foge do padrão do resto do projecto.
- Faz a regex de auditoria (`has_role\(auth\.uid`) devolver falso negativo — foi exactamente o que enganou o inventário desta volta.

**Proposta:** trocar para `has_role(...) OR has_role(...) OR has_role(...) OR is_platform_admin(...)` para uniformidade. Sem alteração funcional. **Opcional**, baixa prioridade. Pode ficar para uma "volta de limpeza" futura.

## Itens reais ainda pendentes — wrappers internos

Os 2 wrappers DB-internal **continuam sem guards no body** (esperado — são chamados via `PERFORM` pelas funções já protegidas):

| Função | Guards no body | Estratégia Fase 2 já aplicada |
|---|---|---|
| `_revert_event_to_version` | ❌ nenhum | `REVOKE FROM PUBLIC, anon, authenticated` + `GRANT TO service_role` (lote B.2) ✅ |
| `reconcile_bp_overrides_for_event` | ❌ nenhum | idem ✅ |

A volta anterior já confirmou via `pg_roles` que não estão acessíveis a `anon`/`authenticated`. **Nada a fazer.**

## Plano final desta volta

### A — recomendado: encerrar Fase 2 / Cat. D sem patches

1. Marcar Cat. D como **concluído** (já foi, na verdade, em volta anterior — confirmado por evidência fresca).
2. Atualizar `scripts/audit-secdef-inventory.md` com nota no topo: *"Cat. D já endurecida em migrations anteriores (data: pré-2026-05-09); auditoria 2026-05-09 confirmou 11/11 com role+tenant+platform_admin guards."*
3. Atualizar memória (provavelmente `mem://security/security-hardening-2026-05`) acrescentando linha sobre o fecho de Cat. D.
4. Próxima frente: olhar Cat. C (5 funções para `SECURITY INVOKER`) que ainda está pendente segundo `scripts/secdef-hardening/02-cat-C-security-invoker.txt`.

### B — opcional: 1 normalização cosmética

Se quiseres uniformidade de estilo, escrever **1** ficheiro `scripts/secdef-hardening/05-cat-d-fixes/01-merge-forecasts-normalize-guard.txt` com:

```sql
BEGIN;
-- Pre-snapshot: guard usa SELECT EXISTS user_roles inline (funcional mas fora do padrão)
CREATE OR REPLACE FUNCTION public.merge_forecasts_into_active_snapshot(_event_id uuid, _forecast_ids uuid[])
RETURNS TABLE(merged_into_master integer, merged_into_splits integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  -- ... (mesmas vars, sem _role_ok)
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
          OR public.has_role(auth.uid(),'manager'::app_role)
          OR public.has_role(auth.uid(),'editor'::app_role)
          OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Permissão negada: só admin/manager/editor podem incorporar linhas no snapshot.';
  END IF;
  -- resto do body idêntico ao actual
END;
$$;
-- Verificação
SELECT (pg_get_functiondef('public.merge_forecasts_into_active_snapshot(uuid,uuid[])'::regprocedure) ~ 'has_role\(auth\.uid')
  AS guard_normalised;
COMMIT;
```

Smoke test: `SponsorsImportModal.tsx` → "Incorporar linhas no snapshot" num evento Master+Split, com user `editor`. Cenário canónico: `mem://features/bp-versions-test-checklist` (secção *Promoção com TX vinculadas*).

**Risco:** 0 (refactor puro de expressão booleana equivalente).

## Recomendação

Ir pela **opção A**. Cat. D já está fechada de facto; criar 11 ficheiros vazios ou idempotentes só adiciona ruído. Aplicar a normalização cosmética (B) só se quiseres alinhamento estilístico — não é segurança.

Confirmas que avanço com (A) — atualizar o inventário/memória e depois passar à Cat. C — ou queres também (B) na mesma entrega?
