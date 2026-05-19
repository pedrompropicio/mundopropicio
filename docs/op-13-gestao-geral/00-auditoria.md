# 00 — Auditoria do estado actual

**Sprint:** OP-13 — Camada de gestão geral do módulo Operação
**Data:** 2026-05-19 (T-9 dias do Coala)
**Modo:** read-only; nenhuma alteração ao código
**Repo:** `/Users/pedroneto/Documents/mundopropicio` @ `ae884182` (origin/main)
**Lovable project_id:** `ab7cf7e3-a5fc-4737-9cc1-2ba7cf43887f`

---

## 1. Rotas actuais

Todas registadas em [src/App.tsx:373-388](../../src/App.tsx) dentro de `<Route path="/operacao" element={<OperacaoLayout/>}>` (wrapper com `<Outlet/>` + `<QuickActionFab/>` global).

| Rota | Ficheiro | Propósito | Audiência |
|---|---|---|---|
| `/operacao` (index) | `pages/operacao/OperacaoHome.tsx` → `<EventListWithPhase/>` | Lista de eventos com badge de fase actual | qualquer auth (gate `view_operacao` ou `isAdmin`) |
| `/operacao/:eventId` | `pages/operacao/EventHub.tsx` | Hub do Evento — switch entre 5 fases (Setup → Planeamento → Montagem → Evento → Fecho) | qualquer auth; mudança fase requer `manage_operacao_etapas`, `manage_operacao_frentes` ou admin |
| `/operacao/dashboard` | `pages/operacao/Dashboard.tsx` | KPIs cross-evento, charts, widgets analíticos (Cobertura, Carga por produtor, Tempo médio, Burndown) | `view_operacao` ou admin |
| `/operacao/equipa` | `pages/operacao/MyFrentes.tsx` | Landing "Minhas Zonas/Serviços" (mobile-first) | `view_operacao` ou admin |
| `/operacao/atividade` | `pages/operacao/Atividade.tsx` | Feed cronológico (7d/today/all) de registos `evolucao/observacao/punch` | `view_operacao` ou admin |
| `/operacao/minhas-tarefas` | `pages/operacao/MinhasTarefas.tsx` | Etapas pessoais em 4 buckets | `view_operacao` ou admin |
| `/operacao/staff` | `pages/operacao/StaffList.tsx` | Gestão de field staff (criar / convite WhatsApp / arquivar) | `manage_operacao_staff` ou admin |
| `/operacao/frente/:id` | `pages/operacao/FrenteDetail.tsx` | Detalhe da Zona/Serviço (3 tabs: Registos / Etapas / Chamados condicional) | qualquer auth |
| `/operacao/frente/:id/manage` | `pages/operacao/FrenteManage.tsx` | Editor desktop-only (autosave) | desktop + `manage_operacao_frentes` |
| `/operacao/etapa/:id` | `pages/operacao/EtapaDetail.tsx` | Detalhe da etapa | auth; edição se lead / responsável / manage |
| `/operacao/chamados` | `pages/operacao/MeusChamados.tsx` | Chamados onde user é team / lead / author (3 tabs) | qualquer auth |
| `/operacao/chamado/novo` | `pages/operacao/ChamadoNovo.tsx` | Form criar chamado | qualquer auth |
| `/operacao/chamado/:id` | `pages/operacao/ChamadoDetail.tsx` | Detalhe + ack/start/resolve | qualquer auth |
| `/operacao/accept-invite` | `pages/operacao/AcceptInvite.tsx` | Landing pública aceitar convite token | público (fora ProtectedLayout) |

**Total: 13 rotas dentro do módulo.** Não há `/operacao/zonas`, `/operacao/etapas` nem rota dedicada cross-evento para chamados gestão (o path `/operacao/chamados` aponta para a vista *pessoal* — ver §5).

---

## 2. Componentes e hooks reutilizáveis

### 2.1 `useOperacaoFilters` — [src/hooks/useOperacaoFilters.ts](../../src/hooks/useOperacaoFilters.ts) (67 LoC)

API:
```ts
type EtapaStatus = "pending" | "in_progress" | "blocked" | "done" | "cancelled";
type RegistroKind = "evolucao" | "observacao" | "punch" | "chamado";

interface OperacaoFilters {
  event: string | null;
  frentes: string[];
  status: EtapaStatus[];
  kind: RegistroKind[];
}

const { filters, update, clear, toggle } = useOperacaoFilters();
//   filters         leitura
//   update(patch)   merge no URL, replace
//   clear()         remove os 4 params
//   toggle(key, v)  add/remove de array
```

Funcionamento: `useSearchParams` lê e escreve em `?event=<id>&frentes=a,b&status=blocked,in_progress&kind=chamado`. **Toda a persistência é URL — não há state interno nem localStorage.**

Exemplo de uso (de [Dashboard.tsx:58,68-71](../../src/pages/operacao/Dashboard.tsx)):
```tsx
const { filters } = useOperacaoFilters();
const { data: frentes } = useQuery({
  queryKey: ["dash-frentes", filters.event, filters.frentes.join(",")],
  enabled: !!filters.event && canView,
  queryFn: async () => {
    const { data } = await supabase
      .from("operacao_frentes")
      .select("id,name,color,status,current_lead_id")
      .eq("event_id", filters.event!)
      .neq("status", "cancelled");
    let list = data ?? [];
    if (filters.frentes.length > 0) list = list.filter((f) => filters.frentes.includes(f.id));
    return list;
  },
});
```

### 2.2 `OperacaoFiltersBar` — [src/components/operacao/desktop/OperacaoFiltersBar.tsx](../../src/components/operacao/desktop/OperacaoFiltersBar.tsx) (156 LoC)

Barra sticky com:
- `<Select>` de evento — lista derivada de `operacao_frente_team WHERE profile_id=user.id AND active=true` → frentes → events.
- Chips coloridas de frentes do evento seleccionado.
- Multi-select badges de status (5 valores) e tipo de registo (4 valores).
- Botão "Limpar" se há filtros activos.

> **NOTA bloqueante:** a lista de eventos é construída a partir das frentes onde o user é team member. **Admin/platform_admin sem team em nenhuma frente vê lista vazia.** Em listas cross-evento (Etapas, Zonas, Chamados) precisamos de uma fonte de eventos alternativa para admin — ver §5 gaps e §6 riscos.

### 2.3 `KpiCard` — [src/components/operacao/desktop/KpiCard.tsx](../../src/components/operacao/desktop/KpiCard.tsx) (32 LoC)

Props: `label, value, subLabel?, icon?, tone?`. Tones: `default | amber | red | green | blue | purple`.

Não é clicável por design (é Card, não Link/Button). Para drill-down precisa de wrapper externo.

Exemplo:
```tsx
<KpiCard label="Em curso" value={inProgress} icon={Play} tone="blue" />
```

### 2.4 `MontagemPhase` — [src/components/operacao/event/MontagemPhase.tsx](../../src/components/operacao/event/MontagemPhase.tsx) (249 LoC)

**Modelo de referência para listas de etapas.** Padrões a replicar:
- **Tabs:** Em curso · Atrasadas · Lookahead 48h (com badge de count, atrasadas highlight destructive).
- **Refresh manual** + indicador `atualizado há Xs` (re-render via setInterval 30s para datas relativas).
- **Empty states** com mensagem útil em cada tab.
- **Embed disambiguation** confirmado:
  ```ts
  frente:operacao_frentes!operacao_etapas_frente_id_fkey(id,name,color,type),
  responsible:profiles!operacao_etapas_responsible_profile_id_fkey(id,full_name),
  supplier:suppliers!operacao_etapas_supplier_id_fkey(name)
  ```
- **EtapaList** sub-componente com `onOpen={id => navigate(\`/operacao/etapa/${id}\`)}`.

### 2.5 `setFrenteLead` helper — [src/lib/operacao-frente-lead.ts](../../src/lib/operacao-frente-lead.ts) (60 LoC)

Atomic-ish sync entre `operacao_frentes.current_lead_id` e `operacao_frente_team` (com `is_permanent_lead=true`). 4 escritas em sequência (sem transação — limitação conhecida). API:
```ts
setFrenteLead({ frenteId, profileId, companyId }) → { error?: string }
```

Usado em `EditFrenteSheet` (Hub) e `NewFrenteDialog`. **Replicar em qualquer UI que atribua produtor.**

### 2.6 `operacao-labels` — [src/lib/operacao-labels.ts](../../src/lib/operacao-labels.ts) (10 LoC)

```ts
frenteLabel(type, plural?) // "Zona" / "Serviço" / "Frente"
frenteLabelNeutral(plural?) // "Zona/Serviço" / "Zonas/Serviços"
```

Hoje é usado em apenas 2/36 componentes (`PlanejamentoPhase`, `EditFrenteSheet`). **As listas novas DEVEM usar.**

### 2.7 `Dashboard.tsx` — padrão de queries multi-tabela

Cascade típica ([Dashboard.tsx:68-164](../../src/pages/operacao/Dashboard.tsx)):
1. Query A: `operacao_frentes` filtrado por `event_id` + `filters.frentes`.
2. Query B: `operacao_etapas` filtrado por `frente_id IN (ids)`.
3. Query C/D: `operacao_etapa_assignees` + `operacao_etapa_suppliers` filtrados por `etapa_id IN (etapaIds)`.
4. Query E: `operacao_registros WHERE kind='chamado' AND frente_id IN (ids)`.
5. Query F: `profiles WHERE id IN (ownerIds)` (lookup nomes).

**Padrão a manter** nas novas listas — favorece RLS clarity e performance previsível.

### 2.8 `MyFrentes.tsx` — padrão de lista pessoal — [src/pages/operacao/MyFrentes.tsx](../../src/pages/operacao/MyFrentes.tsx) (157 LoC)

Layout mobile-first com header + push notification prompt + lista de cards.

### 2.9 `MeusChamados.tsx` — vista pessoal de chamados — [src/pages/operacao/MeusChamados.tsx](../../src/pages/operacao/MeusChamados.tsx) (84 LoC)

3 tabs (open/in_progress/resolved). Lista todos os chamados onde user é team member, lead da frente, OU author. Sort por `sla_due_at` em "open". **Esta é a vista pessoal — colide semanticamente com a lista cross-evento de gestão.**

---

## 3. Sidebar actual

Ficheiro: [src/components/AppSidebar.tsx](../../src/components/AppSidebar.tsx) (152 LoC).

### Items quando `inOperacao` (linha 50-52):
```
operacaoItems = [
  { to: "/operacao", icon: Radar, label: "Operação", show: hasPermission("view_operacao") || isAdmin },
]
```

**Só 1 item.** Não há sub-items: Dashboard, Staff, Equipa, Atividade, Minhas Tarefas, etc. **estão escondidos no sidebar quando estamos em /operacao** (estão acessíveis apenas por links no Hub do Evento e por URL directo).

### Items quando NÃO `inOperacao` (linha 55-77):
`fullNavItems` flat list de 22 entradas. `/operacao` aparece como item normal (L69).

### Comportamento:
- Switch via `inOperacao = location.pathname.startsWith("/operacao")` (L48).
- Field staff scope: `useIsFieldStaffOnly` esconde tudo excepto `/operacao*` (L47, L84).
- Largura: `w-16` mobile-collapsed (só ícones com title tooltip) → `w-56` desktop expanded.
- "Trocar módulo" no rodapé se `isAdmin || inOperacao`.
- Sem dividers / sections. **Lista é flat e fechada em scroll vertical.**

---

## 4. Padrões de filtros e queries

### 4.1 Filtros baseados em URL
Confirmado em `useOperacaoFilters` (§2.1). **Toda a navegação que queira pré-filtrar a página de destino tem de usar query params, não state.**

### 4.2 `enabled: !!event` defere queries
[Dashboard.tsx:70,87,101,113,125,137](../../src/pages/operacao/Dashboard.tsx) usa `enabled: !!filters.event && canView`. Queries dependentes (etapas → assignees → profiles) usam `enabled: ids.length > 0` para evitar request com IN vazio.

### 4.3 staleTime e refetch
- `useOperacaoMode` ([src/hooks/useOperacaoMode.ts](../../src/hooks/useOperacaoMode.ts)) usa `staleTime: 60_000`.
- `MontagemPhase` ([src/components/operacao/event/MontagemPhase.tsx:77-80](../../src/components/operacao/event/MontagemPhase.tsx)) re-renderiza a cada 30s via `setInterval` para datas relativas — **não** refetch.
- `EventoPhase` faz refetch a cada 30s (`refetchInterval: 30_000`) — padrão para vista live.
- Dashboard depende de filter changes para invalidar.

### 4.4 PostgREST embed disambiguation (crítico)
`operacao_etapas` tem **2 FKs para `operacao_frentes`**: `frente_id` e `zone_id`. Embed `frente:operacao_frentes(...)` sem disambig dá erro 500. Padrão correcto:
```ts
.select(`
  id,name,
  frente:operacao_frentes!operacao_etapas_frente_id_fkey(id,name,color,type),
  zone:operacao_frentes!operacao_etapas_zone_id_fkey(id,name)
`)
```

Confirmado em `MontagemPhase.tsx:65`, `EtapaDetail.tsx:38`. Replicar em qualquer query de etapas que precise da frente.

### 4.5 React Query keys
Padrão: `["scope-name", ...inputs]` com inputs separados por scope. Ex.: `["dash-etapas", ids]`, `["op-hub-montagem", eventId]`, `["op-meus-chamados", user?.id]`.

### 4.6 RLS bypass para admin
Histórico de 3 incidentes (commits `155fa515`, `7bd4c6ec`, `0d4332ca`): `operacao_etapa_assignees`, `operacao_frentes`, `operacao_frente_team` tinham policies de SELECT/INSERT/UPDATE/DELETE a exigir **permissão explícita OU lead** — admin/platform_admin sem permissão concreta era bloqueado. Foram adicionadas policies `*_*_admin_bypass`.

> **TODO verificar (Lovable MCP em 500 transient hoje 19/05):** correr no SQL editor da Lovable para confirmar que admin bypass cobre todas as tabelas relevantes para listas cross-evento:
> ```sql
> SELECT tablename, policyname, cmd
> FROM pg_policies
> WHERE schemaname='public'
>   AND tablename IN ('operacao_frentes','operacao_etapas','operacao_registros',
>                     'operacao_frente_team','operacao_etapa_assignees','operacao_etapa_suppliers')
> ORDER BY tablename, cmd;
> ```
> Esperar: para cada tabela ≥ 1 policy bypass admin/platform_admin (nome contém "admin_bypass").

---

## 5. Gaps identificados

### 5.1 Vector — Listas cross-evento
- **`/operacao/zonas` não existe.** Para gerir Zonas cross-evento (ex.: ver "Som & Luz" em todos os eventos activos), o user tem de entrar evento a evento.
- **`/operacao/etapas` não existe.** Critical gap — Pedro tem ~50 etapas no Coala e quer ver todas filtradas por status sem entrar em cada zona.
- **`/operacao/chamados` aponta para vista pessoal** (MeusChamados). Não há vista de gestão "todos os chamados do evento X". O Dashboard mostra apenas "Últimos 10 chamados" como widget.

### 5.2 Vector — Navegação (Sidebar)
- Sidebar quando `inOperacao` tem 1 item (Operação). Falta drill-down sem precisar de URL directo:
  - Sem entry point para Dashboard (acessível só por URL ou via card no Hub do Evento — para a fase Evento).
  - Sem entry point para Staff (idem).
  - Sem entry point para Etapas/Zonas/Chamados gestão (não existem).
  - Sem entry point para Minhas Tarefas / Atividade.

### 5.3 Vector — Drill-down do Dashboard
Os 6 KPIs ([Dashboard.tsx:361-380](../../src/pages/operacao/Dashboard.tsx)) são `<KpiCard>` puros — **não clicáveis**. Os widgets analíticos (Cobertura, Carga por produtor) também não fazem drill-down para listas filtradas.

**Dead link confirmado:** `<Link to="/operacao/relatorios?tab=cobertura">` em [Dashboard.tsx:429](../../src/pages/operacao/Dashboard.tsx) — rota `/operacao/relatorios` NÃO existe (verificado em App.tsx). Quebra na produção.

### 5.4 Vector — Ações (bulk)
Confirmado fora de scope da Fase 1 (A1 = Fase 2 pós-Coala). Não há atalho actual para mudar estado de N etapas simultâneas.

### 5.5 Vector — Fonte de eventos para filtros
`OperacaoFiltersBar` deriva eventos de `operacao_frente_team`. **Para listas cross-evento de gestão, fonte deve ser `events` directamente** (admin/director vê todos os events da company, não só os onde tem team). Hook actual não suporta — precisa de override ou query adicional.

---

## 6. Riscos

### R1. RLS bypass admin — incompleto?
3 commits adicionaram bypass policies. **TODO verificar** se `operacao_etapas`, `operacao_etapa_suppliers`, `operacao_registros` têm bypass admin para SELECT cross-evento sem ser via lead. Se faltar, lista Etapas pode mostrar `0 rows` para admin platform_admin que não está em nenhuma frente.

### R2. Performance em eventos com 500+ etapas
Coala (~50 etapas) é trivial. Mas o sistema vai escalar. Padrão actual no Dashboard carrega TODAS as etapas do evento de uma vez (sem paginação). Para 500+ etapas isto é 30-50KB de JSON + parsing client-side. **Listas novas devem assumir paginação server-side desde já**.

### R3. Terminologia ainda inconsistente
Apesar dos commits `4cd923b2` + `2d30e038` (Owner/Helper → Produtor/Staff, Lead → Produtor), há strings legacy em 30+ componentes:
- "Frente" em [NewFrenteDialog.tsx:79](../../src/components/operacao/NewFrenteDialog.tsx), [FrentePickerDialog.tsx:35](../../src/components/operacao/FrentePickerDialog.tsx) (toasts/empty)
- "Lead" como label em [FrenteCard.tsx:71](../../src/components/operacao/FrenteCard.tsx), [EventoPhase.tsx:294](../../src/components/operacao/event/EventoPhase.tsx)
- "Responsável" coexiste com "Produtor de Zona" (mesma realidade `current_lead_id`)
- Auditoria completa: `docs/audits/2026-05-19-operacao/04-inconsistencias-ux.md` §4.1-4.2

**Para OP-13:** todas as novas listas usam glossário canónico **Produtor / Staff / Zona / Serviço / Etapa / Chamado / Diretor / Produtor Geral**.

### R4. Queries não consomem `error`/`isError`
Maioria das páginas (Dashboard incluído) silencia errors. Em listas cross-evento, RLS deny → "sem dados" silencioso é UX má. **Listas novas devem tratar `error` explicitamente** (toast + retry button).

### R5. `OperacaoFiltersBar` event source bug
Já mencionado em §2.2 — bloqueia admin/director sem team. Precisa de variant alternativo para listas de gestão.

### R6. Dead link em produção
[Dashboard.tsx:429](../../src/pages/operacao/Dashboard.tsx) → `/operacao/relatorios?tab=cobertura` não existe. Pedro a fazer demo bate nisto. **Fix oportunista** durante OP-13.

### R7. Colisão de rota `/operacao/chamados`
Já existe como `MeusChamados` (vista pessoal). Lista L3 (gestão cross-evento) precisa de novo path ou rename. Ver §5 e proposta em `02-rotas-e-componentes.md`.

### R8. `QuickActionFab` Rules of Hooks (P0 herdado)
Auditoria geral pré-Coala flagged que `QuickActionFab.tsx:77-97` chama `useQuery` após early return — pode crashar a app em transições de rota. Está em backlog OP-10 P0 mas não foi confirmado fix. **Verificar antes do dispatch do OP-13** pois afecta navegação para novas rotas.

---

## Notas finais

- **Total de ficheiros lidos:** 11 (App.tsx routes, AppSidebar, useOperacaoFilters, OperacaoFiltersBar, KpiCard, Dashboard, MyFrentes, MontagemPhase, MeusChamados, operacao-frente-lead, operacao-labels).
- **Total de rotas mapeadas:** 13 + AcceptInvite público.
- **Total de páginas no módulo:** 15 (após pull-rebase de hoje).
- **Total de componentes operacao/:** 36 em 5 directorias (raiz, desktop, event, shared, suppliers).
- **Pendente:** verificação de pg_policies via Lovable MCP — bloqueado por 500 transient da Lovable API. Comando SQL em §4.6 pronto para executar no SQL editor manual.
