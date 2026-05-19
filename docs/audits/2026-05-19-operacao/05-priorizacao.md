# 05 — Priorização

Backlog ordenado por P0/P1/P2 + agrupamento em sprints lógicos. Cada item: descrição curta, ficheiros afetados, esforço (XS/S/M/L), perfil mais afectado.

- **P0** — bloqueia uso no Coala (28 maio, 9 dias)
- **P1** — atrapalha mas evento dá para correr
- **P2** — pós-Coala (refactor / polish)

Esforço: **XS** ≤ 1h · **S** 1-4h · **M** 4h-1d · **L** 1-2d.

---

## P0 — Bloquear antes do Coala (9 dias)

| ID | Item | Ficheiros | Esforço | Perfil afectado |
|---|---|---|---|---|
| **OP-ERR-01** | **`QuickActionFab` Rules of Hooks** — `useQuery` após early return; pode crashar app | [QuickActionFab.tsx:77,97](../../../src/components/operacao/QuickActionFab.tsx) | **XS** | TODOS |
| **OP-ERR-03** | **Templates "Indoor" / "Conferência" mortos** — esconder até implementar | [event/FrentesPanel.tsx:73,98-99](../../../src/components/operacao/event/FrentesPanel.tsx) | **XS** | Admin (setup) |
| **OP-ERR-14** | **`EventoPhase` 6 queries sem error handling** com `refetchInterval: 30s` — feed live silencioso offline | [event/EventoPhase.tsx:46,65,68,90,107,119,122,135,138](../../../src/components/operacao/event/EventoPhase.tsx) | **S** | Diretor / Produtor Geral (evento) |
| **OP-ERR-12** | **`RegistroSheet` insert registo+media não-transacional** — staff perde foto em rede instável | [RegistroSheet.tsx:88,103](../../../src/components/operacao/RegistroSheet.tsx) | **S** | Staff de campo |
| **OP-FEAT-A** | **EventoPhase: refresh manual** — botão refresh + indicador "última actualização há X" | [event/EventoPhase.tsx](../../../src/components/operacao/event/EventoPhase.tsx) | **S** | Diretor (evento) |
| **OP-FEAT-B** | **Montagem phase: mínimo viável** — listar etapas por frente com filtro status (clonar fase Planeamento sem placeholder) | [EventHub.tsx:127](../../../src/pages/operacao/EventHub.tsx) + componente novo `MontagemPhase` | **M-L** | Diretor / Produtor Geral |
| **OP-ERR-05** | **Tab Registos sem CTA "+"** — adicionar botão "Novo Registo" no header da tab | [FrenteDetail.tsx:159](../../../src/pages/operacao/FrenteDetail.tsx) | **S** | Produtor de Zona |
| **OP-UX-09** | **MyFrentes empty-state sem CTA** — primeiro uso de staff de campo: dar atalho de contacto coordenador (WhatsApp link?) ou re-convite | [MyFrentes.tsx:141](../../../src/pages/operacao/MyFrentes.tsx) | **S** | Staff de campo (onboarding) |

**Total P0:** 8 itens, esforço agregado ~**3-4 dias** (1 dev fulltime). Possível em 9 dias com folga.

---

## P1 — Atrapalha mas dá para correr o evento

| ID | Item | Ficheiros | Esforço |
|---|---|---|---|
| OP-ERR-02 | `MediaCapture.MediaThumb` side-effect em render → `useEffect` | [MediaCapture.tsx:132](../../../src/components/operacao/MediaCapture.tsx) | XS |
| OP-ERR-06 | `ChamadoDetail` loading vs not-found ambíguo | [ChamadoDetail.tsx:38](../../../src/pages/operacao/ChamadoDetail.tsx) | XS |
| OP-ERR-07 | `FrenteDetail` mesmo padrão | [FrenteDetail.tsx:110](../../../src/pages/operacao/FrenteDetail.tsx) | XS |
| OP-ERR-08 | `NewFrenteDialog` insert+setLead não-transacional | [NewFrenteDialog.tsx:56-86](../../../src/components/operacao/NewFrenteDialog.tsx) | S |
| OP-ERR-09 | `NewEtapaDialog` insert+supplier M:N não-transacional | [NewEtapaDialog.tsx:105-140](../../../src/components/operacao/NewEtapaDialog.tsx) | S |
| OP-ERR-10 | `EtapaAssigneeSheet` diff sem rollback | [EtapaAssigneeSheet.tsx:98](../../../src/components/operacao/EtapaAssigneeSheet.tsx) | M (RPC) |
| OP-ERR-11 | `EventTeamSection` member+zones não-transacional + duplicate-key frágil | [event/EventTeamSection.tsx:180,324](../../../src/components/operacao/event/EventTeamSection.tsx) | M (RPC) |
| OP-ERR-15 | `Dashboard` zeros sem CTA quando `filters.event=null` | [Dashboard.tsx:46](../../../src/pages/operacao/Dashboard.tsx) | S |
| OP-ERR-17 | `EventHub` confirm() nativo na mudança fase → AlertDialog | [EventHub.tsx:53](../../../src/pages/operacao/EventHub.tsx) | S |
| OP-ERR-18 | `EditEtapaSheet` confirm() eliminar | [EditEtapaSheet.tsx:166](../../../src/components/operacao/EditEtapaSheet.tsx) | S |
| OP-ERR-19 | `EditFrenteSheet` confirm() eliminar com cascade | [event/EditFrenteSheet.tsx:127](../../../src/components/operacao/event/EditFrenteSheet.tsx) | S |
| OP-ERR-24 | `ChamadoNovo` sem gate UI | [ChamadoNovo.tsx](../../../src/pages/operacao/ChamadoNovo.tsx) | XS |
| OP-ERR-25 | `ChamadoDetail` botões Iniciar/Resolver sem gate UI | [ChamadoDetail.tsx:100-107](../../../src/pages/operacao/ChamadoDetail.tsx) | S |
| OP-ERR-26 | `EtapasTable`/`AddSupplierToEtapaDialog` query suppliers sem filtro company_id | [desktop/EtapasTable.tsx:219](../../../src/components/operacao/desktop/EtapasTable.tsx), [suppliers/AddSupplierToEtapaDialog.tsx:35](../../../src/components/operacao/suppliers/AddSupplierToEtapaDialog.tsx) | XS |
| OP-UX-01 | Terminologia Frente vs Zona/Serviço — sweep para `frenteLabel` | ~17 ficheiros | M |
| OP-UX-02 | Termos "Lead / Responsável / Produtor de Zona / Produtor Geral / Diretor" — glossário + sweep | ~15 ficheiros | M |
| OP-UX-04 | Padrões de "voltar" — componente partilhado + destinos fixos + adicionar voltar a ChamadoNovo/MeusChamados/MinhasTarefas | ~10 ficheiros | S |
| OP-UX-12 | Mobile vs desktop — `useIsMobile` em Dashboard | [Dashboard.tsx](../../../src/pages/operacao/Dashboard.tsx) | M |
| OP-UX-14 | `FrenteManage` mobile — acções essenciais em modo mobile | [FrenteManage.tsx](../../../src/pages/operacao/FrenteManage.tsx) | L |
| OP-UX-19 | `QuickActionFab` hide rules — documentar comportamento | [QuickActionFab.tsx:71-80](../../../src/components/operacao/QuickActionFab.tsx) | XS |
| OP-UX-20 | FAB duplicado na fase Evento — esconder global ou unificar | [event/EventoPhase.tsx:383](../../../src/components/operacao/event/EventoPhase.tsx) + [OperacaoLayout.tsx](../../../src/pages/operacao/OperacaoLayout.tsx) | S |
| OP-FEAT-C | Padrão `<EmptyState/>` com ícone+mensagem+CTA aplicado aos 14 empty-states sem CTA | cross-cutting | M |

**Total P1:** 22 itens, esforço agregado ~**8-10 dias** (1 dev fulltime).

---

## P2 — Pós-Coala (refactor / polish)

| ID | Item | Ficheiros | Esforço |
|---|---|---|---|
| OP-ERR-04 | Dashboard "Exportar PDF" disabled — esconder até existir | [Dashboard.tsx:150](../../../src/pages/operacao/Dashboard.tsx) | XS |
| OP-ERR-13 | `EtapasTable.onDragEnd` N updates sem transação → RPC reorder | [desktop/EtapasTable.tsx:251](../../../src/components/operacao/desktop/EtapasTable.tsx) | S |
| OP-ERR-16 | Queries sem error — wrapper `useOpQuery` | cross-cutting | M |
| OP-ERR-20 | `EventTeamSection.confirm()` remover member (top) | [event/EventTeamSection.tsx:47](../../../src/components/operacao/event/EventTeamSection.tsx) | S |
| OP-ERR-21 | Idem (sheet) | [event/EventTeamSection.tsx:349](../../../src/components/operacao/event/EventTeamSection.tsx) | S |
| OP-ERR-22 | `EtapaSuppliersPanel.confirm()` remover fornecedor | [suppliers/EtapaSuppliersPanel.tsx:48](../../../src/components/operacao/suppliers/EtapaSuppliersPanel.tsx) | S |
| OP-ERR-23 | `AudioRecorder.alert()` → toast | [AudioRecorder.tsx:51](../../../src/components/operacao/AudioRecorder.tsx) | XS |
| OP-ERR-27 | `viewer` permissão coerência | migration | XS |
| OP-ERR-29 | `EtapaInlineCell` duplo-save Enter+Blur | [desktop/EtapaInlineCell.tsx:70-73](../../../src/components/operacao/desktop/EtapaInlineCell.tsx) | XS |
| OP-ERR-30 | `EtapaKanban` optimistic rollback real | [desktop/EtapaKanban.tsx:95](../../../src/components/operacao/desktop/EtapaKanban.tsx) | S |
| OP-ERR-31 | `RegistroFeed` lightbox fecha em controlos vídeo | [RegistroFeed.tsx:114](../../../src/components/operacao/RegistroFeed.tsx) | XS |
| OP-ERR-32 | `MyFrentes` push prompt cleanup async | [MyFrentes.tsx:18-30](../../../src/pages/operacao/MyFrentes.tsx) | XS |
| OP-ERR-33 | `NewProfileInlineDialog` race lookup pós-create | [shared/NewProfileInlineDialog.tsx:46-50](../../../src/components/operacao/shared/NewProfileInlineDialog.tsx) | XS |
| OP-ERR-34 | `FrenteCard` expressão tautológica | [FrenteCard.tsx:53](../../../src/components/operacao/FrenteCard.tsx) | XS |
| OP-ERR-35 | `Dashboard period="all"` data 9999d | [Dashboard.tsx:40](../../../src/pages/operacao/Dashboard.tsx) | XS |
| OP-ERR-36 | `OperacaoFiltersBar` sem opção "Todos os eventos" | [desktop/OperacaoFiltersBar.tsx:56](../../../src/components/operacao/desktop/OperacaoFiltersBar.tsx) | XS |
| OP-ERR-37 | `event_team_members` FORCE RLS | migration | XS |
| OP-ERR-38 | `event_team_member_zones` RESTRICTIVE policy | migration | S |
| OP-ERR-39 | Migrations duplicadas — documentar | docs | XS |
| OP-UX-03 | Rota `/operacao/frente/:id` → `/operacao/zona/:id` (com redirect) | App.tsx + components | M |
| OP-UX-05 | `EventHub` header reaproveitar `<PageHeader/>` | [EventHub.tsx:70](../../../src/pages/operacao/EventHub.tsx) | S |
| OP-UX-06 | Variants de botões — contrato no design-system | cross-cutting | M |
| OP-UX-07 | Texto criação "Novo {coisa}" unificado | cross-cutting | S |
| OP-UX-08 | DialogFooter padrão Cancel+Save | ~5 componentes | S |
| OP-UX-10 | `EventListWithPhase` link texto → CTA real | [event/EventListWithPhase.tsx:93](../../../src/components/operacao/event/EventListWithPhase.tsx) | XS |
| OP-UX-11 | Loading skeletons | cross-cutting | M |
| OP-UX-13 | `FrenteCardDesktop.tsx` órfão — descomissionar | [desktop/FrenteCardDesktop.tsx](../../../src/components/operacao/desktop/FrenteCardDesktop.tsx) | XS |
| OP-UX-15 | Cores hardcoded → design tokens | cross-cutting | M |
| OP-UX-16 | Emojis em `PhaseBadge` → ícones Lucide | [event/PhaseBadge.tsx:7-11](../../../src/components/operacao/event/PhaseBadge.tsx) | XS |
| OP-UX-17 | `MeusChamados` vs `MinhasTarefas` — padrão único de agrupamento | 2 ficheiros | S |
| OP-UX-18 | `FrenteDetail` tab Chamados sempre visível com badge 0 | [FrenteDetail.tsx:107](../../../src/pages/operacao/FrenteDetail.tsx) | XS |
| OP-UX-21 | EventDetail banner→EventHub validar | [EventDetail.tsx](../../../src/pages/EventDetail.tsx) | XS verify |
| OP-UX-22 | "ACK"/"SLA breaches" tradução | cross-cutting | XS |
| OP-UX-23 | "A carregar..." vs "…" — uniformizar | cross-cutting | XS |
| OP-FEAT-D | Burndown chart (decidir v1 ou v2) | feature nova | L |
| OP-FEAT-E | Fase Fecho — relatório final + lições | [EventHub.tsx:134](../../../src/pages/operacao/EventHub.tsx) + componente novo | L |

**Total P2:** 36 itens, esforço agregado ~**12-15 dias**.

---

## Agrupamento em sprints lógicos

### OP-10 — Pré-Coala (9 dias, P0)
- **Objectivo:** garantir que o evento corre sem crashes nem dados perdidos.
- **Itens:** todos os P0 (8 itens, ~3-4 dias dev).
- **Critério de pronto:** fluxos A, D, E, F funcionam ponta-a-ponta sem ❌.
- **Recomendação:** **Lovable** para tudo excepto Montagem phase (M-L); essa para Claude Code se requer DB.

### OP-11 — Estabilidade pós-Coala fase 1 (2-3 sprints curtas)
- **Sprint OP-11.1 — Transacionalidade** (4-5 dias)
  - OP-ERR-08, 09, 10, 11, 12, 13 (RPCs server-side para todos os multi-step writes)
  - **Claude Code** (DB-heavy)
- **Sprint OP-11.2 — Confirmações + gates** (3-4 dias)
  - OP-ERR-17, 18, 19, 20, 21, 22, 23 (`confirm()` → AlertDialog)
  - OP-ERR-24, 25 (gates UI)
  - **Lovable** (UI)
- **Sprint OP-11.3 — Loading + estados vazios** (2-3 dias)
  - OP-FEAT-C (`<EmptyState/>` aplicado aos 14 sítios)
  - OP-UX-11 (skeletons)
  - OP-ERR-06, 07 (loading vs not-found)
  - OP-ERR-15 (Dashboard CTA)
  - **Lovable** (UI heavy)

### OP-12 — Terminologia (1 sprint, 4-5 dias)
- **Objectivo:** glossário canónico + sweep cross-codebase.
- **Itens:** OP-UX-01, 02, 03 (decisão de rota).
- **Critério de pronto:** glossário em docs/features + 0 ocorrências de "Frente" em strings visíveis (excepto onde for nome técnico justificado).
- **Recomendação:** **Misto** — glossário Claude Code, sweep Lovable.

### OP-13 — Navegação (1 sprint, 2-3 dias)
- **Objectivo:** voltar consistente, FAB sem duplicação.
- **Itens:** OP-UX-04 (`<OpBackButton/>` + destinos fixos), OP-UX-20 (FAB duplicado), OP-UX-19 (hide rules).
- **Recomendação:** **Lovable**.

### OP-14 — Mobile fix (1-2 sprints, 5-7 dias)
- **Objectivo:** Dashboard usável em mobile; FrenteManage com modo mobile compacto.
- **Itens:** OP-UX-12, OP-UX-14.
- **Recomendação:** **Lovable** (responsive heavy).

### OP-15 — Polish (1 sprint, 3-4 dias)
- **Itens:** todos os P2 XS/S restantes (cores, variants, emojis, redundâncias).
- **Recomendação:** **Lovable** (refactor estético).

### OP-16 — Features novas (paralelo)
- **OP-FEAT-D** Burndown chart (L)
- **OP-FEAT-E** Fase Fecho (L)
- Cada uma como sprint dedicada.

---

## Roadmap sugerido (linha temporal)

```
  Hoje      19 mai 2026                                  28 mai (Coala)
  |                                                        |
  v                                                        v
  [─── OP-10 P0 (3-4 dias) ───][buffer 4-5 dias para testes]
                                                           [Coala]
                                                           [post-Coala 30 mai+]
                                  [── OP-11.1 transacionalidade ──][OP-11.2 confirmações][OP-11.3 estados]
                                                                  [── OP-12 terminologia ──][OP-13 nav]
                                                                                        [── OP-14 mobile ──]
                                                                                                          [OP-15 polish]
                                                                                                          [OP-16 features novas]
```

---

## Recomendação de ordem nos 9 dias até Coala

**Dia 1-2** (urgente):
1. **OP-ERR-01** FAB hooks — XS, **dia 1**.
2. **OP-ERR-03** Templates mortos — XS, **dia 1**.
3. **OP-ERR-14** EventoPhase error handling — S, **dia 1-2**.

**Dia 2-4** (alta prioridade):
4. **OP-FEAT-A** Refresh manual EventoPhase — S, **dia 2**.
5. **OP-ERR-12** RegistroSheet transacional — S, **dia 2-3**.
6. **OP-ERR-05** Tab Registos "+" — S, **dia 3**.
7. **OP-UX-09** MyFrentes empty state CTA — S, **dia 3**.

**Dia 4-8** (Montagem phase):
8. **OP-FEAT-B** Montagem phase mínima viável — M-L, **dia 4-8**.

**Dia 8-9** (buffer + smoke test):
9. Walk-through dos 6 fluxos no ambiente Test.
10. Decisão de freeze pré-Coala.

**Total esforço P0:** ~5-7 dias dev. Buffer 2-4 dias para imprevistos.

---

## Notas finais

- **Não tocar em código** nesta sprint de auditoria. Próxima sprint deve dispatch ao Lovable em **batches por sprint** (OP-10 primeiro como bloco indivisível).
- **OP-FEAT-B Montagem phase** é o item mais ambíguo de scope. Sugestão minimalista: clonar `PlanejamentoPhase` mas filtrar etapas com `status='in_progress'` ou data de montagem (cronograma). Decisão produto.
- **OP-ERR-39** migrations duplicadas: low risk, low value de fix; documentar e seguir.
- Auditoria SQL exaustiva (RLS por policy, triggers de cascade, etc.) já existe em `docs/audits/2026-05-19-operacao-redesign/analise.md` — referenciar.
