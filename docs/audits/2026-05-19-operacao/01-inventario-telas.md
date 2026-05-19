# 01 — Inventário de Telas

**Escopo:** `src/pages/operacao/*` (15), `src/components/operacao/**` (36), `src/hooks/use{Operacao*,IsEventDirectorOnly,IsFieldStaffOnly}` (4) + rotas registadas em `src/App.tsx`.

Legenda estado: ✅ OK · ⚠️ parcial · ❌ quebrado · 👻 órfão · 🚧 placeholder.

---

## 1.1 Rotas

| Rota | Componente | Layout | Perfil que acede | Propósito | Estado |
|---|---|---|---|---|---|
| `/operacao` | `OperacaoHome` → `EventListWithPhase` | `OperacaoLayout` | `view_operacao` ou admin (gate em `EventListWithPhase.tsx:25`) | Lista de eventos com badge de fase | ✅ |
| `/operacao/:eventId` | `EventHub` | `OperacaoLayout` | auth + (gate de mudança fase: `manage_operacao_etapas` OU `manage_operacao_frentes` OU admin) | Hub do Evento — switch entre 5 fases | ⚠️ (Montagem e Fecho 🚧) |
| `/operacao/dashboard` | `Dashboard` | `OperacaoLayout` | `view_operacao` ou admin | KPIs + charts cross-evento + últimos 10 chamados | ⚠️ |
| `/operacao/equipa` | `MyFrentes` | `OperacaoLayout` | `view_operacao` ou admin | Landing "Minhas Zonas/Serviços" (mobile-first) | ⚠️ |
| `/operacao/atividade` | `Atividade` | `OperacaoLayout` | `view_operacao` ou admin | Feed cronológico de registos (7d/24h/all) | ✅ |
| `/operacao/minhas-tarefas` | `MinhasTarefas` | `OperacaoLayout` | `view_operacao` ou admin | Etapas em buckets (em curso / pendentes / bloqueadas / concluídas hoje) | ⚠️ |
| `/operacao/chamados` | `MeusChamados` | `OperacaoLayout` | qualquer auth (sem gate explícito) | Lista chamados do user em 3 tabs | ⚠️ |
| `/operacao/chamado/novo` | `ChamadoNovo` | `OperacaoLayout` | qualquer auth | Form criar chamado | ⚠️ |
| `/operacao/chamado/:id` | `ChamadoDetail` | `OperacaoLayout` | qualquer auth | Detalhe + timeline + ações ack/start/resolve | ⚠️ |
| `/operacao/frente/:id` | `FrenteDetail` | `OperacaoLayout` | qualquer auth | Detalhe Zona/Serviço com 3 tabs | ⚠️ |
| `/operacao/frente/:id/manage` | `FrenteManage` | `OperacaoLayout` | desktop + `manage_operacao_frentes` ou admin | Editor desktop (autosave, equipa, tabela etapas) | ⚠️ |
| `/operacao/etapa/:id` | `EtapaDetail` | `OperacaoLayout` | auth + edição se `manage_operacao_etapas` OU lead OU responsável | Detalhe da Etapa | ✅ (fix OP-9a aplicado) |
| `/operacao/staff` | `StaffList` | `OperacaoLayout` | `manage_operacao_staff` ou admin | Gestão de field staff (criar / arquivar / re-convite) | ⚠️ |
| `/operacao/accept-invite` | `AcceptInvite` | **público** (fora `ProtectedLayout`) | público com `token` | Landing aceitação de convite | ✅ |
| `/operacao` (Outlet) | `OperacaoLayout` | n/a | wrapper | Renderiza `<Outlet/>` + `<QuickActionFab/>` global | ✅ |

---

## 1.2 Páginas em `src/pages/operacao/` (15)

| Path | LoC | Estado | Notas |
|---|---:|:---:|---|
| `OperacaoLayout.tsx` | 11 | ✅ | Wrapper minimal. |
| `OperacaoHome.tsx` | 5 | ✅ | Stub passthrough para `<EventListWithPhase/>`. |
| `EventHub.tsx` | 225 | ⚠️ | 5 fases; **Montagem e Post são placeholders**; `confirm()` nativo em mudança de fase (L53). |
| `AcceptInvite.tsx` | 61 | ✅ | Fluxo terminal `setSession` + redirect. |
| `Atividade.tsx` | 156 | ✅ | Feed 7d/today/all. Queries sem `error` consumido. |
| `Dashboard.tsx` | 236 | ⚠️ | KPIs cross-evento; estado vazio confuso quando `filters.event=null` (L46). Botão "Exportar PDF" disabled como "Em breve" (L150). |
| `MyFrentes.tsx` | 157 | ⚠️ | Landing mobile. Sem botão voltar (esperado). Estado vazio sem CTA (L141). |
| `MinhasTarefas.tsx` | 198 | ⚠️ | 4 buckets. Sem loading explícito. Sem voltar. |
| `MeusChamados.tsx` | 84 | ⚠️ | 3 tabs. Sem voltar. |
| `ChamadoNovo.tsx` | 150 | ⚠️ | Form. **Sem botão voltar.** `media.insert` fire-and-forget. |
| `ChamadoDetail.tsx` | 191 | ⚠️ | Loading vs not-found ambíguo (L38). |
| `FrenteDetail.tsx` | 251 | ⚠️ | 3 tabs (Registos/Etapas/Chamados). **Tab "Registos" sem "+" — criação só via FAB global.** |
| `FrenteManage.tsx` | 211 | ⚠️ | Desktop-only com autosave. Terminologia mista (Frente vs Zona/Serviço). |
| `EtapaDetail.tsx` | 297 | ✅ | **Bug OP-9a fixed** (hook antes de early return + disambiguação FK). Único page a tratar `isLoading`/`error`/`!data` separadamente. |
| `StaffList.tsx` | 163 | ⚠️ | Filtros active/pending/archived. Edge case: invites `expired` órfãos somem da lista. |

---

## 1.3 Componentes em `src/components/operacao/` (36)

### Raiz (17)

| Path | LoC | Estado | Notas |
|---|---:|:---:|---|
| `AudioRecorder.tsx` | 111 | ⚠️ | `alert()` em mic denied (L51); upload error só `console.error`. |
| `EditEtapaSheet.tsx` | 292 | ⚠️ | `confirm()` eliminar (L166); save não-transacional. |
| `EtapaAssigneeAvatars.tsx` | 100 | ✅ | Presentation. "Zona/Serviço" hardcoded (L65). |
| `EtapaAssigneeSheet.tsx` | 251 | ⚠️ | Diff N inserts/updates/deletes em série sem rollback (L98). |
| `FrenteCard.tsx` | 121 | ⚠️ | **Expressão tautológica** em L53. |
| `FrentePickerDialog.tsx` | 49 | ✅ | OK. |
| `FrenteTeamSheet.tsx` | 94 | ✅ | Read-only sheet. |
| `FrenteTypeBadge.tsx` | 21 | ✅ | Atómico. |
| `MediaCapture.tsx` | 157 | ⚠️ | `MediaThumb` faz **side-effect em render** sem `useEffect` (L132-135) — antipattern. |
| `NewEtapaDialog.tsx` | 259 | ⚠️ | 4 queries sem `error`; insert etapa + M:N supplier não-transacional. |
| `NewFrenteDialog.tsx` | 179 | ⚠️ | Insert frente + setLead não-transacional. |
| `NewStaffDialog.tsx` | 86 | ✅ | OK. |
| `OperacaoStatusBadge.tsx` | 28 | ✅ | Fallback mostra enum técnico raw. |
| `PriorityBadge.tsx` | 32 | ✅ | Cores hardcoded fora do design-system. |
| `QuickActionFab.tsx` | 192 | ❌ | **Rules of Hooks violation**: L77 `if (hideFab) return null;` antes de `useQuery` L97. |
| `RegistroFeed.tsx` | 135 | ⚠️ | `MediaThumb`/`AudioPlayer` com useEffect sem cleanup. Lightbox fecha em qualquer clique. |
| `RegistroSheet.tsx` | 172 | ⚠️ | Insert registo + media não-transacional. `registroId` pode colidir entre aberturas. |

### `desktop/` (9)

| Path | LoC | Estado | Notas |
|---|---:|:---:|---|
| `EtapaInlineCell.tsx` | 84 | ⚠️ | Enter + Blur disparam `save()` duas vezes. |
| `EtapaKanban.tsx` | 130 | ⚠️ | Optimistic sem rollback real (só refetch). |
| `EtapaKanbanCard.tsx` | 97 | ✅ | OK. |
| `EtapaKanbanColumn.tsx` | 36 | ✅ | OK. |
| `EtapasTable.tsx` | 338 | ⚠️ | DnD reorder com N updates sem transação (L251). Suppliers query sem filtro `company_id` (L219). Sem confirmação ao arquivar (L162). |
| `FrenteCardDesktop.tsx` | 175 | 👻 | **Sem consumidor encontrado** (provável dead code). |
| `FrenteTeamEditor.tsx` | 193 | ⚠️ | `addMember` sem await + invalidate. |
| `KpiCard.tsx` | 32 | ✅ | OK. |
| `OperacaoFiltersBar.tsx` | 156 | ⚠️ | Selecciona primeiro evento em L56-60 sem dar opção "todos". |

### `event/` (7)

| Path | LoC | Estado | Notas |
|---|---:|:---:|---|
| `EditFrenteSheet.tsx` | 220 | ⚠️ | `confirm()` eliminar (L127); save+setLead não-transacional. |
| `EventListWithPhase.tsx` | 127 | ✅ | OK. Estado vazio com texto-link "vai a MP Gestão" não-clicável. |
| `EventTeamSection.tsx` | 423 | ⚠️ | **2× `confirm()` nativos** (L47, L349); insert member + zones não-transacional. |
| `EventoPhase.tsx` | 427 | ⚠️ | 6 `useQuery` em fluxo evento-ao-vivo, **nenhuma trata error**. `refetchInterval: 30s` falha silenciosa offline. |
| `FrentesPanel.tsx` | 258 | ⚠️ | **2 botões mortos** ("Indoor", "Conferência" → fallback "em breve" L73, L98-99). |
| `PhaseBadge.tsx` | 29 | ✅ | OK. Emojis em strings (acessibilidade). |
| `PlanejamentoPhase.tsx` | 287 | ⚠️ | Estado vazio com "← Voltar a Setup" — **único** com CTA empty-state bom. |

### `shared/` (1)

| Path | LoC | Estado | Notas |
|---|---:|:---:|---|
| `NewProfileInlineDialog.tsx` | 109 | ⚠️ | Race: depois de criar, faz select por email para obter `id` — pode falhar com "Perfil criado mas não encontrado". |

### `suppliers/` (3)

| Path | LoC | Estado | Notas |
|---|---:|:---:|---|
| `AddSupplierToEtapaDialog.tsx` | 195 | ⚠️ | Query suppliers sem filtro `company_id` (L35). Sem validação numérica. |
| `EditEtapaSupplierDialog.tsx` | 119 | ⚠️ | Sem validação numérica em `decidedAmount`. |
| `EtapaSuppliersPanel.tsx` | 187 | ⚠️ | `confirm()` ao remover (L48); sem optimistic. |

---

## 1.4 Hooks (4)

| Path | LoC | Propósito | Estado |
|---|---:|---|:---:|
| `useOperacaoFilters.ts` | 67 | Sync filtros (event, frentes, status, kind) ↔ URL search params | ✅ |
| `useOperacaoMode.ts` | 60 | Lê `events.operacao_mode` por eventId; staleTime 60s | ✅ |
| `useIsEventDirectorOnly.ts` | 34 | Flag director-only (forçar read-only em etapas) | ✅ |
| `useIsFieldStaffOnly.ts` | 27 | Flag `profile_type=field_staff` + única role `field_producer` | ✅ |

---

## 1.5 Telas órfãs / duplicações

### Órfãs (sem ponto de entrada visível)
- 👻 **`desktop/FrenteCardDesktop.tsx`** (175 LoC) — `grep -r "FrenteCardDesktop"` zero hits fora do próprio ficheiro. Foi substituído (provavelmente) pela combinação `FrenteCard` (mobile) + outro path. Marcar para descomissão.

### Duplicações estruturais
- **PALETTE de cores hardcoded** em 3 sítios (`NewFrenteDialog.tsx:16`, `EditFrenteSheet.tsx:17`, `event/FrentesPanel.tsx:21`) — deve ser const partilhada.
- **STATUS constants** ("pending/in_progress/blocked/done/cancelled") duplicadas em `EtapaKanban.tsx:11-16`, `OperacaoStatusBadge.tsx`, `OperacaoFiltersBar.tsx`, `MinhasTarefas.tsx`, `PlanejamentoPhase.tsx:17`.
- **Helper `frenteLabel`** existe em `src/lib/operacao-labels.ts` mas **apenas 2 dos 36 componentes o usam** (`PlanejamentoPhase.tsx:15`, `EditFrenteSheet.tsx:13`). Os outros 34 fazem `type === "zone" ? "Zona" : "Serviço"` inline.
- **JSX "← Voltar"** custom replicado em 10 sítios sem componente partilhado.

### Placeholders
- 🚧 **`EventHub.tsx:127`** — fase Montagem: `<PlaceholderPhase title="Montagem" text="Em breve: Gantt + acompanhamento no terreno." />`
- 🚧 **`EventHub.tsx:135`** — fase Fecho: `<PlaceholderPhase title="Fecho" text="Em breve: Pendências operacionais e lições." />`

---

## 1.6 Mapa de navegação

```
                    [/operacao]  (OperacaoHome — lista eventos)
                          |
                          | click evento
                          v
              [/operacao/:eventId]  (EventHub — 5 fases)
              /         |         |          |          \
        Setup     Planeamento   Montagem    Evento     Fecho
        (3 cards   (matriz       🚧         (live ops   🚧
        Equipa /   Zonas×Etapas) PLACE-     KPIs+feed)  PLACE-
        Zonas /                  HOLDER                 HOLDER
        Serviços)
                                       \
                                        v
                              [/operacao/frente/:id]  (FrenteDetail)
                               /          |          \
                          Tab Registos  Tab Etapas  Tab Chamados (cond.)
                                            |
                                            v
                                  [/operacao/etapa/:id]  (EtapaDetail)


  Cross-evento (sidebar / FAB):
  ┌────────────────────────────────────────────────────────┐
  │ /operacao/dashboard      cross-evento KPIs            │
  │ /operacao/equipa         (= MyFrentes — landing field)│
  │ /operacao/minhas-tarefas etapas onde o user é assignee│
  │ /operacao/chamados       chamados do user             │
  │ /operacao/atividade      feed registos                │
  │ /operacao/staff          gestão field staff           │
  │ /operacao/chamado/novo   form criar chamado           │
  │ /operacao/chamado/:id    detalhe chamado              │
  │ /operacao/frente/:id/manage editor desktop            │
  └────────────────────────────────────────────────────────┘

  Público:
  /operacao/accept-invite?token=...  (landing standalone, fora ProtectedLayout)
```

### Pontos de entrada confusos
1. **`/operacao` → lista de eventos** (correcto) mas **`/operacao/equipa` é landing alternativa para field staff** — não há sinalização de qual o user deve ver primeiro. `MyFrentes` é mobile-first; `OperacaoHome` é evento-first.
2. **Quem chega ao Dashboard?** `/operacao/dashboard` aparece na sidebar mas não é referenciado de `EventHub` (excepto link secundário "Ver Dashboard analítico" no `EventoPhase.tsx`). Para um director que vem do `EventHub`, precisa de saber que dashboard existe e onde fica.
3. **`/operacao/staff` é referenciado de**: `EventHub setup phase` ("Gerir Staff" L179), `MyFrentes.tsx:115`. Não na sidebar `inOperacao`.
4. **`QuickActionFab` é a única porta universal para criar Registo/Chamado/Etapa/Frente** — não há CTA visível em `FrenteDetail` tab Registos para criar registo (utilizadores podem assumir que a tab tem botão "+").

---

## 1.7 Cobertura por perfil

| Perfil (heurística) | Pages essenciais | Páginas que provavelmente não usa |
|---|---|---|
| **Admin / Manager** (`manage_operacao_*`) | EventHub, Dashboard, FrenteManage, StaffList, EtapaDetail, EventTeamSection | — |
| **Diretor do Evento** (`event_team_members.role='director'`) | EventHub (read-only em etapas), Dashboard, FrenteDetail | FrenteManage (sem perm), StaffList |
| **Produtor Geral** (`event_team_members.role='general_producer'`) | EventHub, MinhasTarefas, MeusChamados, EtapaDetail (escrita em zones ou full) | StaffList (a não ser que tenha `manage_operacao_staff`) |
| **Produtor de Zona/Serviço** (`operacao_frentes.current_lead_id`) | MyFrentes, FrenteDetail, EtapaDetail (escrita na sua frente), MeusChamados, Atividade | FrenteManage, StaffList |
| **Staff de campo** (`field_producer`) | MyFrentes (landing), Atividade, MeusChamados, ChamadoNovo, ChamadoDetail | Tudo o resto |

`useIsFieldStaffOnly` (`AppSidebar.tsx:47`) esconde sidebar não-operação quando user é só field staff — coerente. `useIsEventDirectorOnly` (`EtapaDetail.tsx:77`) força read-only — coerente.
