# 02 — Rotas e componentes

Mapa concreto do que criar, do que editar e do que renomear. Caminhos absolutos relativos ao repo.

---

## 1. Sidebar reorganizada

### 1.1 Proposta visual

Quando `inOperacao = location.pathname.startsWith("/operacao")`, o array `operacaoItems` em [src/components/AppSidebar.tsx:50-52](../../src/components/AppSidebar.tsx) passa de 1 entrada para 7-8.

```
┌─ AppSidebar (in operacao) ─────────────┐
│                                        │
│  [≡ icon]  Dashboard                   │ ← novo
│  [⚒ icon]  Etapas                      │ ← novo
│  [⊞ icon]  Zonas / Serviços            │ ← novo
│  [🔔 icon] Chamados                    │ ← novo (gestão)
│  ────────────────────────              │ ← divisor visual
│  [📋 icon] Eventos                     │ ← actual "Operação" renomeado
│  [👥 icon] Minhas Tarefas              │ ← já existe rota; expor aqui
│  [📞 icon] Meus Chamados               │ ← renomeado de /chamados (pessoal)
│  [📊 icon] Atividade                   │ ← já existe rota; expor aqui
│  ────────────────────────              │
│  [⚙ icon] Staff                        │ ← já existe; mostrar só se manage_operacao_staff
│                                        │
│  ... (footer: Trocar módulo, etc.)     │
└────────────────────────────────────────┘
```

**Mobile (w-16):** mesmo array, layout vertical só com ícones + `title=` tooltip. Divisor visual via `<hr/>` ou `border-t border-border my-2`.

### 1.2 Ficheiro a editar

[src/components/AppSidebar.tsx:50-52](../../src/components/AppSidebar.tsx) — substituir o array `operacaoItems` por:

```ts
const operacaoItems = [
  { to: "/operacao/dashboard",      icon: LayoutDashboard, label: "Dashboard",
    show: hasPermission("view_operacao") || isAdmin },
  { to: "/operacao/etapas",         icon: ListChecks,      label: "Etapas",
    show: hasPermission("view_operacao") || isAdmin },
  { to: "/operacao/zonas",          icon: Grid3x3,         label: "Zonas / Serviços",
    show: hasPermission("view_operacao") || isAdmin },
  { to: "/operacao/chamados",       icon: Bell,            label: "Chamados",
    show: hasPermission("view_operacao") || isAdmin },
  { divider: true, key: "personal" },
  { to: "/operacao",                icon: Calendar,        label: "Eventos",
    show: hasPermission("view_operacao") || isAdmin },
  { to: "/operacao/minhas-tarefas", icon: ClipboardCheck,  label: "Minhas Tarefas",
    show: hasPermission("view_operacao") || isAdmin },
  { to: "/operacao/meus-chamados",  icon: Phone,           label: "Meus Chamados",
    show: hasPermission("view_operacao") || isAdmin },
  { to: "/operacao/atividade",      icon: Activity,        label: "Atividade",
    show: hasPermission("view_operacao") || isAdmin },
  { divider: true, key: "admin" },
  { to: "/operacao/staff",          icon: Users,           label: "Staff",
    show: hasPermission("manage_operacao_staff") || isAdmin },
];
```

**Render** (linhas 83-113): tratar `divider` como caso especial:

```tsx
{(inOperacao ? operacaoItems : fullNavItems)
  .filter((i: any) => i.divider || (i.show && (!fieldStaffOnly || i.to.startsWith("/operacao"))))
  .map((item: any) => {
    if (item.divider) {
      return <hr key={item.key} className="my-2 border-border" />;
    }
    // existing render…
  })}
```

**Active-detection** mantém-se (`location.pathname.startsWith(item.to)`) mas precisa de exact match para `/operacao` (Eventos) versus `/operacao/dashboard` etc. Ajustar:

```ts
const isActive =
  item.to === "/operacao"
    ? location.pathname === "/operacao"
    : location.pathname.startsWith(item.to);
```

Caso contrário, em `/operacao/etapas` o item "Eventos" também ficaria highlighted.

### 1.3 Ícones lucide-react escolhidos

| Item | Ícone | Já importado em AppSidebar? |
|---|---|---|
| Dashboard | `LayoutDashboard` | ✅ |
| Etapas | `ListChecks` | ⚠️ adicionar |
| Zonas / Serviços | `Grid3x3` | ✅ |
| Chamados | `Bell` | ⚠️ adicionar |
| Eventos | `Calendar` | ✅ |
| Minhas Tarefas | `ClipboardCheck` | ✅ |
| Meus Chamados | `Phone` ou `BellRing` | ⚠️ adicionar |
| Atividade | `Activity` | ✅ |
| Staff | `Users` | ✅ |

---

## 2. Rotas novas

### 2.1 `/operacao/etapas` — Lista cross-evento de etapas (L2, prioridade máxima)

**Ficheiro novo:** `src/pages/operacao/EtapasList.tsx`.

**Layout:**

```
┌─ EtapasList ────────────────────────────────────────┐
│                                                     │
│  [← Voltar]                                         │
│                                                     │
│  Etapas                                             │
│  Lista cross-evento  ·  {total} resultados          │
│                                  [↻ Refresh]        │
│                                                     │
│  ┌─ Filters ───────────────────────────────────┐    │
│  │ [Evento ▼]  [Zona/Serviço chips]            │    │
│  │ Status: [pending] [in_progress*] [blocked*] │    │
│  │ Responsável: [Meus] [Sem] [Todos*]          │    │
│  │ Sort: [Início ↑]   [Limpar]                 │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─ EtapaListRow ──────────────────────────────┐    │
│  │ ▌ Som & Luz Coala  ·  Palco Principal       │    │
│  │   João Silva · Sound Co.                    │    │
│  │              começa daqui a 2h  [Em curso]→ │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ▌ Catering Setup  ·  F&B                    │    │
│  │   Maria Santos · — (sem fornecedor)         │    │
│  │              terminou há 30min  [Atrasada]→ │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [Carregar mais (próximas 50)]                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Drill-down ao clicar linha:** `navigate(\`/operacao/etapa/${id}\`)`.

**Estado vazio:**
- Sem `event` seleccionado: `"Seleciona um evento na barra de filtros."` + ícone.
- Sem etapas para filtros: `"Sem etapas para os filtros actuais."` + botão "Limpar filtros".

**Mobile-first:** linha como card vertical em `<md`, row horizontal em `≥md`.

### 2.2 `/operacao/zonas` — Lista cross-evento de zonas/serviços (L1)

**Ficheiro novo:** `src/pages/operacao/ZonasList.tsx`.

**Layout:**

Grid de cards (1col mobile, 2col tablet, 3col desktop):

```
┌─ ZonaCard ─────────────────┐  ┌─ ZonaCard ─────────────┐
│ ▌ Palco Principal          │  │ ▌ F&B                  │
│   Zona · 12 etapas         │  │   Serviço · 8 etapas   │
│   Produtor: João Silva     │  │   Produtor: —          │
│                            │  │                        │
│   ✓ 7  ⚠ 2  ⛔ 1  ⏳ 2     │  │   ✓ 5  ⚠ 1  ⛔ 0  ⏳ 2 │
│   🔔 1 chamado aberto      │  │   🔔 0                 │
│                            │  │                        │
└────────────────────────────┘  └────────────────────────┘
```

**Click no card:** `navigate(\`/operacao/frente/${id}\`)`.

**Ações inline (header da card, dropdown •••):**
- Editar (abre `EditFrenteSheet` — existe)
- Atribuir produtor (abre `EditFrenteSheet` em modo lead)
- Eliminar (admin only)

**Filtros:** event, type (zone/service), status (active/completed/all).

### 2.3 `/operacao/chamados` — Lista cross-evento de chamados (L3)

**Ficheiro novo:** `src/pages/operacao/ChamadosList.tsx`.

**Layout:** mesmo padrão da L2 — header sticky + filters + lista de rows com `ChamadoListRow`.

```
┌─ ChamadoListRow ───────────────────────────────┐
│ [CRIT] Som a falhar no palco               →    │
│ Palco Principal · João Silva · há 12min         │
│ ⏱ SLA: daqui a 3min  •  Em curso                │
└─────────────────────────────────────────────────┘
```

**Filtros:** event, status (open/in_progress/resolved/closed), priority (crit/high/med/low), breaches (toggle).

**Click:** `navigate(\`/operacao/chamado/${id}\`)`.

### 2.4 Definição em `src/App.tsx`

Adicionar dentro de `<Route path="/operacao" element={<OperacaoLayout />}>` ([App.tsx:373-388](../../src/App.tsx)):

```tsx
<Route path="etapas" element={<EtapasList />} />
<Route path="zonas" element={<ZonasList />} />
{/* L3 colision strategy — Opção A do 01-arquitetura.md §8 */}
<Route path="chamados" element={<ChamadosList />} />          {/* novo: gestão cross-evento */}
<Route path="meus-chamados" element={<MeusChamados />} />     {/* novo: pessoal renomeado */}
{/* opcional: alias de transição */}
<Route path="chamados-meus" element={<Navigate to="/operacao/meus-chamados" replace />} />
```

Importar os novos componentes em [App.tsx:94-108](../../src/App.tsx) (área dos imports operacao).

---

## 3. Edits em ficheiros existentes

### 3.1 [src/components/AppSidebar.tsx](../../src/components/AppSidebar.tsx) — sidebar reorganizada
- Substituir `operacaoItems` (L50-52) pelo array de §1.2.
- Adicionar imports de ícones em falta (L1-29 area): `ListChecks`, `Bell`, `Phone` (ou `BellRing`).
- Ajustar render para suportar `divider` (L83-113).
- Ajustar `isActive` para exact-match em `/operacao` (linha 87-91 area).

### 3.2 [src/pages/operacao/Dashboard.tsx](../../src/pages/operacao/Dashboard.tsx) — KPIs clicáveis
- Envolver os 3 KPIs principais em `<Link>` (L363-380):

```tsx
<Link to={`/operacao/etapas?event=${filters.event}&status=in_progress`}>
  <KpiCard label="Em curso" value={inProgress} icon={Play} tone="blue" />
</Link>
<Link to={`/operacao/etapas?event=${filters.event}&status=blocked`}>
  <KpiCard label="Bloqueadas" value={blocked} icon={AlertTriangle} tone="amber" />
</Link>
<Link to={`/operacao/chamados?event=${filters.event}&status=open,in_progress`}>
  <KpiCard label="Chamados abertos" value={openCh.length} ... />
</Link>
```

> **NOTA estilística:** wrap em Link adiciona `display: inline` por defeito. Adicionar `className="block hover:opacity-90 transition"` no `<Link>` para preservar grid layout e dar feedback de hover.

- **Fix dead link** [Dashboard.tsx:429](../../src/pages/operacao/Dashboard.tsx):
  ```diff
  - <Link to="/operacao/relatorios?tab=cobertura" className="...">Ver detalhes →</Link>
  + <Link to={`/operacao/etapas?event=${filters.event}&responsibility=sem_responsavel`} ...>Ver detalhes →</Link>
  ```

- **Opcional Dia 6:** tornar os 4 sub-KPIs do widget Cobertura clicáveis também (sem responsável / fornecedor / datas).

### 3.3 [src/App.tsx](../../src/App.tsx) — routes
- Adicionar 4 rotas dentro do bloco `/operacao` (ver §2.4).
- Adicionar 4 imports em L94-108.

### 3.4 [src/components/operacao/desktop/OperacaoFiltersBar.tsx](../../src/components/operacao/desktop/OperacaoFiltersBar.tsx) — opcional refactor
Substituir a query "events derived from team membership" (L34-53) por `useScopedEventIds()`. **Não obrigatório na Fase 1** — wrapper bars das listas novas podem usar source diferente sem refactorar o original. Marcar como follow-up.

---

## 4. Componentes novos partilhados

### 4.1 `src/hooks/useOperacaoListFilters.ts` (novo, ~80 LoC)
API definida em [01-arquitetura.md §2.1](./01-arquitetura.md). Compõe com `useOperacaoFilters` existente.

### 4.2 `src/hooks/useScopedEventIds.ts` (novo, ~30 LoC)
API definida em [01-arquitetura.md §2.2](./01-arquitetura.md).

### 4.3 `src/components/operacao/list/OperacaoListShell.tsx` (novo, ~150 LoC)
Moldura partilhada das 3 listas. Props: `title`, `subtitle?`, `total`, `page`, `pageSize`, `onPageChange`, `isLoading`, `isError`, `isEmpty`, `emptyMessage`, `filtersBar` (slot), `refreshButton`, `children`.

Render:
- Header sticky com title + total + refresh + filtersBar.
- Body com loading/error/empty/content states.
- Footer com pagination "Carregar mais" ou "Página X de Y" (decide via prop).

### 4.4 `src/components/operacao/list/EtapaListRow.tsx` (novo, ~100 LoC)
Reaproveita 60% da `EtapaList` interna do [MontagemPhase.tsx:183-248](../../src/components/operacao/event/MontagemPhase.tsx) (extraí-la primeiro? — ver §6 abaixo). Adiciona avatars `EtapaAssigneeAvatars` (existe) e badge de evento (para vista cross-evento).

### 4.5 `src/components/operacao/list/ZonaCard.tsx` (novo, ~120 LoC)
Card com cor lateral + nome + type badge + 4 counters (status) + chamados badge + lead avatar + dropdown ações (•••).

### 4.6 `src/components/operacao/list/ChamadoListRow.tsx` (novo, ~80 LoC)
Linha com `PriorityBadge` (existe) + texto truncado + frente + autor + SLA relativo + status badge + chevron.

### 4.7 `src/components/operacao/list/EtapasFiltersBar.tsx`, `ZonasFiltersBar.tsx`, `ChamadosFiltersBar.tsx` (novos, ~80 LoC cada)
Wrappers à volta da `OperacaoFiltersBar` ou implementação directa se precisarem de filtros muito diferentes. Decisão final ao implementar.

---

## 5. Migrations

### 5.1 Nenhuma migration estrutural necessária

Schema actual cobre 100% dos requisitos das 3 listas. Não há colunas novas, não há tabelas novas.

### 5.2 Indexes opcionais (Fase 2 quando 500+ etapas)

**TODO verificar** que estes indexes já existem (deveriam, dada a maturidade do schema):

```sql
-- Etapas por frente + status (para filtros de lista L2)
CREATE INDEX IF NOT EXISTS idx_operacao_etapas_frente_status
  ON public.operacao_etapas(frente_id, status);

-- Chamados por frente + kind + status (lista L3)
CREATE INDEX IF NOT EXISTS idx_operacao_registros_frente_kind_status
  ON public.operacao_registros(frente_id, kind, status)
  WHERE kind = 'chamado';

-- Frentes por event + type (lista L1)
CREATE INDEX IF NOT EXISTS idx_operacao_frentes_event_type
  ON public.operacao_frentes(event_id, type)
  WHERE status != 'cancelled';
```

Aplicar **apenas** se a query `SELECT indexname FROM pg_indexes WHERE tablename = 'operacao_etapas';` revelar que faltam. **Não criar preemptivamente** — risco baixo, ganho zero para Coala.

### 5.3 RLS — pendente verificação

Ver [01-arquitetura.md §5](./01-arquitetura.md) — TODO correr `pg_policies` query no SQL editor. Se faltar admin bypass em alguma tabela relevante, criar migration dedicada:

```sql
-- Exemplo se faltar em operacao_etapas
CREATE POLICY operacao_etapas_select_admin_bypass
  ON public.operacao_etapas
  FOR SELECT
  TO authenticated
  USING (
    is_platform_admin()
    OR has_permission(auth.uid(), 'manage_operacao_etapas')
  );
```

---

## 6. Extracção opcional de `EtapaList`

[MontagemPhase.tsx:183-248](../../src/components/operacao/event/MontagemPhase.tsx) define `EtapaList` interno. Para reaproveitar na nova lista L2 sem duplicar, extrair para:

```
src/components/operacao/list/EtapaListRow.tsx     ← novo
src/components/operacao/list/EtapaListGroup.tsx   ← novo (wrap divide-y)
```

Manter `EtapaList` interno em `MontagemPhase.tsx` por compatibilidade OU substituir por composição dos novos.

**Decisão Fase 1:** criar `EtapaListRow` partilhado. Refactor `MontagemPhase` para usá-lo é opcional (custo S; pode ficar para Dia 6 polish).

---

## 7. Resumo dos ficheiros tocados

### Novos (≥ 7 ficheiros)
- `src/hooks/useOperacaoListFilters.ts`
- `src/hooks/useScopedEventIds.ts`
- `src/pages/operacao/EtapasList.tsx`
- `src/pages/operacao/ZonasList.tsx`
- `src/pages/operacao/ChamadosList.tsx`
- `src/components/operacao/list/OperacaoListShell.tsx`
- `src/components/operacao/list/EtapaListRow.tsx`
- `src/components/operacao/list/ZonaCard.tsx`
- `src/components/operacao/list/ChamadoListRow.tsx`
- `src/components/operacao/list/EtapasFiltersBar.tsx`
- `src/components/operacao/list/ZonasFiltersBar.tsx`
- `src/components/operacao/list/ChamadosFiltersBar.tsx`

### Editados (3)
- `src/components/AppSidebar.tsx` — operacaoItems + render divider + isActive exact-match
- `src/pages/operacao/Dashboard.tsx` — Link wrappers nos 3 KPIs + fix dead link L429
- `src/App.tsx` — 4 rotas novas + imports

### Renomeados (1 funcional)
- `src/pages/operacao/MeusChamados.tsx` — manter ficheiro, mudar rota para `/operacao/meus-chamados`. Componente em si não muda.

### Migrations (0 obrigatórias na Fase 1)
- Eventual policy bypass admin (ver §5.3) — **só** se pg_policies revelar falta.
- Indexes performance — só Fase 2.
