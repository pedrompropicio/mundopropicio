# 00 — Sumário Executivo

**Projecto:** MP Gestão Eventos · Módulo Operação · Auditoria UX/UI · 2026-05-19
**Escopo:** `src/pages/operacao/*` (15), `src/components/operacao/**` (36), `src/hooks/use{Operacao*,IsEventDirectorOnly,IsFieldStaffOnly}` (4), rotas em `src/App.tsx`.
**Método:** análise estática + walkthrough de 6 fluxos end-to-end. Cruzamento com docs de feature `docs/features/mp-operacao-*` e memória `mp-operacao-foundation.md`. Sem alterações ao código.
**Contexto temporal:** Festival Coala em **9 dias** (28 maio 2026). Módulo construído em ~12 sprints OP-0 a OP-9a entre 14 e 19 maio.
**Entregáveis:** 6 ficheiros markdown em `docs/audits/2026-05-19-operacao/`.

---

## Visão geral

O módulo Operação **funciona em ~89% dos passos dos 6 fluxos críticos** (74 de 83 passos com ✅ ou ⚠️), mas tem **9 bloqueadores claros** (❌) e **46 pontos de fricção UX**.

### Sólido
- Arquitectura coerente: 5 fases por evento (`events.operacao_mode`), 11 tabelas DB, RLS hierárquica via 3 security definer functions (`can_manage_operacao_etapa`, `can_view_event_operacao`, `can_manage_event_operacao_full`).
- Fluxo de staff de campo via WhatsApp invite (3 edge functions + Twilio) end-to-end funcional.
- Cron SLA escalator (a cada 2 min) com 2 níveis (push + WhatsApp para crit/high) implementado.
- `EtapaDetail` é o **único page a tratar `isLoading`/`error`/`!data` separadamente** — bom modelo a replicar.
- Bug OP-9a (loading infinito + Rules of Hooks) confirmado fixed.

### Risco
- **2 fases do Hub são placeholders**: Montagem (EventHub:127) e Fecho (EventHub:135). Coala está agora em Montagem.
- **1 violação confirmada de Rules of Hooks** em `QuickActionFab` — pode crashar a app inteira em transição de rota.
- **6 queries no fluxo Evento ao vivo (`EventoPhase`) sem error handling**, com refetch a 30s — director no Coala vê dados stale silenciosos se rede falhar.
- **8 fluxos multi-step writes não-transacionais** — falhas parciais deixam estado inconsistente (frente sem lead, etapa sem M:N supplier, member sem zones, registo sem media).
- **Terminologia inconsistente em ≥3 dimensões**: Frente/Zona/Serviço, Lead/Responsável/Produtor/Produtor de Zona/Produtor Geral/Diretor, "ACK"/PT.
- **`QuickActionFab` é o único caminho universal para criar Registo/Chamado** — está bugged.
- **14 dos 17 estados vazios sem CTA** — onboarding de produtor de zona / staff fica preso sem direção.

---

## Top 10 problemas mais críticos

> Ordem por impacto operacional no Coala. Detalhes em `03-erros-funcionais.md` e `04-inconsistencias-ux.md`.

| # | ID | Problema | Perfis afectados | Severidade |
|---|---|---|---|---|
| 1 | OP-ERR-01 | `QuickActionFab` Rules of Hooks — `useQuery` após early return; pode crashar app em mudança de rota | **TODOS** | 🟥 P0 |
| 2 | OP-ERR-14 | `EventoPhase` 6 queries com `refetchInterval: 30s` sem error handling — feed live silencioso em rede instável | Diretor / Produtor Geral em evento | 🟥 P0 |
| 3 | EventHub fase **Montagem** é placeholder `<PlaceholderPhase title="Montagem" text="Em breve…"/>` | Diretor / Produtor Geral (Coala agora) | 🟥 P0 |
| 4 | OP-ERR-03 | Templates de Frente "Indoor" / "Conferência" caem em fallback "Template em breve" — botões mortos visíveis | Admin (setup) | 🟥 P0 |
| 5 | OP-ERR-12 | `RegistroSheet` insert registo+media não-transacional — staff perde foto em rede instável | Staff de campo | 🟥 P0 |
| 6 | OP-ERR-05 | `FrenteDetail` tab Registos sem CTA "+" — produtor procura e não encontra | Produtor de Zona / Staff | 🟥 P0 |
| 7 | OP-UX-09 | 14 dos 17 estados vazios sem CTA — `MyFrentes` deixa staff sem direção no primeiro uso | Staff de campo (onboarding) | 🟥 P0 |
| 8 | OP-UX-01+02 | Terminologia inconsistente (Frente/Zona/Serviço × Lead/Responsável/Produtor de Zona/Produtor Geral) — 5+ nomes para a mesma realidade | TODOS | 🟧 P1 |
| 9 | OP-ERR-17 | `EventHub` `confirm()` nativo na mudança de fase (acção semi-irreversível) | Admin / Produtor Geral | 🟧 P1 |
| 10 | OP-UX-20 | FAB duplicado na fase Evento — `EventoPhase` adiciona FAB vermelho mas o `QuickActionFab` global continua visível | Diretor durante evento | 🟧 P1 |

---

## Quadro de severidade por perfil

> Quão grave é o estado actual para cada perfil tentar usar o módulo no Coala?

| Perfil | Onde dói mais | Estado pré-Coala | Bloqueadores específicos |
|---|---|---|---|
| **Diretor do evento** | Fase Montagem placeholder + EventoPhase silencioso offline | 🟧 **Funciona com fricção** | OP-ERR-14, Montagem placeholder, sem refresh manual, sem burndown |
| **Produtor Geral** | Tarefas + criação de chamados via FAB potencialmente buggado | 🟧 **Funciona com fricção** | OP-ERR-01 (FAB), OP-ERR-09 (etapa+supplier), C7 voltar pós-Concluir |
| **Produtor de Zona** | Onboarding via invite + criação de registos sem CTA visível | 🟧 **Confuso no primeiro uso** | OP-ERR-05 (tab Registos sem +), OP-UX-09 (empty states), OP-ERR-08 (frente sem lead) |
| **Staff de campo** | Resolver chamado com media em rede instável (festival) | 🟥 **Crítico** | OP-ERR-12 (insert não-transacional), OP-ERR-31 (lightbox), OP-UX-09 (empty state inicial) |
| **Admin / Manager (setup)** | Botões mortos em demos + multi-step writes frágeis | 🟧 **Funciona com fricção** | OP-ERR-03 (templates mortos), OP-ERR-11 (member+zones), OP-ERR-17 (confirm fase) |

---

## Top 5 Quick Wins recomendados

> Alto impacto, esforço XS-S. Implementáveis em 1-2 dias.

| # | ID | Quick Win | Onde |
|---|---|---|---|
| 1 | OP-ERR-01 | Mover os `useQuery` para antes do `if (hideFab) return null;` | [QuickActionFab.tsx:77,97](../../../src/components/operacao/QuickActionFab.tsx) |
| 2 | OP-ERR-03 | Esconder templates "Indoor" e "Conferência" até existirem | [event/FrentesPanel.tsx:98-99](../../../src/components/operacao/event/FrentesPanel.tsx) |
| 3 | OP-ERR-05 | Adicionar botão "+ Novo Registo" no header da tab Registos | [FrenteDetail.tsx:159](../../../src/pages/operacao/FrenteDetail.tsx) |
| 4 | OP-ERR-15 | Estado vazio "Escolhe um evento" + auto-select se só houver um | [Dashboard.tsx:46](../../../src/pages/operacao/Dashboard.tsx) |
| 5 | OP-UX-10 | `EventListWithPhase` empty-state texto → CTA real (link para `/eventos`) | [event/EventListWithPhase.tsx:93](../../../src/components/operacao/event/EventListWithPhase.tsx) |

---

## Recomendação de ordem nos 9 dias até Coala

> Total esforço P0 estimado: **3-4 dias dev** (1 fulltime). Buffer 4-5 dias para testes + imprevistos.

```
Dia 1 (20 mai)   ┃ OP-ERR-01 FAB hooks (XS)
                 ┃ OP-ERR-03 Templates mortos (XS)
                 ┃ OP-ERR-14 EventoPhase error handling (S — start)
─────────────────╂──────────────────────────────────────────
Dia 2 (21 mai)   ┃ OP-ERR-14 finish
                 ┃ OP-FEAT-A Refresh manual EventoPhase (S)
                 ┃ OP-ERR-12 RegistroSheet transacional (S — start)
─────────────────╂──────────────────────────────────────────
Dia 3 (22 mai)   ┃ OP-ERR-12 finish
                 ┃ OP-ERR-05 Tab Registos "+" (S)
                 ┃ OP-UX-09 MyFrentes empty state CTA (S)
─────────────────╂──────────────────────────────────────────
Dia 4-7 (23-26)  ┃ OP-FEAT-B Montagem phase mínima viável (M-L)
                 ┃ Mínimo: clonar PlanejamentoPhase com filtro
                 ┃ "etapas em curso por zona/serviço"
─────────────────╂──────────────────────────────────────────
Dia 8 (27 mai)   ┃ Buffer: smoke test dos 6 fluxos em ambiente Test
─────────────────╂──────────────────────────────────────────
Dia 9 (28 mai)   ┃ Coala arranca · monitoring de feed live
```

**Itens P0 não inclusos no plano de 9 dias** (decidir manter ou cortar):
- Burndown chart (OP-FEAT-D) — feature nova, L.
- Fase Fecho funcional (OP-FEAT-E) — só usada pós-evento.

---

## Próximos passos

1. **Validar este sumário** com Pedro antes de qualquer dispatch.
2. **Confirmar âmbito da Montagem phase v0** (OP-FEAT-B) — decisão produto: minimalista (clone Planeamento) ou ambiciosa (Gantt).
3. **Dispatch OP-10 ao Lovable em batch único** (Dias 1-3 do plano) — itens são quase todos UI.
4. **OP-FEAT-B Montagem** pode requer Claude Code se DB changes necessárias; senão Lovable.
5. **Walk-through pós-fix** dos 6 fluxos antes do freeze 27 maio.

---

## Ficheiros do dossier

| Ficheiro | Conteúdo |
|---|---|
| `00-sumario.md` (este) | Top 10, severidade por perfil, plano 9 dias |
| `01-inventario-telas.md` | 15 páginas + 36 componentes + rotas + mapa nav + telas órfãs |
| `02-fluxos-criticos.md` | 6 fluxos end-to-end com ✅/⚠️/❌ por passo |
| `03-erros-funcionais.md` | 39 issues funcionais (`OP-ERR-XX`) — bugs, RoH, queries silenciosas, RLS |
| `04-inconsistencias-ux.md` | 23 inconsistências (`OP-UX-XX`) — terminologia, navegação, botões, estados vazios |
| `05-priorizacao.md` | Backlog P0/P1/P2 + sprints OP-10 a OP-16 + roadmap |

**Referências externas:**
- `docs/features/mp-operacao-hub.md` — design intent das 5 fases.
- `docs/features/mp-operacao-overview.md` — visão geral do módulo.
- `docs/features/mp-operacao-{desktop,mobile-flows,staff,suppliers,zonas-servicos}.md` — sub-features.
- `.lovable/memory/features/mp-operacao-foundation.md` — schema DB.
- `docs/audits/2026-05-19-operacao-redesign/analise.md` — auditoria SQL exaustiva (irmã deste dossier).
