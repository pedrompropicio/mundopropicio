# Fase 2 — Categoria C: análise role-a-role e plano de Live

## ⚠️ Estado atual descoberto antes de planear

Antes de escrever este plano, fiz `pg_get_functiondef` direto a Test **e** a Live (production). Resultado:

| Função | `prosecdef` Test | `prosecdef` Live |
|---|---|---|
| `bp_version_linked_tx_count(uuid)` | `false` (INVOKER) | `false` (INVOKER) |
| `list_bp_versions(uuid)` | `false` (INVOKER) | `false` (INVOKER) |
| `list_orphan_transactions_for_event(uuid)` | `false` (INVOKER) | `false` (INVOKER) |
| `find_admin_absorbing_events(date, uuid)` | `false` (INVOKER) | `false` (INVOKER) |
| `suggest_formalidade(uuid)` | `false` (INVOKER) | `false` (INVOKER) |

A migration aplicada na volta anterior fez ALTER em Test; o estado idêntico em Live indica que estas 5 já estavam INVOKER em Live (quer porque alguém aplicou o script `02-cat-C-security-invoker.txt` previamente, quer porque o inventário Fase 1 estava desatualizado — mesma classe de erro descoberta na Cat. D). **Não há ALTER FUNCTION para escrever.**

> **Recomendação principal:** marcar Cat. C como concluída em Test+Live e usar este plano como **registo de validação role-a-role** + **smoke tests pós-publicação** (defesa em profundidade — confirmar que a mudança não regrediu nenhum fluxo).

---

## Patches RLS relevantes (todas as 4 tabelas)

```text
bp_versions
  PERMISSIVE  "Authenticated users can view bp_versions"   USING (auth.uid() IS NOT NULL)   ← LEGACY ✱
  PERMISSIVE  "Staff sees all, partners only active"
              USING ( admin|manager|editor|viewer  OR
                      (partner AND state='active' AND event ∈ event_partners do user) )
  RESTRICTIVE company_isolation_bp_versions   USING (company_id = current_company_id())

event_forecasts
  PERMISSIVE  "Event forecasts viewable by authenticated"  USING (auth.uid() IS NOT NULL)   ← LEGACY ✱
  PERMISSIVE  "Staff can manage scenario forecasts"        (write-only relevância)
  RESTRICTIVE company_isolation_event_forecasts            USING (company_id = current_company_id())

transactions
  PERMISSIVE  "Transactions are viewable by authenticated" USING (auth.uid() IS NOT NULL)   ← LEGACY ✱
  RESTRICTIVE company_isolation_transactions               USING (company_id = current_company_id())

events
  PERMISSIVE  "Events are viewable by authenticated users" USING (auth.uid() IS NOT NULL)   ← LEGACY ✱
  RESTRICTIVE company_isolation_events                     USING (company_id = current_company_id())
```

✱ Estas policies "auth.uid() IS NOT NULL" sobreviveram à limpeza `multi-tenant-leaky-policies-fix` porque a memória diz que foram retiradas as **54 mais permissivas** — estas 4 ficaram porque já são limitadas pela RESTRICTIVE de `company_id`. Confirma o gatilho 2 da quarentena Fase 8 (RLS=0 no audit cron) está a olhar exatamente para isto.

---

## Análise por função

### 1. `bp_version_linked_tx_count(_event_id uuid)`
- **Tabelas**: `event_forecasts`
- **Caller no código**: `useBPVersions.ts` (UI BP Versions)
- **Comportamento DEFINER vs INVOKER**: RLS de `event_forecasts` para qualquer authenticated devolve linhas do tenant. INVOKER agora respeita company_isolation. **Sem mudança funcional** para staff/partner do mesmo tenant.
- **Risco cross-tenant**: zero — filtro `company_id` da RESTRICTIVE protege.
- **Decisão:** ✅ migrar (já migrado).

### 2. `list_bp_versions(_event_id uuid)`
- **Tabelas**: `bp_versions`
- **Caller**: `useBPVersions.ts` em `/eventos/[id]/bp` e Portal do Sócio
- **DEFINER (antes):** retornava **todas** as versões, ignorando a policy "Staff sees all, partners only active".
- **INVOKER (agora):**
  - admin/manager/editor/viewer/platform_admin: vê tudo (ramo "Staff sees all" da OR) — **idêntico**.
  - partner: passa a ver só `state='active'` dos eventos onde `event_partners → suppliers.email = profiles.email` — **mais restrito**.
- **Esperado pelo produto?** ✅ sim. A memória `bp-versions-partner-portal` é explícita: *"Sócio vê só label discreto 'Business Plan — versão vX (data)' no topo da aba BP, sem dropdown nem comparação"* e `bp-versions-rls-and-trash`: *"Partner só lê versão ativa dos seus eventos"*. INVOKER alinha o servidor com o que a UI já assumia.
- **Risco residual:** se algum partner tinha hoje (via DEFINER) uma versão `archived`/`scenario` listada por engano e havia código UI que dependia disso, partiria. **Não há tal código** — `PartnerPortal.tsx` ignora versões não-active. ✅
- **Decisão:** ✅ migrar (já migrado). Esta é a mais valiosa do lote.

### 3. `list_orphan_transactions_for_event(_event_id uuid)`
- **Tabelas**: `transactions`, `event_forecasts`
- **Caller**: UI admin/manager (página BP override / reconciliação)
- **DEFINER vs INVOKER**: ambas as tabelas usam policy permissiva auth + RESTRICTIVE tenant. Para qualquer staff do mesmo tenant: **idêntico**.
- **Partner:** a UI que chama esta função não está exposta ao Portal do Sócio; mesmo que chamasse, partner vê transações via outras policies — fora do escopo.
- **Decisão:** ✅ migrar (já migrado).

### 4. `find_admin_absorbing_events(p_date, p_company_id)`
- **Tabelas**: `events`
- **Caller no código**: nenhum (B.2 já revogou EXECUTE de anon/authenticated; só `service_role` chama, via cron `apply-admin-absorption`).
- **DEFINER vs INVOKER**: `service_role` bypassa RLS independentemente. **No-op funcional total.**
- **Decisão:** ⚠️ migrar mesmo assim por uniformidade — sem benefício mas sem custo. Marcar como **candidata a DROP** numa próxima volta de limpeza (sem caller no frontend; se `apply-admin-absorption` deixar de existir, função fica órfã).

### 5. `suggest_formalidade(_forecast_id uuid)`
- **Tabelas**: `event_forecasts`, `transactions`
- **Caller**: UI BP popover de formalidade + RPC `analyze_formalidade_bulk` (que é DEFINER e itera).
- **DEFINER vs INVOKER**: para staff do tenant, idêntico. Partner não tem acesso à UI que chama.
- **Atenção:** quando chamada **dentro** de `analyze_formalidade_bulk` (que é DEFINER), corre como INVOKER do owner — comportamento standard PG. Não causa loop nem perda de privilégios.
- **Decisão:** ✅ migrar (já migrado).

---

## Validação por role (smoke matrix pós-Live)

Seguindo `mem://features/pre-post-publish-checklist` e cenários de `mem://features/canonical-test-scenarios`.

| Role / cenário | Página | Esperado |
|---|---|---|
| `admin` | `/eventos/<Coala 2026>/bp` aba "Histórico de versões" | Lista todas as versões + count de TX vinculadas igual ao mostrado antes |
| `manager` | mesma | igual a admin |
| `editor` | mesma | igual a admin |
| `viewer` | mesma | igual a admin (read-only UI) |
| `partner` | Portal do Sócio do mesmo evento | Label "Business Plan — versão vX (data)" mostra só versão active; **não** mostra cenários nem archived |
| `partner` | qualquer evento de **outro** sócio | 0 versões devolvidas (não deve ver) |
| `admin` (TenantA) | tenta passar `_event_id` de TenantB via DevTools | 0 linhas (RESTRICTIVE company_isolation) |
| `admin` | `/eventos/<X>/bp` botão "Reconciliar transações órfãs" | Lista de candidatas igual à de antes |
| `admin` | `/eventos/<X>/bp` popover 🕐 numa linha | Sugestão de formalidade aparece |
| cron `apply-admin-absorption` | corrida diária | logs sem erro; eventos absorventes encontrados |

**Checklist mínimo**: 4 das 9 linhas acima (admin BP versions, partner BP versions próprio, partner BP versions de outro, admin órfãs) — as restantes são opcionais.

---

## Plano agregado

### Ficheiros
- `scripts/secdef-hardening/02-cat-C-security-invoker.APPLIED.txt` (já renomeado na volta anterior). **Nada novo a escrever.**
- Atualizar `scripts/audit-secdef-inventory.md` com nota: *"Cat. C confirmada INVOKER em Test+Live em 2026-05-09; smoke role-matrix concluído."*
- Atualizar memória `mem://security/secdef-hardening-2026-05` (já feita; juntar resultado da matriz após smoke).

### Ordem recomendada (caso, no futuro, alguém precise de re-aplicar do zero)
1. `bp_version_linked_tx_count` — read trivial, sem partner exposure
2. `find_admin_absorbing_events` — sem caller real, no-op
3. `list_orphan_transactions_for_event` — caller só admin/manager
4. `suggest_formalidade` — caller staff, idempotente
5. `list_bp_versions` — **última** porque é a única com mudança real visível (partner vê menos)

### Rollback
Já não é necessário (estado em Live = estado pretendido). Se for preciso reverter por incidente, snippet pronto:

```sql
BEGIN;
ALTER FUNCTION public.bp_version_linked_tx_count(uuid)                       SECURITY DEFINER;
ALTER FUNCTION public.list_bp_versions(uuid)                                 SECURITY DEFINER;
ALTER FUNCTION public.list_orphan_transactions_for_event(uuid)               SECURITY DEFINER;
ALTER FUNCTION public.find_admin_absorbing_events(date, uuid)                SECURITY DEFINER;
ALTER FUNCTION public.suggest_formalidade(uuid)                              SECURITY DEFINER;
COMMIT;
```

### Encerramento da Fase 2
Após a smoke matrix passar em Live (post-publish), a Fase 2 (SECDEF hardening) fica **integralmente fechada**:
- A: 9 intactas
- B.1+B.2+B.3: 38 endurecidas via REVOKE/GRANT
- C: 5 INVOKER (esta entrega)
- D: 11 já tinham guards no body
- Total: 63 funções auditadas, 0 pendentes.

Próximas frentes possíveis (fora desta fase):
- Normalizar `merge_forecasts_into_active_snapshot` para usar `has_role()` (cosmético, identificado em Cat. D).
- Avaliar DROP de `find_admin_absorbing_events` se cron `apply-admin-absorption` for descontinuado.
- Auditoria às ~110 outras funções `SECURITY DEFINER` ainda flagadas pelo linter SUPA_0028/0029 (escopo separado).
