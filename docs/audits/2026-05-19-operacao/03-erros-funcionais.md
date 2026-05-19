# 03 — Erros Funcionais

**Escopo:** bugs reproduzíveis, botões mortos, violações de Rules of Hooks, queries que falham silenciosamente, ações destrutivas sem confirmação adequada, e RLS/permissões inconsistentes. Cada item tem ID estável (`OP-ERR-XX`) reutilizável em `05-priorizacao.md`.

Legenda: 🟥 P0 (bloqueia uso no Coala) · 🟧 P1 (atrapalha) · 🟨 P2 (pode esperar).

---

## 3.1 Rules of Hooks

### OP-ERR-01 🟥 — `QuickActionFab` chama `useQuery` após early return
- **Ficheiro:** [src/components/operacao/QuickActionFab.tsx:77,97](../../../src/components/operacao/QuickActionFab.tsx)
- **Sintoma:** `if (hideFab) return null;` em L77 vem **antes** do `useQuery(['picked-frente-ctx', ...])` em L97. Quando uma rota altera `hideFab` de `true → false` (ex.: utilizador sai de `/operacao/chamado/novo` para `/operacao`), o React aborta com `Rendered fewer hooks than expected` e a app cai em error boundary.
- **Repro:**
  1. Login como produtor geral.
  2. Abrir `/operacao/chamado/novo` (FAB esconde-se via `hideFab=true`).
  3. Navegar para `/operacao` via header.
  4. App fica branca / aparece toast de erro / consola: `Hooks order error`.
- **Impacto:** **FAB é o único caminho universal para criar Registo/Chamado/Etapa/Frente** — quando explode arrasta toda a app dentro de `OperacaoLayout`.
- **Fix esperado:** mover `useQuery` (e os 2 outros `useQuery` da função) para **antes** do `if (hideFab) return null;`. Custo XS.

### OP-ERR-02 🟧 — `MediaCapture.MediaThumb` faz side-effect em render
- **Ficheiro:** [src/components/operacao/MediaCapture.tsx:132-135](../../../src/components/operacao/MediaCapture.tsx)
- **Sintoma:** `if (!url) supabase.storage.from(...).createSignedUrl(...).then(setUrl)` invocado no corpo do componente. Cada render que ainda não tenha `url` dispara nova chamada à Storage API. Pode causar `Cannot update state during render` em strict mode e custo extra de chamadas quando lista é longa.
- **Repro:** abrir `RegistroFeed` com ≥5 media; observar Network panel — múltiplas chamadas `createSignedUrl` à mesma key.
- **Impacto:** consumo extra de Storage signed-url quota e flickering em renders concorrentes.
- **Fix esperado:** mover para `useEffect([m.file_path])` com cleanup. Custo XS.

---

## 3.2 Botões mortos / sem efeito útil

### OP-ERR-03 🟥 — Templates "Indoor"/"Conferência" caem em fallback "em breve"
- **Ficheiro:** [src/components/operacao/event/FrentesPanel.tsx:73,98-99](../../../src/components/operacao/event/FrentesPanel.tsx)
- **Sintoma:** No menu "+ Template" dentro do `FrentesPanel`, dois dos três templates (`indoor`, `conferencia`) só fazem `toast({title:"Template em breve"})` em L73. O utilizador clica e nada acontece de visível além do toast.
- **Repro:** EventHub fase Setup → cartão Zonas ou Serviços → dropdown "+ Template" → escolher "Indoor" ou "Conferência".
- **Impacto:** **bloqueador antes do Coala** — Pedro vai precisar de fazer setup de eventos novos e os templates extra parecem disponíveis mas não funcionam. Confunde demonstração e perde tempo.
- **Fix esperado:** ou (a) esconder os templates `indoor`/`conferencia` até existirem, ou (b) implementar seeds adicionais. Custo S (a) / M (b).

### OP-ERR-04 🟧 — `Dashboard` "Exportar PDF" disabled com tooltip "Em breve"
- **Ficheiro:** [src/pages/operacao/Dashboard.tsx:150-154](../../../src/pages/operacao/Dashboard.tsx)
- **Sintoma:** Botão visível, com `disabled` + `title="Em breve"`. Intencionalmente "morto" mas ocupa espaço header.
- **Impacto:** menos crítico (assinalado como "Em breve") mas polui UI Dashboard durante demo.
- **Fix esperado:** esconder até existir, ou trocar por banner discreto. Custo XS.

### OP-ERR-05 🟧 — `FrenteDetail` tab "Registos" parece ter botão "+" mas não tem
- **Ficheiro:** [src/pages/operacao/FrenteDetail.tsx:159](../../../src/pages/operacao/FrenteDetail.tsx) (renderiza `<RegistroFeed/>`); [src/components/operacao/RegistroFeed.tsx](../../../src/components/operacao/RegistroFeed.tsx) (sem "+")
- **Sintoma:** Utilizador entra na tab "Registos" da frente e procura "Novo registo". Não há CTA — criação de registo é via **`QuickActionFab` global** (`OperacaoLayout.tsx:8`). FAB tem 4 opções (Frente / Etapa / Registo / Chamado) e o caminho não é óbvio.
- **Repro:** Login como lead da frente → `/operacao/frente/:id` → tab Registos → procurar botão criar → não encontra.
- **Impacto:** UX confusa — utilizador menciona explicitamente este ponto no briefing.
- **Fix esperado:** adicionar botão "+ Novo Registo" no header da tab Registos ou abrir RegistroSheet directamente com `frente_id` pré-preenchido. Custo S.

---

## 3.3 Loading vs not-found ambíguo

### OP-ERR-06 🟧 — `ChamadoDetail` mostra "A carregar..." indefinido para IDs inválidos
- **Ficheiro:** [src/pages/operacao/ChamadoDetail.tsx:26,38](../../../src/pages/operacao/ChamadoDetail.tsx)
- **Sintoma:** `useQuery` faz `.maybeSingle()` (sem `.single()`) e retorna `null` tanto durante loading como quando ID não existe. `if (!c) return <div>A carregar...</div>` (L38) trata ambos os casos como loading.
- **Repro:** Abrir `/operacao/chamado/00000000-0000-0000-0000-000000000000` (UUID válido formato, sem row).
- **Impacto:** utilizador fica preso em "A carregar..." sem feedback. Acontece também se RLS bloquear.
- **Fix esperado:** consumir `isLoading`/`error` separadamente, espelhando `EtapaDetail.tsx:80-82`. Custo XS.

### OP-ERR-07 🟧 — `FrenteDetail` mesmo padrão de "A carregar..." ambíguo
- **Ficheiro:** [src/pages/operacao/FrenteDetail.tsx:38,110](../../../src/pages/operacao/FrenteDetail.tsx)
- **Sintoma:** Idêntico ao OP-ERR-06 — `maybeSingle()` + `if (!frente)`.
- **Fix esperado:** mesmo padrão de `EtapaDetail.tsx`. Custo XS.

---

## 3.4 Multi-step writes não-transacionais

Padrão recorrente: insert na tabela A + insert na tabela B em série, sem transação. Se B falhar, A fica criado mas inconsistente; o utilizador recebe um erro mas não sabe se A foi criado.

### OP-ERR-08 🟧 — `NewFrenteDialog` cria Frente sem lead se setLead falhar
- **Ficheiro:** [src/components/operacao/NewFrenteDialog.tsx:56,73,86](../../../src/components/operacao/NewFrenteDialog.tsx)
- **Sintoma:** Insert `operacao_frentes` → call `setFrenteLead` (que insere em `operacao_frente_team`). Se segundo falhar, frente existe sem lead e o utilizador é navegado mesmo assim para `/operacao/frente/${created.id}` (L86).
- **Repro:** RLS forçada a recusar insert em `operacao_frente_team` (cenário teórico — em produção depende de race condition).
- **Impacto:** frente órfã na lista, sem owner.
- **Fix esperado:** RPC server-side OU rollback no catch (delete frente se setLead falhar). Custo S.

### OP-ERR-09 🟧 — `NewEtapaDialog` cria Etapa sem M:N supplier se segundo insert falhar
- **Ficheiro:** [src/components/operacao/NewEtapaDialog.tsx:105,131,140](../../../src/components/operacao/NewEtapaDialog.tsx)
- **Sintoma:** Insert `operacao_etapas` (com `supplier_id` legacy) → insert `operacao_etapa_suppliers` (M:N). Falha do segundo só faz `console.warn` (L140). Etapa fica com supplier legacy mas sem linha M:N — UI mistura modos.
- **Impacto:** lista de fornecedores na etapa incoerente.
- **Fix esperado:** RPC ou inserts em transação. Custo S.

### OP-ERR-10 🟧 — `EtapaAssigneeSheet` faz N inserts/updates/deletes em série sem rollback
- **Ficheiro:** [src/components/operacao/EtapaAssigneeSheet.tsx:98,126-145](../../../src/components/operacao/EtapaAssigneeSheet.tsx)
- **Sintoma:** Função `submit` calcula diff e dispara separadamente: deletes, updates, inserts. Sem rollback se 4º item falhar — estado fica parcialmente aplicado.
- **Impacto:** lista de assignees fica inconsistente.
- **Fix esperado:** RPC `set_etapa_assignees(etapa_id, [...])` que faz tudo numa transação. Custo M.

### OP-ERR-11 🟧 — `EventTeamSection` insert member + zones em série
- **Ficheiro:** [src/components/operacao/event/EventTeamSection.tsx:180-200,324-335](../../../src/components/operacao/event/EventTeamSection.tsx)
- **Sintoma:** Adicionar member com scope='zones' → insert `event_team_members` + insert `event_team_member_zones`. Se segundo falhar, member fica sem zonas mas com role atribuída.
- **Idem em editar** (L324) — delete zones + insert novas, janela de inconsistência.
- **Detecção de duplicate-key** em L191 (`error?.message?.includes("duplicate key")`) é frágil — depende de mensagem PostgREST não mudar.
- **Fix esperado:** RPC `set_event_team_member(event_id, profile_id, role, zones[])`. Custo M.

### OP-ERR-12 🟨 — `RegistroSheet` cria registo + media sem rollback
- **Ficheiro:** [src/components/operacao/RegistroSheet.tsx:88,103](../../../src/components/operacao/RegistroSheet.tsx)
- **Sintoma:** Insert `operacao_registros` → loop insert `operacao_registro_media`. Se inserts de media falharem, registro fica "vazio" sem toast de erro.
- **Fix esperado:** RPC ou tratamento explícito do erro. Custo S.

### OP-ERR-13 🟨 — `EtapasTable.onDragEnd` faz N updates paralelos sem transação
- **Ficheiro:** [src/components/operacao/desktop/EtapasTable.tsx:251,265](../../../src/components/operacao/desktop/EtapasTable.tsx)
- **Sintoma:** Reorder via DnD chama `Promise.all` de N `update display_order`. Optimistic write sem rollback (L260).
- **Impacto:** ordering pode ficar inconsistente em falha parcial.
- **Fix esperado:** RPC `reorder_etapas(frente_id, [etapa_id_in_order])`. Custo S.

---

## 3.5 Queries sem error handling

Praticamente **todos** os `useQuery` no módulo (excepto `EtapaDetail` e `EventListWithPhase`) não consomem `error` nem `isError`. Resultado: falhas de rede / RLS deny / SQL errors mostram-se como "sem dados" silencioso.

### OP-ERR-14 🟧 — `EventoPhase` (fase Evento live) tem **6 queries sem error handling** com `refetchInterval: 30s`
- **Ficheiro:** [src/components/operacao/event/EventoPhase.tsx:46,65,68,90,107,119,122,135,138](../../../src/components/operacao/event/EventoPhase.tsx)
- **Sintoma:** Em fluxo evento-ao-vivo (Festival Coala 28 maio), as queries refetcham a cada 30s. Se a rede falhar (acontece em festival), o utilizador continua a ver dados antigos sem indicação de "offline" ou "última atualização há X minutos".
- **Impacto:** ⚠️ **CRÍTICO no Coala** — director vê feed de chamados desactualizado e age sobre informação stale.
- **Fix esperado:** consumir `error`/`dataUpdatedAt`; mostrar banner "offline" / "última actualização há Xs". Custo S.

### OP-ERR-15 🟧 — `Dashboard` mostra zeros sem CTA quando `filters.event` é null
- **Ficheiro:** [src/pages/operacao/Dashboard.tsx:40,46](../../../src/pages/operacao/Dashboard.tsx)
- **Sintoma:** `useQuery` tem `enabled: !!filters.event`. Quando user entra `/operacao/dashboard` directamente sem evento pré-seleccionado, todas as charts vêm vazias e KPIs `0` — sem mensagem "escolhe evento".
- **Impacto:** confusão na primeira impressão.
- **Fix esperado:** estado vazio com "Escolhe um evento" + auto-select primeiro evento se houver só um. Custo S.

### OP-ERR-16 🟨 — Outras páginas com `error` ignorado (catálogo)

Lista completa de queries que ignoram `error`/`isError` (consumidos por: `Atividade`, `ChamadoDetail`, `ChamadoNovo`, `Dashboard`, `FrenteDetail`, `MeusChamados`, `MinhasTarefas`, `MyFrentes`, `StaffList`, `EditEtapaSheet`, `EtapaAssigneeSheet`, `FrentePickerDialog`, `FrenteTeamSheet`, `MediaCapture`, `NewEtapaDialog`, `NewFrenteDialog`, `RegistroFeed`, `RegistroSheet`, `EtapaKanban`, `EtapasTable`, `FrenteTeamEditor`, `OperacaoFiltersBar`, `EditFrenteSheet`, `EventListWithPhase`, `EventoPhase`, `FrentesPanel`, `PlanejamentoPhase`, `AddSupplierToEtapaDialog`, `EtapaSuppliersPanel`).

Fix sistémico: criar wrapper `useOpQuery` que mostra toast em `onError` por padrão. Custo M (cross-cutting refactor).

---

## 3.6 `confirm()` / `alert()` nativos

Ações destrutivas ou de alto impacto a usar `window.confirm` em vez de `<AlertDialog>` shadcn. Inconsistente com resto da app.

| ID | Ficheiro:linha | Acção | Severidade |
|---|---|---|---|
| OP-ERR-17 | [EventHub.tsx:53](../../../src/pages/operacao/EventHub.tsx) | **Avançar fase do evento** (semi-irreversível) | 🟧 |
| OP-ERR-18 | [EditEtapaSheet.tsx:166](../../../src/components/operacao/EditEtapaSheet.tsx) | Eliminar etapa | 🟧 |
| OP-ERR-19 | [event/EditFrenteSheet.tsx:127](../../../src/components/operacao/event/EditFrenteSheet.tsx) | Eliminar Zona/Serviço (com cascade etapas) | 🟧 |
| OP-ERR-20 | [event/EventTeamSection.tsx:47](../../../src/components/operacao/event/EventTeamSection.tsx) | Remover member (top) | 🟨 |
| OP-ERR-21 | [event/EventTeamSection.tsx:349](../../../src/components/operacao/event/EventTeamSection.tsx) | Remover member (sheet) | 🟨 |
| OP-ERR-22 | [suppliers/EtapaSuppliersPanel.tsx:48](../../../src/components/operacao/suppliers/EtapaSuppliersPanel.tsx) | Remover fornecedor da etapa | 🟨 |
| OP-ERR-23 | [AudioRecorder.tsx:51](../../../src/components/operacao/AudioRecorder.tsx) | `alert()` em mic denied | 🟨 |

**Fix esperado:** substituir por `<AlertDialog>` shadcn com descrição clara dos efeitos. Padrão a alinhar com `H-GLB-2` do audit MP Gestão. Custo S por sítio (XS-S agregado, ~M total).

---

## 3.7 Permissões inconsistentes / RLS-only gates

### OP-ERR-24 🟧 — `ChamadoNovo` sem gate UI
- **Ficheiro:** [src/pages/operacao/ChamadoNovo.tsx](../../../src/pages/operacao/ChamadoNovo.tsx)
- **Sintoma:** Sem `if (!canView) return ...` no topo. Depende inteiramente de RLS para bloquear utilizadores não autorizados.
- **Impacto:** User sem `open_chamado` consegue carregar a página e submeter form — só vê erro no final. UX má (frustração com formulário rejeitado).
- **Fix esperado:** gate UI explícito com mensagem "Sem permissão". Custo XS.

### OP-ERR-25 🟧 — `ChamadoDetail` mostra botão "Iniciar"/"Resolver" para qualquer user
- **Ficheiro:** [src/pages/operacao/ChamadoDetail.tsx:100-104](../../../src/pages/operacao/ChamadoDetail.tsx)
- **Sintoma:** Botões aparecem enquanto chamado é `open`/`in_progress`, sem gate UI. RLS rejeita ações de não-autorizados — utilizador clica e vê erro só depois.
- **Fix esperado:** condicionar visibilidade com `canManageChamado` (`is lead OR has manage_chamados OR is author`). Custo S.

### OP-ERR-26 🟧 — `EtapasTable` lista suppliers de TODAS as empresas
- **Ficheiro:** [src/components/operacao/desktop/EtapasTable.tsx:219](../../../src/components/operacao/desktop/EtapasTable.tsx) + [suppliers/AddSupplierToEtapaDialog.tsx:35](../../../src/components/operacao/suppliers/AddSupplierToEtapaDialog.tsx)
- **Sintoma:** `select("id,name").order(...).limit(500)` em `suppliers` sem `.eq("company_id", currentCompanyId)`. Em ambiente multi-tenant com RLS leak teórico, ou apenas em desenvolvimento, aparecem fornecedores de outras empresas.
- **Impacto:** depende de RLS — se policy `suppliers` filtrar por company_id, está OK; se não, é leak.
- **Fix esperado:** adicionar `.eq("company_id", ...)` defensivamente em ambos os sítios. Custo XS.

### OP-ERR-27 🟨 — `viewer` recebe `open_chamado` mas não `view_operacao`
- **Ficheiro:** [supabase/migrations/20260519001754_3eb962fa-…sql:175,179](../../../supabase/migrations/20260519001754_3eb962fa-7928-4543-880e-bfb1daf1d4c6.sql)
- **Sintoma:** Role `viewer` pode abrir chamado mas não tem permissão para ver registos. Cria chamado e não consegue acompanhar.
- **Fix esperado:** decisão de produto — ou dar `view_operacao` ao viewer ou remover `open_chamado`. Custo XS (após decisão).

---

## 3.8 Bugs reproduzíveis com impacto operacional

### OP-ERR-28 🟧 — `FrentesPanel` botão "Show indoor" / "Conferência" — botões mortos (já listado OP-ERR-03, repetido por categoria)

### OP-ERR-29 🟨 — `EtapaInlineCell` faz duplo-save em Enter+Blur
- **Ficheiro:** [src/components/operacao/desktop/EtapaInlineCell.tsx:70,73](../../../src/components/operacao/desktop/EtapaInlineCell.tsx)
- **Sintoma:** Premir Enter dispara `save()` e em seguida o `blur` dispara outro `save()` com o mesmo valor.
- **Impacto:** duas chamadas DB por edição; com debounce parcial pode causar race se valor mudou entre as duas.
- **Fix esperado:** flag `saved` interna que ignora `onBlur` se já saved. Custo XS.

### OP-ERR-30 🟨 — `EtapaKanban` optimistic sem rollback real
- **Ficheiro:** [src/components/operacao/desktop/EtapaKanban.tsx:95,108](../../../src/components/operacao/desktop/EtapaKanban.tsx)
- **Sintoma:** Card move-se imediatamente para nova coluna; se update falhar, único "rollback" é `invalidateQueries` — UI pisca durante 200-500ms até refetch.
- **Fix esperado:** restaurar estado anterior em catch antes do invalidate. Custo S.

### OP-ERR-31 🟨 — `RegistroFeed` lightbox fecha em clique nos controlos do vídeo
- **Ficheiro:** [src/components/operacao/RegistroFeed.tsx:114](../../../src/components/operacao/RegistroFeed.tsx)
- **Sintoma:** `<div onClick={close}>` envolve o `<video controls>`. Clicar em play/pause/volume fecha o lightbox.
- **Impacto:** impossível usar controlos do vídeo em mobile (onde toque é necessário).
- **Fix esperado:** `<div onClick={(e) => e.target === e.currentTarget && close()}>` ou backdrop separado. Custo XS.

### OP-ERR-32 🟨 — `MyFrentes` push prompt sem cleanup async
- **Ficheiro:** [src/pages/operacao/MyFrentes.tsx:18-30](../../../src/pages/operacao/MyFrentes.tsx)
- **Sintoma:** IIFE async dentro de `useEffect` sem AbortController nem cleanup. Se utilizador navega antes do `getPushPermission()` resolver, `setShowPushPrompt` corre em componente desmontado (warning consola; React 18 suprime).
- **Fix esperado:** flag `mounted` ou AbortController. Custo XS.

### OP-ERR-33 🟨 — `NewProfileInlineDialog` race "Perfil criado mas não encontrado"
- **Ficheiro:** [src/components/operacao/shared/NewProfileInlineDialog.tsx:46-50](../../../src/components/operacao/shared/NewProfileInlineDialog.tsx)
- **Sintoma:** Após `create-user` edge function, faz `select * from profiles where email=...` para obter `id`. Se trigger de auth criou profile com email normalizado diferente (lowercased? trimmed?), o select devolve 0 rows e o dialog falha com "Perfil criado mas não encontrado".
- **Fix esperado:** retornar `profile_id` directamente do edge function, evitar o select pós-criação. Custo XS.

### OP-ERR-34 🟨 — `FrenteCard` expressão tautológica
- **Ficheiro:** [src/components/operacao/FrenteCard.tsx:53](../../../src/components/operacao/FrenteCard.tsx)
- **Sintoma:** `chamadosOpen > 0 && (mode === "evento" || mode === "post" || chamadosOpen > 0)` — o último termo torna o `&&` à esquerda redundante (se `chamadosOpen > 0` for true, a expressão à direita é sempre true). Provável intenção: mostrar contagem se houver chamados E estiver em evento/post.
- **Fix esperado:** verificar intenção e remover redundância. Custo XS.

### OP-ERR-35 🟨 — `Dashboard period="all"` calcula data ~9999 dias atrás
- **Ficheiro:** [src/pages/operacao/Dashboard.tsx:40](../../../src/pages/operacao/Dashboard.tsx)
- **Sintoma:** `periodStart` para "all" gera ISO 1999-… String funciona em comparações ISO mas é ugly.
- **Fix esperado:** `period="all" → ignore filtro de data`. Custo XS.

### OP-ERR-36 🟨 — `OperacaoFiltersBar` força primeiro evento sem opção "Todos"
- **Ficheiro:** [src/components/operacao/desktop/OperacaoFiltersBar.tsx:56-60](../../../src/components/operacao/desktop/OperacaoFiltersBar.tsx)
- **Sintoma:** `useEffect` selecciona `events[0].id` no primeiro render. Não há opção "Todos os eventos" no `<Select>`. Director cross-evento não pode ver agregado.
- **Fix esperado:** opção `"all"` na lista de eventos. Custo XS.

---

## 3.9 RLS / dados

Não foi feita auditoria SQL exaustiva nesta passagem (audit anterior em `docs/audits/2026-05-19-operacao-redesign/analise.md` cobriu schema, RLS e triggers). Pontos relevantes para erros funcionais:

### OP-ERR-37 🟨 — `event_team_members` sem FORCE RLS
- **Migration:** [20260519102809_f4150545-…sql:26](../../../supabase/migrations/20260519102809_f4150545-5c6b-4604-aea7-d979d3365341.sql)
- **Sintoma:** RLS `ENABLE` mas não `FORCE` — owners da tabela bypassam policies.
- **Fix esperado:** `ALTER TABLE ... FORCE ROW LEVEL SECURITY`. Custo XS.

### OP-ERR-38 🟨 — `event_team_member_zones` sem RESTRICTIVE de company isolation
- **Migration:** [20260519102809_f4150545-…sql:36](../../../supabase/migrations/20260519102809_f4150545-5c6b-4604-aea7-d979d3365341.sql)
- **Sintoma:** Depende inteiramente do parent `event_team_members` para isolamento.
- **Fix esperado:** policy RESTRICTIVE `(SELECT company_id FROM event_team_members WHERE id = member_id) = current_company_id()`. Custo S.

### OP-ERR-39 🟨 — Migrations duplicadas (3 pares)
- **Ficheiros:** `20260519001613` ↔ `20260519004607`; `20260519001754` ↔ `20260519004753`; `20260519003747` ↔ `20260519004823`
- **Sintoma:** Idempotente (cron.unschedule + cron.schedule, IF NOT EXISTS, OR REPLACE) — não causa erros mas re-agenda crons no histórico.
- **Fix esperado:** documentar em `docs/migrations/known-duplicates.md`. Custo XS.

---

## Sumário

| Categoria | P0 🟥 | P1 🟧 | P2 🟨 |
|---|---:|---:|---:|
| Rules of Hooks | 1 | 1 | 0 |
| Botões mortos | 1 | 1 | 0 |
| Loading vs not-found | 0 | 2 | 0 |
| Multi-step writes | 0 | 4 | 2 |
| Queries sem error | 0 | 2 | 1 |
| `confirm()`/`alert()` | 0 | 3 | 4 |
| Permissões | 0 | 3 | 1 |
| Bugs operacionais | 0 | 0 | 8 |
| RLS / dados | 0 | 0 | 3 |
| **TOTAL** | **2** | **16** | **19** |

**Bottom line:** 2 P0 (FAB hooks violation + templates mortos) que pedem fix imediato; 16 P1 que vão atrapalhar o Coala mas não bloquear; 19 P2 para sprint pós-evento.
