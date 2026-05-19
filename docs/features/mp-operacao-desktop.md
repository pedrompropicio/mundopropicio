# MP Operação — Desktop Gerencial (Batch 2B.1)

Vista desktop para gestão da operação. Mobile permanece intacto (PWA-first).

## Rotas

- `/operacao` → `OperacaoHome` (desktop). Em mobile redirect para `/operacao/equipa`.
- `/operacao/dashboard` → KPIs + gráficos (desktop principalmente, responsivo).
- `/operacao/frente/:id/manage` → editor full-screen de Frente (desktop only).
- Rotas mobile existentes mantidas: `/operacao/equipa`, `/operacao/frente/:id`, `/operacao/etapa/:id`, `/operacao/chamados`, etc.

## Filtros globais

`useOperacaoFilters` (hook) sincroniza via URL search params:
- `event` — event_id
- `frentes` — lista CSV de frente_ids
- `status` — etapa status (pending|in_progress|blocked|done|cancelled)
- `kind` — tipo de registo

UI: `OperacaoFiltersBar` (sticky header). Reutilizada em `OperacaoHome` e `Dashboard`.

## OperacaoHome

Tabs:
- **Frentes** — grid de `FrenteCardDesktop` com progresso, equipa e atividade recente.
- **Etapas Kanban** — `EtapaKanban` com 4 colunas (Pendente, Em curso, Bloqueada, Concluída). Drag-and-drop via `@dnd-kit/core`. Otimista: status atualiza ao soltar.

## Dashboard

- 6 KPIs: Etapas totais, Em curso, Bloqueadas, Chamados abertos (com breakdown crit/high/med/low), Resolvidos no período, SLA breaches.
- 3 gráficos (`recharts`): Progresso por Frente (bar h), Distribuição status (pie), Atividade no período (line).
- Últimos 10 chamados (link para detalhe).
- Selector de período: Hoje / 7d / 30d / Tudo.

## FrenteManage

Desktop only. Mobile → redirect para `/operacao/frente/:id` com toast.

Permissão: `manage_operacao_frentes` ou `is_platform_admin`. Sem perm → redirect com toast.

Layout `lg:grid-cols-3`:
- **Esquerda (1 col)**: Detalhes (nome, descrição, cor, estado) com autosave on blur (debounce 800ms) + `FrenteTeamEditor`.
- **Direita (2 cols)**: `EtapasTable` (sortable via `@dnd-kit/sortable`).

## Detecção desktop vs mobile

Hook `useIsMobile` (já existente, breakpoint 768px). Usado em `OperacaoHome` (root) e `FrenteManage` (redirect).

## Permissões

- `view_operacao` → acesso a Operação + Dashboard.
- `manage_operacao_frentes` → CRUD frentes + acesso a `/manage`.
- `manage_operacao_staff` → gerir staff de campo.
- `is_platform_admin` → override.

## Componentes novos

- `src/components/operacao/desktop/OperacaoFiltersBar.tsx`
- `src/components/operacao/desktop/FrenteCardDesktop.tsx`
- `src/components/operacao/desktop/EtapaKanban.tsx`, `EtapaKanbanColumn.tsx`, `EtapaKanbanCard.tsx`
- `src/components/operacao/desktop/KpiCard.tsx`
- `src/components/operacao/desktop/EtapaInlineCell.tsx`
- `src/components/operacao/desktop/FrenteTeamEditor.tsx`
- `src/components/operacao/desktop/EtapasTable.tsx`
- `src/hooks/useOperacaoFilters.ts`
- `src/pages/operacao/OperacaoHome.tsx`
- `src/pages/operacao/Dashboard.tsx`
- `src/pages/operacao/FrenteManage.tsx`

Lib drag-and-drop: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.
