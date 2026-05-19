# 04 — Inconsistências UX

**Escopo:** padrões de UI repetidos com variações entre componentes — terminologia, navegação, botões, estados vazios, mobile/desktop. Cada item tem ID `OP-UX-XX` reutilizável em `05-priorizacao.md`.

Severidade: 🟧 P1 (atrapalha consumo) · 🟨 P2 (consistência / polish).

---

## 4.1 Terminologia — a mesma realidade com 5-6 nomes

A migração `Frente → Zona/Serviço` deixou strings legacy espalhadas. O helper `src/lib/operacao-labels.ts` existe (`frenteLabel(type)` devolve "Zona"/"Serviço"/"Frente"; `frenteLabelNeutral` devolve "Zonas/Serviços") mas **é usado em apenas 2 de 36 componentes** (`event/PlanejamentoPhase.tsx:15`, `event/EditFrenteSheet.tsx:13`).

### OP-UX-01 🟧 — "Frente" coexiste com "Zona/Serviço" em strings visíveis

Hardcoded "Frente":
- [NewFrenteDialog.tsx:79](../../../src/components/operacao/NewFrenteDialog.tsx) toast `"Frente criada, mas falhou ao atribuir produtor"`
- [FrentePickerDialog.tsx:35](../../../src/components/operacao/FrentePickerDialog.tsx) `"Sem frentes disponíveis."`
- [EtapaAssigneeSheet.tsx:172](../../../src/components/operacao/EtapaAssigneeSheet.tsx) `"Esta Frente ainda não tem equipa."`
- [OperacaoFiltersBar.tsx:96-115](../../../src/components/operacao/desktop/OperacaoFiltersBar.tsx) chips com `f.name` raw
- [FrenteManage.tsx:133](../../../src/pages/operacao/FrenteManage.tsx) `"Detalhes da Frente"`
- [Atividade.tsx](../../../src/pages/operacao/Atividade.tsx) `"frente"` (genérico)

Hardcoded "Zona"/"Serviço":
- [event/FrentesPanel.tsx:76](../../../src/components/operacao/event/FrentesPanel.tsx) `const label = type === "zone" ? "Zona" : "Serviço";` (duplica `frenteLabel`)
- [event/FrentesPanel.tsx:77](../../../src/components/operacao/event/FrentesPanel.tsx) `"Zonas físicas do evento"` / `"Serviços transversais do evento"`
- [NewFrenteDialog.tsx:114](../../../src/components/operacao/NewFrenteDialog.tsx) `<SelectItem value="zone">Zona</SelectItem>`
- [NewEtapaDialog.tsx:195](../../../src/components/operacao/NewEtapaDialog.tsx) `"Zona que atende"`
- [FrenteTypeBadge.tsx:18](../../../src/components/operacao/FrenteTypeBadge.tsx) hardcoded por design
- [FrenteManage.tsx:174-179](../../../src/pages/operacao/FrenteManage.tsx) — **mistura "Frente" e "Zona/Serviço" na mesma página**
- [EtapaAssigneeAvatars.tsx:65](../../../src/components/operacao/EtapaAssigneeAvatars.tsx) `"Zona/Serviço"`
- [EtapaDetail.tsx:123](../../../src/pages/operacao/EtapaDetail.tsx) `"Voltar à Zona/Serviço"`

**Impacto:** Director vê "Frente" num toast e "Zona/Serviço" no breadcrumb do mesmo evento. Documentação do produto fala em "Zona/Serviço" mas DB diz `operacao_frentes`.

**Fix esperado:** sweep `Frente → frenteLabel(type)` em todas as strings visíveis. Manter `Frente` em nomes técnicos internos. Custo M.

### OP-UX-02 🟧 — Mesma pessoa (`current_lead_id`) com 6 nomes diferentes

A pessoa responsável por uma frente é referida como:

| Termo | Ficheiro:linha | Contexto |
|---|---|---|
| **Lead** | [FrenteCard.tsx:71](../../../src/components/operacao/FrenteCard.tsx) | badge `LEAD` |
| **LEAD** | [desktop/FrenteCardDesktop.tsx:78](../../../src/components/operacao/desktop/FrenteCardDesktop.tsx) | badge uppercase |
| **Lead** | [event/EventoPhase.tsx:294](../../../src/components/operacao/event/EventoPhase.tsx) | label `"Lead: …"` |
| **Lead** | [FrenteTeamSheet.tsx:40](../../../src/components/operacao/FrenteTeamSheet.tsx) | role label |
| **Lead** | [desktop/FrenteTeamEditor.tsx:20](../../../src/components/operacao/desktop/FrenteTeamEditor.tsx) | dropdown opt |
| **Lead** | [event/PlanejamentoPhase.tsx:223](../../../src/components/operacao/event/PlanejamentoPhase.tsx) | label |
| **Responsável** | [EditEtapaSheet.tsx:223](../../../src/components/operacao/EditEtapaSheet.tsx) | label form |
| **Responsável (opcional)** | [NewEtapaDialog.tsx:196](../../../src/components/operacao/NewEtapaDialog.tsx) | label form |
| **Responsável** | [desktop/EtapasTable.tsx:294](../../../src/components/operacao/desktop/EtapasTable.tsx) | coluna tabela |
| **Sem responsável** | [event/PlanejamentoPhase.tsx:223](../../../src/components/operacao/event/PlanejamentoPhase.tsx), [EtapaAssigneeAvatars.tsx:51](../../../src/components/operacao/EtapaAssigneeAvatars.tsx) | estado |
| **Produtor responsável** | [NewFrenteDialog.tsx:138](../../../src/components/operacao/NewFrenteDialog.tsx) | label form |
| **Produtor de Zona / de Serviço** | [event/EditFrenteSheet.tsx:78](../../../src/components/operacao/event/EditFrenteSheet.tsx) | label form (dinâmico por type) |
| **Produtor Geral** | [event/EventTeamSection.tsx:69](../../../src/components/operacao/event/EventTeamSection.tsx) | role event_team_members |
| **Produtores Gerais** | [event/EventTeamSection.tsx:76](../../../src/components/operacao/event/EventTeamSection.tsx) | plural |
| **Diretor** | [event/EventTeamSection.tsx:66](../../../src/components/operacao/event/EventTeamSection.tsx), [EtapaDetail.tsx:120](../../../src/pages/operacao/EtapaDetail.tsx) | role event_team_members |

**Domínio real (3 conceitos):**
- **Diretor** — `event_team_members.role='director'` (read-only do evento)
- **Produtor Geral** — `event_team_members.role='general_producer'` (escreve em scope full ou zones)
- **Produtor de Zona/Serviço** — `operacao_frentes.current_lead_id` (lead da frente)
- **Responsável** — `operacao_etapas.responsible_profile_id` (de cada etapa específica)

Hoje o utilizador vê "Lead", "Produtor", "Responsável", "Produtor de Zona" sem perceber se são a mesma coisa.

**Fix esperado:** glossário canónico + sweep cross-codebase. Custo M.

### OP-UX-03 🟨 — "Frente" no path da URL vs label "Zona/Serviço"

- Rota: `/operacao/frente/:id` ([App.tsx:382](../../../src/App.tsx))
- Label na UI: "Zona" ou "Serviço" (conforme `type`)

Manter rota com `frente` é OK do ponto de vista da DB (`operacao_frentes`), mas há descalibração para utilizador que vê barra de endereço.

**Fix esperado:** v1 — manter URL, alinhar label. v2 — rota nova `/operacao/zona/:id` + redirect (já estava na proposta do audit redesign anterior).

---

## 4.2 Navegação

### OP-UX-04 🟧 — 4 padrões diferentes de "voltar"

Nenhum componente usa `<Breadcrumb>` shadcn (busca em `src/pages/operacao/` + `src/components/operacao/event/` → 0 hits).

| Padrão | Sítios | Comportamento |
|---|---|---|
| `← Voltar` custom (destino fixo) | EventHub (→ /operacao), EtapaDetail (→ /operacao/frente/:id), FrenteDetail (→ /operacao/equipa) | Determinístico |
| `← Voltar` custom (`navigate(-1)`) | Dashboard, StaffList, ChamadoDetail, Atividade | **History-based — pode levar fora de Operação** |
| Breadcrumb fake (texto sem link) | FrenteManage `"Operação › {nome} › Gerir"` | Não-clicável (excepto botão "Voltar" separado) |
| Nada | OperacaoHome, OperacaoLayout, MyFrentes, MinhasTarefas, MeusChamados, ChamadoNovo, AcceptInvite | Só sticky header — sem voltar |

**Bugs concretos:**
- `Dashboard.tsx:134` chama `navigate(-1)` — se utilizador veio de fora do módulo, sai para outro módulo. Quebra mental model.
- `StaffList.tsx:91` idem.
- **`ChamadoNovo` não tem voltar** — utilizador fica preso até completar form ou navegar via header/sidebar/FAB.
- **`MinhasTarefas` / `MeusChamados` sem voltar** — landing-like mas sem ligações cruzadas para `/operacao/equipa`.

**Fix esperado:**
1. Extrair `<OpBackButton/>` componente partilhado (10 sítios duplicam o JSX).
2. Trocar `navigate(-1)` por destinos fixos (`/operacao` ou contextual).
3. Adicionar voltar em `ChamadoNovo`, `MeusChamados`, `MinhasTarefas` (rota destino: `/operacao/equipa`).
Custo S total.

### OP-UX-05 🟨 — `EventHub` "← Eventos" não usa header app-level

EventHub tem sticky header próprio (`EventHub.tsx:70`) que duplica o header global. Deveria reaproveitar `<PageHeader/>` (se existir no design-system) ou pelo menos ter consistência visual com `EventDetail` (que segue padrão MP Gestão).

---

## 4.3 Padrões de botões

### OP-UX-06 🟨 — Variants inconsistentes para ações equivalentes

Botão "Concluir/Resolver":
- [EventoPhase.tsx:277](../../../src/components/operacao/event/EventoPhase.tsx) `variant="secondary"` para "Em curso"
- [EventoPhase.tsx:281](../../../src/components/operacao/event/EventoPhase.tsx) `variant="default"` para "Resolver"
- [EventoPhase.tsx:366](../../../src/components/operacao/event/EventoPhase.tsx) `variant="outline"` para "Concluir" etapa
- [EtapaDetail.tsx:192](../../../src/pages/operacao/EtapaDetail.tsx) `variant="default"` para "Concluir"
- [ChamadoDetail.tsx:107](../../../src/pages/operacao/ChamadoDetail.tsx) `variant="default"` para "Resolver"

Botão "Cancelar" em dialogs/sheets:
- `variant="outline"` em 5 sítios
- **Botão único full-width sem cancelar** em [NewEtapaDialog.tsx:242](../../../src/components/operacao/NewEtapaDialog.tsx), [NewFrenteDialog.tsx:162](../../../src/components/operacao/NewFrenteDialog.tsx), [NewProfileInlineDialog.tsx:101](../../../src/components/operacao/shared/NewProfileInlineDialog.tsx) — utilizador tem de clicar X ou clicar fora

**Fix esperado:** documentar contract de variants no design-system (`default`=primary action, `secondary`=transition, `outline`=cancel, `destructive`=delete) e refactorar. Custo M.

### OP-UX-07 🟨 — Texto de criação com 7+ variações

Para "criar X":
- "Criar"
- "Adicionar"
- "+ Adicionar"
- "+ Nova Pessoa…"
- "+ Adicionar a primeira."
- "Nova Etapa"
- "Criar Zona" / "Criar Serviço"
- "+ Zona/Serviço"

**Fix esperado:** convenção: "Nova {coisa}" sempre. Custo S.

### OP-UX-08 🟨 — Posições e altura de footers de dialog inconsistentes

- Alguns `<DialogFooter>` com 2 botões à direita (`AddSupplierToEtapaDialog`, `NewStaffDialog`, `EditEtapaSupplierDialog`)
- Outros `<Button className="w-full">` sem footer (`NewEtapaDialog`, `NewFrenteDialog`, `NewProfileInlineDialog`)
- Sheets têm footer sticky com Save+Delete misturados (`EditEtapaSheet`, `EditFrenteSheet`)

**Fix esperado:** padrão único — DialogFooter com Cancel (outline) + Save (default) à direita. Sheets podem ter Delete num separator visual. Custo S.

---

## 4.4 Estados vazios

Dos **17 estados vazios** identificados no módulo (lista completa em `01-inventario-telas.md` e `agent B`), **apenas 3 têm CTA efectiva**:

| Path | Mensagem | CTA |
|---|---|---|
| [event/PlanejamentoPhase.tsx:99-103](../../../src/components/operacao/event/PlanejamentoPhase.tsx) | "Não há Zonas nem Serviços." | ✅ "← Voltar a Setup" |
| [event/FrentesPanel.tsx:109](../../../src/components/operacao/event/FrentesPanel.tsx) | "Sem zonas ainda." | ✅ Botão `+` no header |
| [event/PlanejamentoPhase.tsx:248](../../../src/components/operacao/event/PlanejamentoPhase.tsx) | "Sem etapas. + Adicionar a primeira." | Quasi-CTA (linha clicável se canManage) |

Sem CTA (14 sítios):
- "Sem frentes disponíveis." ([FrentePickerDialog.tsx:35](../../../src/components/operacao/FrentePickerDialog.tsx))
- "Sem equipa atribuída." ([FrenteTeamSheet.tsx:88](../../../src/components/operacao/FrenteTeamSheet.tsx))
- "Esta Frente ainda não tem equipa." ([EtapaAssigneeSheet.tsx:171](../../../src/components/operacao/EtapaAssigneeSheet.tsx))
- "Sem registos." ([RegistroFeed.tsx:55](../../../src/components/operacao/RegistroFeed.tsx))
- "Sem etapas." ([EtapasTable.tsx:304](../../../src/components/operacao/desktop/EtapasTable.tsx))
- "Sem membros." ([FrenteTeamEditor.tsx:142](../../../src/components/operacao/desktop/FrenteTeamEditor.tsx))
- "Sem atividade recente" ([FrenteCardDesktop.tsx:113](../../../src/components/operacao/desktop/FrenteCardDesktop.tsx) — órfão)
- "Sem membros atribuídos." ([EventTeamSection.tsx:81](../../../src/components/operacao/event/EventTeamSection.tsx))
- "Sem zonas no evento." ([EventTeamSection.tsx:260,392](../../../src/components/operacao/event/EventTeamSection.tsx))
- "Não há eventos para mostrar. Vai a MP Gestão para criar." ([EventListWithPhase.tsx:93](../../../src/components/operacao/event/EventListWithPhase.tsx) — **link texto não-clicável**)
- "🎉 Tudo sob controlo. Nenhum chamado aberto." ([EventoPhase.tsx:233](../../../src/components/operacao/event/EventoPhase.tsx) — positivo, sem CTA é OK)
- "Nenhuma etapa em curso." ([EventoPhase.tsx:335](../../../src/components/operacao/event/EventoPhase.tsx))
- "Nenhum fornecedor atribuído. Toca em + para adicionar." ([EtapaSuppliersPanel.tsx:71](../../../src/components/operacao/suppliers/EtapaSuppliersPanel.tsx) — instrução texto sem ligação)
- "Sem atividade no período." ([Atividade.tsx:90-92](../../../src/pages/operacao/Atividade.tsx))
- "Sem chamados." ([MeusChamados.tsx:64](../../../src/pages/operacao/MeusChamados.tsx))
- "Sem tarefas atribuídas a ti." ([MinhasTarefas.tsx:147-148](../../../src/pages/operacao/MinhasTarefas.tsx))
- "Ainda não fazes parte de nenhuma Frente. Pede ao coordenador para te adicionar." ([MyFrentes.tsx:141](../../../src/pages/operacao/MyFrentes.tsx))

### OP-UX-09 🟧 — Estados vazios sem CTA frustram primeiros utilizadores

**Impacto:** novos directors e produtores ficam parados na primeira tela vazia. Mais grave em:
- `MyFrentes` "Ainda não fazes parte de nenhuma Frente" — staff de campo a abrir o app pela 1ª vez fica sem saber o que fazer (mensagem indica esperar acção externa, mas não há atalho para contactar coordenador).
- `EventTeamSection` "Sem membros atribuídos" — director sem saber se tem permissão para criar.

**Fix esperado:** padrão de `<EmptyState/>` shadcn com ícone + mensagem + CTA. Custo M.

### OP-UX-10 🟨 — `EventListWithPhase` empty-state com link texto não-clicável

[EventListWithPhase.tsx:93](../../../src/components/operacao/event/EventListWithPhase.tsx) — texto diz "Vai a MP Gestão para criar" mas é só texto, não há `<Link to="/eventos">`.

**Fix esperado:** transformar em CTA real. Custo XS.

---

## 4.5 Loading states inconsistentes

Não há padrão de loading. Inventário:

| Padrão | Sítios |
|---|---|
| `"A carregar..."` texto simples | EventHub (L64), AcceptInvite, Atividade (L88), ChamadoDetail (L38 ambíguo), EtapaDetail (L80), FrenteDetail (L110 ambíguo), FrenteManage (L111), MeusChamados (L62), MyFrentes (L138), Dashboard implícito |
| `<Loader2 animate-spin>` | AcceptInvite (L37) |
| `<Skeleton>` shadcn | **0 sítios** |
| Sem loading explícito (mostra vazio) | MinhasTarefas, StaffList, queries internas |

### OP-UX-11 🟨 — Loading text inconsistente, sem skeletons

**Fix esperado:** padronizar — texto simples para early returns, `<Skeleton>` para listas, `<Loader2>` para botões em mid-action. Custo M.

---

## 4.6 Mobile vs Desktop

Apenas **1 página** usa `useIsMobile` (`FrenteManage.tsx:6,31`). Nenhum dos 36 componentes em `src/components/operacao/` usa o hook.

### OP-UX-12 🟧 — Split mobile/desktop é estrutural (componentes diferentes), não dinâmico

Estratégia actual:
- `FrenteCard` (mobile) vs `desktop/FrenteCardDesktop` (desktop órfão)
- `OperacaoFiltersBar` (desktop layout, sem versão mobile)
- `EtapasTable` (desktop) — sem equivalente para mobile (não há vista de etapas-da-frente em formato cards)
- `EtapaKanban` (desktop) — kanban DnD não funciona em touch sem adaptação

**Impacto operacional:** director que abre `/operacao/dashboard` em telemóvel vê layout desktop comprimido (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6` — não tem versão mobile-first).

**Fix esperado:** `useIsMobile` em Dashboard/Kanban para renderizar fallback cards. Custo M.

### OP-UX-13 🟨 — `FrenteCardDesktop.tsx` órfão (sem consumidor)

Já listado em `01-inventario-telas.md` (👻). Custo XS (descomissionar).

### OP-UX-14 🟧 — `FrenteManage` força desktop, mas sem fallback úvel em mobile

[FrenteManage.tsx:38-43](../../../src/pages/operacao/FrenteManage.tsx) — useEffect redireciona mobile para `/operacao/frente/:id` com toast "Editor disponível só em desktop". Mas em festival, director pode estar em telemóvel a precisar de reordenar etapas.

**Fix esperado:** acções essenciais (reordenar, editar nome) em modo mobile compacto. Custo L.

---

## 4.7 Cores / design tokens

### OP-UX-15 🟨 — Cores hardcoded vs design system

Fallback `#6b7280` (gray-500) em [FrenteCard.tsx:63](../../../src/components/operacao/FrenteCard.tsx), [desktop/FrenteCardDesktop.tsx:84](../../../src/components/operacao/desktop/FrenteCardDesktop.tsx), [EventHub.tsx:214](../../../src/pages/operacao/EventHub.tsx).

`PriorityBadge` ([PriorityBadge.tsx:4-7](../../../src/components/operacao/PriorityBadge.tsx)) usa `bg-red-500`/`bg-orange-500` directos em vez de `bg-destructive`/`bg-warning` do design system.

`KpiMini` em [EventoPhase.tsx:412](../../../src/components/operacao/event/EventoPhase.tsx) usa `border-destructive/60` mas mistura com classes literais.

`PALETTE` duplicado em 3 ficheiros (já mencionado em inventário).

**Fix esperado:** auditoria de tokens + sweep `bg-red-500 → bg-destructive`, etc. Custo M.

### OP-UX-16 🟨 — Emojis em badges

[PhaseBadge.tsx:7-11](../../../src/components/operacao/event/PhaseBadge.tsx) usa emojis `⚙️🎯🔧🎤📦` como prefixo dos labels.

**Impacto:** acessibilidade (screen readers ler emoji como nome próprio); inconsistente com MP Gestão (não usa).

**Fix esperado:** ícones Lucide. Custo XS.

---

## 4.8 Tabs / agrupamento de informação

### OP-UX-17 🟨 — `MeusChamados` tem 3 tabs (Abertos / Em curso / Resolvidos)…
…mas `MinhasTarefas` agrupa por 4 buckets visuais (Em curso / Pendentes / Bloqueadas / Concluídas hoje) sem tabs.

**Inconsistência:** mesma natureza de informação (lista de items com status), apresentação diferente. Utilizador precisa de aprender 2 padrões.

**Fix esperado:** unificar — Tabs com contadores para ambas, ou buckets visuais para ambas. Custo S.

### OP-UX-18 🟨 — `FrenteDetail` tem 3 tabs (Registos / Etapas / Chamados) mas a tab Chamados é condicional

[FrenteDetail.tsx:107](../../../src/pages/operacao/FrenteDetail.tsx) — `showChamadosTab = mode === "evento" || mode === "post" || hasOpenChamados`.

**Impacto:** durante fase "planning" ou "montagem" sem chamados abertos, a tab esconde-se. Utilizador que ontem viu 3 tabs hoje vê 2 e pensa que está noutra página.

**Fix esperado:** mostrar sempre, com badge `0`. Custo XS.

---

## 4.9 FAB e ações universais

### OP-UX-19 🟧 — `QuickActionFab` esconde-se em vários paths sem indicar alternativa

[QuickActionFab.tsx:71-80](../../../src/components/operacao/QuickActionFab.tsx) — `hideFab=true` em:
- `/operacao/chamado/novo`
- `/operacao/accept-invite`
- algumas outras (verificar regex L34-35)

**Impacto:** Em `/operacao/chamado/novo`, FAB desaparece (correcto — utilizador já está a criar). Mas em outros paths o critério de hide não é óbvio.

**Fix esperado:** documentar comportamento + decidir consistência. Custo XS.

### OP-UX-20 🟨 — FAB de incidente em `EventoPhase` duplica acção do FAB global

[EventoPhase.tsx:383-393](../../../src/components/operacao/event/EventoPhase.tsx) — FAB vermelho "Novo incidente" sobrepõe-se ao FAB universal (que está em `OperacaoLayout`). Ambos abrem `RegistroSheet` mas com `initialKind` diferente.

**Impacto:** dois FABs visíveis em simultâneo na fase Evento — confusão visual.

**Fix esperado:** suprimir FAB universal na fase Evento, ou dar `initialKind='chamado'` ao FAB global quando active phase = `evento`. Custo S.

---

## 4.10 Outras inconsistências

### OP-UX-21 🟨 — `EventTeamSection` aparece em Setup mas era antes em EventDetail

Migração OP-1b moveu `EventTeamSection` de `/eventos/:id` (MP Gestão) para Setup do EventHub. Director que tinha hábito de gerir equipa em EventDetail precisa de aprender novo caminho.

**Fix esperado:** banner em EventDetail apontando para EventHub (já mencionado em mp-operacao-hub.md como feito, validar). Custo XS verify.

### OP-UX-22 🟨 — Strings "ACK", "SLA breaches" em inglês misturadas com PT

[ChamadoDetail.tsx:101](../../../src/pages/operacao/ChamadoDetail.tsx) — botão "ACK".
[Dashboard.tsx](../../../src/pages/operacao/Dashboard.tsx) — "SLA breaches".

**Fix esperado:** traduzir ou manter intencionalmente como termos técnicos (decisão produto). Custo XS.

### OP-UX-23 🟨 — Texto "A carregar..." em sítios diferentes com pontuação diferente

`"A carregar..."` (com 3 pontos) vs `"A carregar…"` (ellipsis Unicode) — usado misturado. Decision de design system + sweep. Custo XS.

---

## Sumário

| Categoria | P1 🟧 | P2 🟨 | Total |
|---|---:|---:|---:|
| Terminologia | 2 | 1 | 3 |
| Navegação | 1 | 1 | 2 |
| Botões | 0 | 3 | 3 |
| Estados vazios | 1 | 1 | 2 |
| Loading | 0 | 1 | 1 |
| Mobile/desktop | 2 | 1 | 3 |
| Cores/design | 0 | 2 | 2 |
| Tabs | 0 | 2 | 2 |
| FAB | 1 | 1 | 2 |
| Outras | 0 | 3 | 3 |
| **TOTAL** | **7** | **16** | **23** |

**Bottom line UX:** o módulo funciona mas é inconsistente em quase todos os eixos. Maior dor: terminologia (Frente/Zona/Serviço/Lead/Responsável/Produtor) e ausência de CTA em 14 estados vazios. Frustração mais perigosa no Coala: FAB duplicado em `EventoPhase` e split mobile/desktop sem `useIsMobile`.
