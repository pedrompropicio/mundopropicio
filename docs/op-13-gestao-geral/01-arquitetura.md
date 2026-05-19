# 01 — Arquitectura técnica

Desenho das 3 listas cross-evento (Zonas, Etapas, Chamados) + drill-down do Dashboard + sidebar reorganizada. Decisões fundamentais explicadas com referência a padrões existentes da base.

---

## 1. Modelo de dados consolidado

### 1.1 Lista Zonas — `/operacao/zonas`

**Tabela base:** `operacao_frentes`.

**JOINs / embeds PostgREST necessários:**

```ts
supabase
  .from("operacao_frentes")
  .select(`
    id, name, type, status, color, display_order,
    event:events!operacao_frentes_event_id_fkey(id, name, date, location, status),
    lead:profiles!operacao_frentes_current_lead_id_fkey(id, full_name, phone)
  `)
  .eq("event_id", filters.event)              // se 1 evento
  .in("event_id", scopedEventIds)             // se cross-evento (admin/director)
  .in("type", ["zone","service"].filter(...)) // filtro tipo
  .neq("status", "cancelled")
  .order("display_order");
```

**Counts agregados (queries secundárias):**

```ts
// Por frente: count(etapas), count(chamados abertos)
supabase.from("operacao_etapas")
  .select("frente_id, status", { count: "exact", head: true })
  .in("frente_id", frenteIds);
// → agrupar client-side: total / done / in_progress / blocked

supabase.from("operacao_registros")
  .select("frente_id, status", { count: "exact", head: true })
  .eq("kind", "chamado")
  .in("status", ["open","in_progress"])
  .in("frente_id", frenteIds);
```

> **NOTA:** `count: "exact"` é o padrão Supabase para agregados. Alternativa mais rápida (cross-evento com 100+ frentes) seria criar uma view SQL `operacao_frentes_summary` (não recomendado para Fase 1 — complexidade adicional).

**Ambiguidade de FK:** `operacao_frentes.current_lead_id → profiles.id` é simples, não ambíguo. Sem disambig necessária.

### 1.2 Lista Etapas — `/operacao/etapas` (prioridade máxima)

**Tabela base:** `operacao_etapas`.

**JOINs / embeds (com disambiguation obrigatória):**

```ts
supabase
  .from("operacao_etapas")
  .select(`
    id, name, status, escopo,
    planned_start, planned_end, actual_start, actual_end, has_no_date,
    frente:operacao_frentes!operacao_etapas_frente_id_fkey(id, name, color, type, event_id),
    zone:operacao_frentes!operacao_etapas_zone_id_fkey(id, name),
    responsible:profiles!operacao_etapas_responsible_profile_id_fkey(id, full_name),
    supplier:suppliers!operacao_etapas_supplier_id_fkey(id, name)
  `)
  .in("frente_id", scopedFrenteIds)
  .order("planned_start", { ascending: true, nullsFirst: false });
```

**Fluxo de scoping:**
1. Determinar `scopedEventIds` consoante o caller (ver §3.1).
2. Query 1: `operacao_frentes WHERE event_id IN (scopedEventIds) AND status != 'cancelled'` → `scopedFrenteIds`.
3. Query 2: `operacao_etapas WHERE frente_id IN (scopedFrenteIds)` com os filtros aplicados.

**Filtros suportados** (descritos na Tabela §4):

- `event` (single — herda de OperacaoFiltersBar)
- `frentes[]` (multi — chips)
- `status[]` (multi — chips badge)
- `responsibility` (3 opções: `meus` / `sem_responsavel` / `todos`) — opcional, propor para v1
- `period` (planned dates within range — `today` / `7d` / `30d` / `all` / custom) — opcional
- `sort_by` (`planned_start` | `planned_end` | `name` | `status`) + `sort_dir` (`asc` | `desc`)
- `q` (text search no nome — opcional v1)

**Embed `operacao_etapa_assignees` (M:N)** — adicionar como query secundária se UI precisa de mostrar avatars:

```ts
supabase.from("operacao_etapa_assignees")
  .select("etapa_id, profile_id, role, profile:profiles(id, full_name)")
  .in("etapa_id", etapaIds);
```

Indexar client-side por `etapa_id` → array de `{role, profile}`.

### 1.3 Lista Chamados — `/operacao/chamados` (cross-evento)

**Tabela base:** `operacao_registros` com `kind = 'chamado'`.

**JOINs:**

```ts
supabase
  .from("operacao_registros")
  .select(`
    id, text, priority, status,
    sla_due_at, escalation_level, acked_at, resolved_at, created_at,
    frente:operacao_frentes!operacao_registros_frente_id_fkey(id, name, color, event_id),
    etapa:operacao_etapas!operacao_registros_etapa_id_fkey(id, name),
    author:profiles!operacao_registros_author_profile_id_fkey(id, full_name)
  `)
  .eq("kind", "chamado")
  .in("frente_id", scopedFrenteIds)
  .order("created_at", { ascending: false });
```

**Filtros:**
- `event`, `frentes[]` (idem listas anteriores)
- `status[]` — `open` / `in_progress` / `resolved` / `closed`
- `priority[]` — `crit` / `high` / `med` / `low`
- `breaches` — booleano: `escalation_level >= 2`
- `period` — janela em `created_at`
- `sort_by` — `sla_due_at` | `created_at` | `priority` (custom order)

**Ambiguidades:** `operacao_registros.frente_id` e `operacao_registros.etapa_id` ambos são FKs únicos (não há duas para mesma tabela), mas os embeds devem ser disambiguated por nome de constraint para evitar conflitos com outros embeds da mesma row.

> **NOTA:** confirmar nomes exactos das FK constraints via Supabase. Se diferirem dos sugeridos acima, ajustar. Padrão habitual Supabase: `<tabela_filho>_<coluna>_fkey`.

---

## 2. Hook partilhado novo proposto

### 2.1 `useOperacaoListFilters({ scope })` — novo

Wrapper sobre `useOperacaoFilters` que adiciona filtros específicos por scope. Continua a usar URL search params como única fonte de verdade.

**API proposta:**

```ts
// src/hooks/useOperacaoListFilters.ts (novo)

type ListScope = "zonas" | "etapas" | "chamados";

type SortDir = "asc" | "desc";

export interface OperacaoListFilters {
  // herdados de useOperacaoFilters:
  event: string | null;
  frentes: string[];
  // específicos:
  status: string[];           // valores variam por scope
  priority?: string[];        // só chamados
  responsibility?: "meus" | "sem_responsavel" | "todos";  // só etapas (opt)
  breaches?: boolean;         // só chamados (opt)
  period?: "today" | "7d" | "30d" | "all";  // chamados/etapas (opt)
  q?: string;                 // text search (opt)
  sort_by?: string;
  sort_dir?: SortDir;
  page?: number;              // server-side pagination
}

export function useOperacaoListFilters(scope: ListScope) {
  // delega a useOperacaoFilters base + lê params extra do mesmo URL
  // retorna { filters, update, clear, toggle, page, setPage }
  // expõe defaults por scope (e.g. etapas sort_by='planned_start')
}
```

**Composição com `useOperacaoFilters`:** o novo hook **chama** o existente para herdar `event`, `frentes`, `status`, `kind` e adiciona leitura/escrita dos novos params no mesmo `useSearchParams`. Sem duplicação de state.

**Defaults sugeridos por scope:**

| Scope | Default sort_by | Default sort_dir | Default page size |
|---|---|---|---|
| zonas | `display_order` | `asc` | 50 |
| etapas | `planned_start` | `asc` (nulls last) | 50 |
| chamados | `created_at` | `desc` | 50 |

### 2.2 `useScopedEventIds()` — novo (resolve gap §5.5 do `00-auditoria.md`)

Precisamos de uma fonte de eventos que funcione para admin/director sem team. Hook leve:

```ts
// src/hooks/useScopedEventIds.ts (novo)

export function useScopedEventIds(): { eventIds: string[]; loading: boolean } {
  const { user, isAdmin, hasPermission } = useAuth();
  return useQuery({
    queryKey: ["op-scoped-events", user?.id, isAdmin],
    queryFn: async () => {
      if (isAdmin || hasPermission("manage_operacao_frentes")) {
        // admin/manager → todos os eventos da company
        const { data } = await supabase
          .from("events")
          .select("id")
          .neq("status", "cancelled");
        return (data ?? []).map((e) => e.id);
      }
      // user comum → eventos onde está em team OU é lead de frente
      const { data: teams } = await supabase
        .from("operacao_frente_team")
        .select("frente_id")
        .eq("profile_id", user.id).eq("active", true);
      const { data: leads } = await supabase
        .from("operacao_frentes")
        .select("id").eq("current_lead_id", user.id);
      const frenteIds = Array.from(new Set([
        ...(teams ?? []).map((t) => t.frente_id),
        ...(leads ?? []).map((f) => f.id),
      ]));
      if (frenteIds.length === 0) return [];
      const { data: fr } = await supabase
        .from("operacao_frentes")
        .select("event_id").in("id", frenteIds);
      return Array.from(new Set((fr ?? []).map((f) => f.event_id)));
    },
  });
}
```

**Usado por:**
- `OperacaoFiltersBar` (substituir source de eventos) — opcional refactor.
- Cada nova lista cross-evento (Zonas, Etapas, Chamados) — obrigatório.

> **NOTA:** este hook resolve o R1+R5 do `00-auditoria.md` para 95% dos casos. Edge case: se admin platform_admin com `is_platform_admin()=true` ainda for bloqueado por RLS em `operacao_etapas` (testar), precisamos de criar policy bypass nessa tabela. **TODO verificar após pg_policies query.**

---

## 3. Componente partilhado novo proposto

### 3.1 Decisão: separar layouts, abstrair shell

**Não criar** um `<OperacaoTable>` único. Justificação:
- **Zonas** quer layout grid de cards (cor visual da zona, lead avatar, count badges).
- **Etapas** quer linha mobile-first com data relativa + chevron (padrão `MontagemPhase`).
- **Chamados** quer linha com priority badge + SLA + autor + texto.

Forçar uma única tabela compromete legibilidade mobile (que é requisito).

**Criar sim** um `<OperacaoListShell>` que abstrai a *moldura* (header com filters, paginação footer, empty/loading states):

```tsx
// src/components/operacao/list/OperacaoListShell.tsx (novo)
<OperacaoListShell
  title="Etapas"
  subtitle="Lista cross-evento"
  scope="etapas"
  filtersBar={<EtapasFiltersBar />}
  refreshButton
  total={total}
  page={page}
  pageSize={50}
  onPageChange={setPage}
  isLoading={isLoading}
  isError={isError}
  isEmpty={items.length === 0}
  emptyMessage="Sem etapas para os filtros actuais."
>
  {items.map(...)}
</OperacaoListShell>
```

Mantém:
- Header sticky com title + total + refresh + filters slot.
- Empty state padrão (com CTA opcional via prop).
- Loading state com `<Skeleton>` (padrão a estabelecer — actualmente não há).
- Erro state com `<Alert>` + retry button.
- Footer pagination "Mostrar mais" infinito OU paginated.

### 3.2 Componentes de linha — um por scope

```
src/components/operacao/list/
├── OperacaoListShell.tsx       ← moldura partilhada
├── EtapaListRow.tsx             ← row de etapa (mobile card / desktop row)
├── ZonaCard.tsx                 ← card de zona (grid)
└── ChamadoListRow.tsx           ← row de chamado
```

Decisão: **não tentar abstrair Row** — divergem em 60-70%. Repetir a estrutura é melhor que abstracção opaca.

### 3.3 Filtros bar — também por scope (mas reutilizam base)

```
src/components/operacao/list/
├── EtapasFiltersBar.tsx         ← reusa OperacaoFiltersBar + adiciona responsibility filter
├── ZonasFiltersBar.tsx          ← reusa OperacaoFiltersBar + adiciona type filter
└── ChamadosFiltersBar.tsx       ← reusa OperacaoFiltersBar + adiciona priority + breaches
```

**Refactor opcional** de `OperacaoFiltersBar` para receber `scope` prop e adaptar quais badges mostra. Versão minimalista: criar wrappers.

---

## 4. Filtros e ordenação por scope (tabela exhaustiva)

| Scope | Filtros | Sort options | URL exemplo |
|---|---|---|---|
| **Zonas** | `event`, `type` (zone/service), `status` (active/completed), `frentes` (multi) | `display_order`, `name`, `count_etapas_in_progress` | `/operacao/zonas?event=<id>&type=zone&status=active` |
| **Etapas** | `event`, `frentes[]`, `status[]`, `responsibility` (meus/sem_responsavel/todos), `period` (planned), `q` (text) | `planned_start`, `planned_end`, `name`, `status` | `/operacao/etapas?event=<id>&status=in_progress,blocked&responsibility=meus` |
| **Chamados** | `event`, `frentes[]`, `status[]`, `priority[]`, `breaches`, `period` (created) | `created_at`, `sla_due_at`, `priority` | `/operacao/chamados?event=<id>&status=open,in_progress&priority=crit,high&breaches=1` |

---

## 5. RLS check — TODO verificar

**Não foi possível** executar `pg_policies` query via Lovable MCP (500 transient). SQL pronto para correr manualmente:

```sql
SELECT tablename, policyname, cmd, qual AS using_expr
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('operacao_frentes','operacao_etapas','operacao_registros',
                    'operacao_frente_team','operacao_etapa_assignees','operacao_etapa_suppliers',
                    'event_team_members','event_team_member_zones')
ORDER BY tablename, cmd, policyname;
```

**Esperar (baseado no histórico de commits 155fa515, 7bd4c6ec, 0d4332ca):**
- `operacao_frentes` SELECT: 2 policies (user via team OR lead) + 1 admin_bypass.
- `operacao_frente_team` SELECT: similar.
- `operacao_etapa_assignees` SELECT: similar.
- `operacao_etapas` SELECT: provavelmente já tem permissive (lista cross-evento depende disto).
- `operacao_registros` SELECT: idem (Dashboard já lista sem erros para admin).
- `operacao_etapa_suppliers` SELECT: idem.

**Resultados a registar como TODO P1 se faltar:**
- Se `operacao_etapas` SELECT NÃO tem policy `is_platform_admin() OR has_permission('manage_operacao_etapas') OR ...lead`, criar.
- Se `operacao_registros` SELECT depende exclusivamente de team membership, considerar policy bypass admin.

> **Bloqueio risco:** lista L2 (Etapas) é **prioridade máxima**. Se admin não conseguir listar etapas cross-evento por RLS, todo o sprint OP-13 fica bloqueado. **Validar antes do Dia 2** do plano incremental.

---

## 6. Performance

### 6.1 Coala (~50 etapas) — trivial
Padrão actual do Dashboard (sem paginação, fetch all) funciona até ~200 etapas (~30KB JSON). Coala está bem dentro disto.

### 6.2 Escala (500+ etapas) — paginação server-side desde já

**Recomendação:** implementar paginação server-side via Supabase `.range(from, to)` desde o início da Fase 1. Custo zero adicional e poupa refactor futuro.

```ts
const PAGE_SIZE = 50;
const from = page * PAGE_SIZE;
const to = from + PAGE_SIZE - 1;
const { data, count } = await supabase
  .from("operacao_etapas")
  .select("...", { count: "exact" })   // count: exact para total
  .range(from, to);
```

**UX:** preferir "Carregar mais" infinito ou "Página X de Y" padrão? Para Coala (3-4 páginas no máximo), "Carregar mais" é mais simples e mobile-friendly.

### 6.3 Counts em listas Zonas — preocupação ligeira

Para 20 zonas/evento, 3 queries (etapas count + chamados count + lead profile) são triviais. Para eventos com 50+ frentes, considerar materializar via view. **Decisão Fase 1: query simples e refactor depois se houver lentidão observável.**

### 6.4 Cache strategy

- `staleTime: 30_000` para listas (datas relativas + chamados podem mudar a cada minuto).
- `refetchOnWindowFocus: true` (default) — útil quando user volta de outra tab.
- Sem `refetchInterval` por padrão. Botão refresh manual (padrão MontagemPhase).

---

## 7. Drill-down do Dashboard

Tornar os 3 KPIs principais clicáveis. Wrapping em `<Link>` (pode-se preservar `<KpiCard>` interno e envolver):

```tsx
<Link to={`/operacao/etapas?event=${filters.event}&status=in_progress`}>
  <KpiCard label="Em curso" value={inProgress} icon={Play} tone="blue" />
</Link>
```

**Mapeamento completo proposto:**

| Widget Dashboard | Drill-down URL | Notas |
|---|---|---|
| KPI "Etapas totais" | `/operacao/etapas?event=<id>` | sem filtro status |
| KPI "Em curso" | `/operacao/etapas?event=<id>&status=in_progress` | tone=blue |
| KPI "Bloqueadas" | `/operacao/etapas?event=<id>&status=blocked` | tone=amber |
| KPI "Chamados abertos" | `/operacao/chamados?event=<id>&status=open,in_progress` | tone=default (sub mostra prio) |
| KPI "Resolvidos no período" | `/operacao/chamados?event=<id>&status=resolved,closed&period=<periodo>` | tone=green |
| KPI "SLA breaches" | `/operacao/chamados?event=<id>&breaches=1` | tone=red |
| Widget Cobertura "Sem responsável" | `/operacao/etapas?event=<id>&responsibility=sem_responsavel` | substitui dead link `/operacao/relatorios?tab=cobertura` |
| Widget Cobertura "Sem fornecedor" | `/operacao/etapas?event=<id>&no_supplier=1` | filtro novo |
| Widget Cobertura "Sem datas" | `/operacao/etapas?event=<id>&no_dates=1` | filtro novo |
| Widget Carga por produtor — bar | `/operacao/etapas?event=<id>&assignee=<profile_id>` | filtro novo (opt v1) |
| Bar "Progresso por Frente" | `/operacao/frente/<id>` | navega para FrenteDetail (já existe) |

**Scope P1 do briefing:** apenas Em curso / Bloqueadas / Chamados abertos. Os outros 7 ficam como follow-up se sobrar tempo Dia 6.

**Fix oportunístico R6:** mudar `<Link to="/operacao/relatorios?tab=cobertura">` na linha [Dashboard.tsx:429](../../src/pages/operacao/Dashboard.tsx) para `<Link to="/operacao/etapas?event=...&responsibility=sem_responsavel">` (ou esconder se não houver tempo). **Custo XS.**

---

## 8. Risco: rota `/operacao/chamados` em colisão

A rota `/operacao/chamados` JÁ EXISTE (MeusChamados — vista pessoal). Lista L3 (cross-evento gestão) precisa de path.

**Opções:**

| Opção | Path L3 (gestão) | Path actual (pessoal) | Trade-off |
|---|---|---|---|
| A | `/operacao/chamados` | renomear actual → `/operacao/meus-chamados` | Path bonito para L3; quebra bookmarks de actual; alinhado com sidebar "Chamados" como gestão. **Recomendado.** |
| B | `/operacao/chamados/todos` (novo) | `/operacao/chamados` (mantém) | Não-quebra; path L3 é mais longo. |
| C | `/operacao/gestao/chamados` | `/operacao/chamados` (mantém) | Cria namespace `gestao/` — duplicaria depois para `gestao/etapas`, `gestao/zonas` — over-engineering para 3 listas. |

**Recomendação: Opção A.** Renomear actual com redirect server-side via `<Route path="/operacao/meus-chamados" element={<MeusChamados/>} />` E manter alias `<Route path="/operacao/chamados-meus" element={<Navigate to="/operacao/meus-chamados" replace/>} />` apenas se Pedro tiver bookmark — improvável.

Em sidebar (ver `02-rotas-e-componentes.md`):
- "Chamados" item → `/operacao/chamados` (L3 cross-evento gestão).
- "Minhas Tarefas" / "Meus Chamados" → links separados em sub-section "Pessoal" (se quisermos).

---

## 9. Resumo das decisões arquitecturais

1. **Hook novo `useOperacaoListFilters(scope)`** estende `useOperacaoFilters` via URL search params.
2. **Hook novo `useScopedEventIds()`** resolve gap fonte-de-eventos para admin/director sem team.
3. **`<OperacaoListShell>`** abstrai moldura (header/filters/pagination/states) — partilhada pelas 3 listas.
4. **Row components separados** por scope (Etapas, Zonas, Chamados) — sem abstracção forçada.
5. **Filtros bar wrappers** por scope, com base no `OperacaoFiltersBar` existente.
6. **Paginação server-side** com `range(from, to)` desde Day 1, page size 50, padrão "Carregar mais".
7. **Drill-down do Dashboard** via `<Link>` wrappers nos `KpiCard`. URL params como única fonte de filtro.
8. **Rota `/operacao/chamados`** muda para gestão (Opção A); actual renomeado para `/operacao/meus-chamados`.
9. **Embed PostgREST disambiguation** obrigatória sempre que tocar `operacao_etapas → operacao_frentes` (2 FKs).
10. **RLS validation** corre como gate antes do Dia 2 — se admin não consegue listar etapas, sprint bloqueia.
