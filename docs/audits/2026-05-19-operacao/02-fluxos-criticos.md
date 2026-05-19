# 02 — Fluxos Críticos End-to-End

**6 fluxos** representativos dos perfis principais. Cada passo marcado:
- ✅ funciona como esperado
- ⚠️ funciona mas confunde / mal sinalizado
- ❌ quebrado, falta funcionalidade, ou induz em erro

Referências cruzadas: `03-erros-funcionais.md` para bugs (`OP-ERR-XX`), `04-inconsistencias-ux.md` para UX (`OP-UX-XX`).

---

## Fluxo A — Admin cria Zona + Etapas + Staff

**Perfil:** admin (`isAdmin`) ou manager (`manage_operacao_frentes` + `manage_operacao_etapas` + `manage_operacao_staff`).
**Objectivo:** preparar do zero um evento novo: criar Zona "Palco Principal", definir produtor de Zona, criar 5 etapas com fornecedor, e adicionar 2 staff de campo.

| # | Passo | Componente | Estado | Nota |
|---|---|---|---|---|
| A1 | Entrar em `/operacao` | OperacaoHome → EventListWithPhase | ✅ | Lista eventos com phase badge. Card mostra nome+datas+location+etapas+chamados. |
| A2 | Click evento "Coala 2026" | EventListWithPhase → navigate `/operacao/:eventId` | ✅ | OK. |
| A3 | EventHub renderiza fase actual (Setup se NULL) | EventHub | ✅ | Header sticky + pills + conteúdo. |
| A4 | Setup phase mostra 3 cards (Equipa / Zonas / Serviços) | SetupPhase + EventTeamSection + 2× FrentesPanel | ✅ | Progress bar "Setup X/3". |
| A5 | Click "+ Diretor" / "+ Produtor Geral" em EventTeamSection | EventTeamSection > AddMemberDialog | ⚠️ | Insert member + zones **não-transacional** (OP-ERR-11). Detecção de duplicate-key frágil (mensagem PostgREST). |
| A6 | Adicionar nova pessoa inline (não-existente) | NewProfileInlineDialog | ⚠️ | Race "Perfil criado mas não encontrado" (OP-ERR-33). |
| A7 | Voltar a Setup, click "+ Zona" no FrentesPanel | FrentesPanel > AddFrenteInlineDialog | ⚠️ | Insert frente + setLead **não-transacional** (OP-ERR-08). |
| A8 | (alternativa) Click "+ Template" → "Indoor" | FrentesPanel:98 | ❌ | **Toast "Template em breve"** (OP-ERR-03). Botão morto que parece funcional. |
| A9 | "Show indoor"/"Conferência" idem | FrentesPanel:99 | ❌ | Idem. |
| A10 | "Show outdoor" (template real) | FrentesPanel:97 | ✅ | Provavelmente OK (chama RPC seed). |
| A11 | Click frente recém-criada | navigate `/operacao/frente/:id` | ✅ | Vai para FrenteDetail. |
| A12 | Em FrenteDetail, tab "Etapas" → click "Nova etapa" | FrenteDetail:164 → NewEtapaDialog | ⚠️ | OK funcional; mas insert etapa + M:N supplier não-transacional (OP-ERR-09). |
| A13 | Preencher nome, data, responsável, fornecedor | NewEtapaDialog (4 useQuery sem error handling) | ⚠️ | Queries silenciosas (OP-ERR-16). |
| A14 | Salvar etapa | submit L105 | ⚠️ | Sem optimistic; toast a chegar tarde se rede lenta. |
| A15 | Adicionar mais etapas (repete A12-A14) | idem | — | — |
| A16 | Voltar a EventHub via "← Eventos" header | EventHub:74 | ✅ | OK (destino fixo). |
| A17 | Ir a `/operacao/staff` via "Gerir Staff" (Setup CTA) | EventHub:179 | ✅ | OK. |
| A18 | "+ Novo Staff" em StaffList | NewStaffDialog | ✅ | OK (edge function `create-staff`). |
| A19 | Reenviar convite a staff existente | StaffList:60 | ✅ | OK (edge function `send-staff-invite`). |
| A20 | Voltar a EventHub | StaffList:91 `navigate(-1)` | ⚠️ | History-based — se utilizador chegou via URL directa, sai de Operação (OP-UX-04). |

**Pontos críticos para Coala:**
- A8/A9 (OP-ERR-03 botões mortos) — utilizador a fazer demo perde 30 segundos confundido. P0.
- A6 (OP-ERR-33 race) — Pedro a criar pessoas novas durante setup pode bater no erro. P1.
- A20 (OP-UX-04 navigate-1) — não bloqueante mas frustrante.

---

## Fluxo B — Diretor: visão geral + drill down em atraso

**Perfil:** Diretor (`event_team_members.role='director'`).
**Objectivo:** Diretor abre o evento, vê estado geral, identifica um problema (etapa atrasada), e investiga.

| # | Passo | Componente | Estado | Nota |
|---|---|---|---|---|
| B1 | Login → vai para `/operacao` (ou modulo selector) | — | ✅ | OK. |
| B2 | Click evento ativo | EventListWithPhase | ✅ | Vê phase badge "Montagem" ou "Evento". |
| B3 | EventHub abre na fase actual | EventHub | ⚠️ | Se fase=`montagem` → **placeholder "Em breve"** (EventHub:127). **Nenhum conteúdo útil em fase Montagem.** ❌ para o Coala que está em montagem. |
| B4 | Diretor tenta drill ao Dashboard analítico | — | ⚠️ | Sidebar NÃO mostra "Dashboard" quando user está em `/operacao` na hierarquia operacaoItems (AppSidebar:50-54 só tem Operação + Dashboard + Staff, e Dashboard só aparece se admin/view_operacao). Em `EventoPhase` há link "Ver Dashboard analítico" (linha 64 doc mp-operacao-hub.md), **mas só na fase Evento**. Em Montagem não há link. |
| B5 | Vai por URL directo a `/operacao/dashboard` | Dashboard | ⚠️ | Mostra zeros se `filters.event=null` sem CTA (OP-ERR-15). |
| B6 | Seleciona evento no `OperacaoFiltersBar` | OperacaoFiltersBar | ⚠️ | Auto-select primeiro evento se houver só um (boa UX), mas sem opção "Todos" (OP-ERR-36). |
| B7 | Vê KPIs (chamados / etapas / SLA) + 3 charts | Dashboard | ⚠️ | Charts sem error handling (OP-ERR-16); refetch falha silenciosa. |
| B8 | "Burndown" — não existe | — | ❌ | Conceito mencionado no briefing mas nem dashboard nem hub renderizam burndown. |
| B9 | "Cobertura por zona" — parcial | Dashboard chart "progresso por frente" | ⚠️ | Bar chart mostra etapas concluídas/total por frente — é a aproximação mais próxima de "cobertura". |
| B10 | Click chamado para investigar | Link L225 → `/operacao/chamado/:id` | ✅ | Navega OK. |
| B11 | ChamadoDetail | ChamadoDetail | ⚠️ | Loading vs not-found ambíguo se ID inválido (OP-ERR-06). Ação "Iniciar"/"Resolver" sem gate UI (OP-ERR-25). |
| B12 | Voltar para investigar etapa atrasada | navigate(-1) | ⚠️ | History-based (OP-UX-04). |
| B13 | Clicar etapa pendente | EtapaDetail | ✅ | **Director-only mode aplicado** (banner read-only L120). OP-9a confirmado. |
| B14 | Ver responsável e contactar | EtapaDetail tem responsável | ⚠️ | Não há botão "contactar lead" em EtapaDetail (só em EventoPhase L294 — só na fase Evento). |

**Pontos críticos para Coala:**
- B3 (Montagem placeholder) — Coala arranca 28 maio, está agora em montagem. **Director não tem ferramenta para acompanhar montagem**. P0 conceptual; P1 actionable (precisa de feature, não fix).
- B4/B5 (Dashboard discovery) — não há ligação clara do Hub para o Dashboard. P1.
- B8 (sem burndown) — assumido no briefing, não existe. Decidir se v1 inclui ou não. P1.

---

## Fluxo C — Produtor Geral: tarefas do dia + fechar etapa + criar chamado

**Perfil:** Produtor Geral (`event_team_members.role='general_producer'`, scope='full' ou 'zones').
**Objectivo:** durante o dia, abrir a app, ver as tarefas atribuídas, fechar uma etapa concluída e abrir chamado quando aparece problema.

| # | Passo | Componente | Estado | Nota |
|---|---|---|---|---|
| C1 | Login → landing `/operacao/equipa` (MyFrentes) | MyFrentes | ⚠️ | Para Produtor Geral (não field staff), faria mais sentido `/operacao/:eventId`. MyFrentes é mobile-first para field staff. **Sem auto-redirect baseado em role**. |
| C2 | Click "Minhas Tarefas" no header | MyFrentes:114 → `/operacao/minhas-tarefas` | ✅ | OK. |
| C3 | MinhasTarefas mostra 4 buckets (Em curso/Pendentes/Bloqueadas/Concluídas hoje) | MinhasTarefas | ⚠️ | Sem voltar (OP-UX-04). Sem loading state (queries silenciosas). Roles "Owner/Helper/Responsável/via_frente" expostos como strings (OP-UX-02 — terminologia). |
| C4 | Click etapa "Em curso" | MinhasTarefas:158 → EtapaDetail | ✅ | OK. |
| C5 | EtapaDetail mostra ações Iniciar/Bloquear/Concluir | EtapaDetail:174 | ✅ | OK (fix OP-9a). |
| C6 | Click "Concluir" | EtapaDetail:191 | ✅ | OK; status=`done`, `actual_end=now()`. |
| C7 | Voltar a MinhasTarefas | EtapaDetail:124 link `/operacao/frente/:id` | ⚠️ | Vai para FrenteDetail, **não para MinhasTarefas** (de onde veio). Quebra fluxo. |
| C8 | Receber notificação de problema (push) | — | — | Out of scope deste audit (depende de push notifications setup). |
| C9 | Criar chamado via FAB | QuickActionFab:103-153 → RegistroSheet | ❌ | **OP-ERR-01 — Rules of Hooks violation no FAB**. Pode crashar se utilizador navegou para `/operacao/chamado/novo` antes e voltou. |
| C10 | (alternativa) Ir directamente a `/operacao/chamado/novo` | ChamadoNovo | ⚠️ | Sem voltar (OP-UX-04); sem gate UI (OP-ERR-24); media.insert fire-and-forget (não captura erro). |
| C11 | Preencher chamado | ChamadoNovo | ⚠️ | Select frente/etapa funciona; áudio funciona; media funciona; mas sem feedback se upload media falhar parcial. |
| C12 | Submeter | ChamadoNovo:58-83 → navigate `/operacao/chamado/:id` | ✅ | OK. |

**Pontos críticos para Coala:**
- C7 (voltar via /operacao/frente/:id em vez de origem) — director volta a investigar e perde contexto. P1.
- C9 (FAB hooks bug) — bloqueador potencial. P0.
- C1 (landing errada para Produtor Geral) — onboarding confuso. P2.

---

## Fluxo D — Produtor de Zona: invite → primeiro uso

**Perfil:** Produtor de Zona (`operacao_frentes.current_lead_id` apontando para o profile). Pode ser produtor existente ou novo via NewProfileInlineDialog.
**Objectivo:** receber link WhatsApp, aceitar convite, ver as suas frentes, e operar.

| # | Passo | Componente | Estado | Nota |
|---|---|---|---|---|
| D1 | Receber WhatsApp com link `https://.../operacao/accept-invite?token=...` | Twilio + send-staff-invite | ✅ | OK. |
| D2 | Click → app abre AcceptInvite | AcceptInvite | ✅ | `<Loader2>` enquanto valida (61 LoC OK). |
| D3 | Edge function `accept-staff-invite` valida token + cria session | accept-staff-invite | ✅ | Confirma phone, atribui `field_producer`, setSession. |
| D4 | Redirect para `/operacao/equipa` após 800ms | AcceptInvite:26 | ⚠️ | Race se utilizador clica voltar — não bloqueante. |
| D5 | MyFrentes renderiza com frentes do user | MyFrentes | ⚠️ | Estado vazio "Ainda não fazes parte de nenhuma Frente. Pede ao coordenador..." (OP-UX-09) sem CTA. |
| D6 | Vê suas frentes em cards | FrenteCard | ⚠️ | Card com expressão tautológica (OP-ERR-34). Visualmente OK mas lógica frágil. |
| D7 | Click frente | navigate `/operacao/frente/:id` | ✅ | FrenteDetail abre. |
| D8 | Tab Registos para ver atividade passada | FrenteDetail:159 → RegistroFeed | ⚠️ | **Sem CTA "+" para criar registo** (OP-ERR-05) — utilizador procura e não encontra. |
| D9 | Tab Etapas para ver o que tem para fazer | FrenteDetail:164 | ⚠️ | OK funcional, sem CTA empty-state se 0 etapas. |
| D10 | Botão "+ Nova etapa" (se for lead da frente) | FrenteDetail:164 → NewEtapaDialog | ⚠️ | OP-ERR-09 multi-step. |
| D11 | Tab Chamados (condicional) | FrenteDetail:107 | ⚠️ | Tab esconde-se se mode≠evento/post E !hasOpenChamados (OP-UX-18). |
| D12 | Para criar registo, abre FAB | QuickActionFab | ⚠️ | OP-ERR-01 potencial. RegistroSheet:88,103 insert não-transacional (OP-ERR-12). |

**Pontos críticos para Coala:**
- D5 empty-state — fluxo de onboarding terminal sem CTA. **Crítico**. P0.
- D8 tab Registos sem "+" — confunde produtor novo. P0/P1.
- D12 FAB com hooks bug. P0.

---

## Fluxo E — Staff de campo: receber chamado → resolver com registo

**Perfil:** Staff de campo (`profile_type='field_staff'` + `field_producer` role). Sem desktop, mobile-only.
**Objectivo:** receber chamado push, atender no terreno, fechar com registo + foto.

| # | Passo | Componente | Estado | Nota |
|---|---|---|---|---|
| E1 | Push notification "Novo chamado: Palco — sem som" | push system | — | Out of scope (depende cron sla-escalator + notification target). |
| E2 | Click notification → abre `/operacao/chamados` (ou directo `/operacao/chamado/:id`?) | MeusChamados | ⚠️ | Não confirmado se push abre lista ou detalhe. Sem voltar (OP-UX-04). |
| E3 | Vê chamado em tab "Abertos" | MeusChamados | ⚠️ | Lista funcional; queries silenciosas. |
| E4 | Click chamado | ChamadoDetail | ⚠️ | OP-ERR-06 loading ambíguo se permissões falharem. |
| E5 | Click "Iniciar" para ACK + começar | ChamadoDetail:100-104 | ⚠️ | Botão visível para qualquer user (OP-ERR-25) — RLS bloqueia se não autorizado. |
| E6 | Status passa a "in_progress" | mutation L51 | ✅ | OK. |
| E7 | Vai ao terreno, resolve problema | — | — | — |
| E8 | Volta à app, click "Resolver" | ChamadoDetail:107 → ResolveDialog L117 | ⚠️ | Mesma ausência de gate UI. ResolveDialog é sub-componente local (refactorable). |
| E9 | Adiciona registo "Resolvido — som configurado" + foto | ResolveDialog → MediaCapture + insert registo | ⚠️ | OP-ERR-12 — insert registo + media não-transacional. Foto pode falhar e registo fica vazio. |
| E10 | Status passa a "resolved" + `resolved_at` | mutation | ✅ | OK. |
| E11 | Voltar a MeusChamados | navigate(-1) ou link | ⚠️ | OP-UX-04. |
| E12 | Vê chamado em tab "Resolvidos" | MeusChamados | ✅ | OK. |

**Pontos críticos para Coala:**
- E9 (insert não-transacional) — staff em festival com rede instável vai bater nisto. Foto não sobe e ninguém sabe. P0.
- E2 (push deeplink) — confirmar comportamento. P1.

---

## Fluxo F — Diretor durante o Evento: feed live + agir em SLA breach

**Perfil:** Diretor ou Produtor Geral em evento ao vivo.
**Objectivo:** acompanhar feed de chamados em tempo real, reagir a SLA breach.

| # | Passo | Componente | Estado | Nota |
|---|---|---|---|---|
| F1 | Coordenador muda fase do evento para "Evento" | EventHub:50-62 | ⚠️ | `confirm()` nativo (OP-ERR-17). Update direto em `events.operacao_mode`. |
| F2 | EventHub renderiza EventoPhase | EventoPhase | ⚠️ | 6 queries com `refetchInterval: 30s` mas **sem error handling** (OP-ERR-14). Se rede falha em festival, dados ficam stale silenciosos. |
| F3 | Vê 4 KPIs mini (chamados/etapas em curso/concluídas hoje/zonas com problema) | EventoPhase KpiMini | ✅ | OK. Cor vermelha se chamados > 0. |
| F4 | Vê feed de chamados | EventoPhase L233+ | ⚠️ | Cada chamado: barra cor da zona + nome + texto + tempo + autor + contacto. **Acções inline "Em curso" + "Resolver"** funcionam para lead da zona ou admin. |
| F5 | Cron sla-escalator detecta breach (background) | run_operacao_sla_escalator | ✅ | Cron a cada 2 min; nível 1 push, nível 2 push+WhatsApp para crit/high. |
| F6 | Diretor recebe notificação | — | — | Depende de notification setup. |
| F7 | Click chamado breached | EventoPhase ou push deeplink | ⚠️ | OK na app; sem highlight visual de "breached" no feed (apenas tempo "há Xm" mostra). |
| F8 | Vê contacto do lead | EventoPhase:294 `📞 tel:` ou `💬 wa.me/` | ✅ | OK (fallback "Sem contacto registado" se phone vazio). |
| F9 | Liga ao lead | tel/wa link | ✅ | Nativo OS. |
| F10 | Marca chamado "Em curso" enquanto telefona | EventoPhase:277 (variant secondary) | ⚠️ | OP-UX-06 variants inconsistentes (secondary aqui, default em ChamadoDetail). |
| F11 | Resolve no chamado | EventoPhase:281 | ✅ | Status=`resolved`. |
| F12 | FAB Novo Incidente (vermelho) | EventoPhase:383-393 | ⚠️ | **FAB duplica QuickActionFab global** (OP-UX-20). Dois FABs em simultâneo. |
| F13 | Refresh manual | — | ❌ | **Não há botão refresh** — depende apenas de `refetchInterval: 30s`. Se há urgência, utilizador não consegue forçar refresh. |

**Pontos críticos para Coala:**
- F2 (queries sem error em live ops) — **CRÍTICO**. Director vê feed stale e age sobre informação incorrecta. P0.
- F12 (FAB duplicado) — confunde visualmente. P1.
- F13 (sem refresh manual) — em emergência, esperar 30s é demais. P1.
- F1 (confirm nativo na mudança fase) — alto impacto, deveria usar AlertDialog. P1.

---

## Sumário dos fluxos

| Fluxo | Passos | ✅ | ⚠️ | ❌ |
|---|---:|---:|---:|---:|
| A — Admin setup completo | 20 | 9 | 8 | 3 |
| B — Diretor visão geral | 14 | 4 | 8 | 2 |
| C — Produtor Geral tarefas | 12 | 4 | 6 | 2 |
| D — Produtor de Zona invite→uso | 12 | 4 | 8 | 0 |
| E — Staff de campo chamado | 12 | 3 | 9 | 0 |
| F — Diretor evento ao vivo | 13 | 4 | 7 | 2 |
| **TOTAL** | **83** | **28 (34%)** | **46 (55%)** | **9 (11%)** |

**Padrões transversais que aparecem em quase todos os fluxos:**
1. **Fluxos de criação não-transacionais** (A, C, D, E) — risk de estado inconsistente em falha parcial.
2. **`navigate(-1)` quebra mental model** (A, B, C, E) — quase todos os flows têm pelo menos 1 passo onde utilizador "sai" do módulo sem querer.
3. **Tab Registos sem "+"** (D) — confunde quem chega pela primeira vez.
4. **EventoPhase queries sem error handling** (F) — crítico no evento ao vivo.
5. **FAB com hooks bug** (C, D) — risco de crash silencioso.
6. **Montagem placeholder** (B) — Coala arranca em 9 dias, sem ferramenta.

## Bloqueadores absolutos para Coala (28 maio)

- ❌ **OP-ERR-01** FAB Rules of Hooks — pode crashar app inteira.
- ❌ **OP-ERR-03** Templates "Indoor"/"Conferência" mortos — em demo de setup.
- ❌ **OP-ERR-14** EventoPhase queries silenciosas — feed live unreliable.
- ❌ **EventHub Montagem placeholder** — Coala em montagem agora, sem suporte.
- ❌ **F13** Sem refresh manual em evento ao vivo.
