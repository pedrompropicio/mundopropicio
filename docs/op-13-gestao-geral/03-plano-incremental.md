# 03 — Plano incremental (6 dias, 22-27 maio)

Sequência diária com um único deliverable focado por dia. Coala arranca 28 maio.

**Gate de início (Dia 0, hoje 19 mai):**
- ✅ Auditoria, arquitectura, mapa rotas/componentes redigidos (este dossier).
- ⏳ Correr `pg_policies` SQL no SQL editor da Lovable (ver [01-arquitetura.md §5](./01-arquitetura.md)). Bloqueia Dia 2 se admin não consegue SELECT cross-evento em `operacao_etapas`.
- ⏳ Confirmar com Pedro: rota colisão `/operacao/chamados` (Opção A do [01-arquitetura.md §8](./01-arquitetura.md)) e bulk actions fora de scope.

---

## Dia 1 — Sidebar reorganizada + stub `/operacao/etapas`

### O quê
Editar `AppSidebar.tsx` para mostrar os 4 items permanentes (Dashboard, Etapas, Zonas/Serviços, Chamados) + divisor + items pessoais. Criar rota `/operacao/etapas` com página esqueleto (header + filtersBar + empty state — sem queries).

### Quem dispatcha
**Lovable** (UI-only, refactor simples).

### Estimativa
2-3 horas dev.

### Critérios de aceitação
- [ ] Sidebar quando estás em `/operacao/*` mostra: Dashboard · Etapas · Zonas/Serviços · Chamados · [divisor] · Eventos · Minhas Tarefas · Meus Chamados · Atividade · [divisor] · Staff.
- [ ] Mobile (w-16): items com `title=` tooltip mostram label ao hover. Divisor visualmente claro.
- [ ] `isActive` correcto em todos os items (exact match em `/operacao`, prefix em outros).
- [ ] Item "Staff" só aparece se `manage_operacao_staff` ou admin.
- [ ] Field staff scoping (`useIsFieldStaffOnly`) continua a esconder tudo excepto `/operacao*` items.
- [ ] Rota `/operacao/etapas` carrega página com título "Etapas", subtítulo "Lista cross-evento", `OperacaoFiltersBar` (existente), e empty state "Em breve" — sem queries.

### Dependências
Nenhuma (gate inicial validado).

### Risco de bloqueio
Baixo. Refactor isolado a AppSidebar + 1 rota stub.

---

## Dia 2 — Lista Etapas L2 funcional (prioridade máxima)

### O quê
Implementar `/operacao/etapas` completamente: hook `useOperacaoListFilters('etapas')`, `useScopedEventIds()`, queries com embed disambiguation, `OperacaoListShell`, `EtapaListRow`, `EtapasFiltersBar`. Paginação server-side. Drill-down para `/operacao/etapa/:id`.

### Quem dispatcha
**Lovable** (UI + queries) — embeds e paginação são padrões já usados na base.

### Estimativa
1 dia (6-8h).

### Critérios de aceitação
- [ ] Página lista todas as etapas do evento seleccionado, ordenadas por `planned_start` ascendente (nulls last).
- [ ] Filtros funcionais: event (single, herdado), frentes (multi-chips), status (multi-badges), responsibility (Meus/Sem/Todos), sort (4 opções).
- [ ] Filtros propagados via URL search params; reload preserva estado.
- [ ] Embed `frente:operacao_frentes!operacao_etapas_frente_id_fkey` confirmado a funcionar (sem erro 500).
- [ ] Empty state com mensagem útil + botão "Limpar filtros".
- [ ] Loading state com skeleton ou texto "A carregar…" (alinhado com padrão MontagemPhase).
- [ ] Error state com `<Alert>` + botão retry.
- [ ] Refresh manual com indicador "atualizado há Xs".
- [ ] Click numa row navega para `/operacao/etapa/:id`.
- [ ] Paginação: 50 por página, "Carregar mais" infinito (não numbered).
- [ ] Mobile-first: row legível em iPhone (Pedro testa).
- [ ] Admin/platform_admin sem team consegue ver etapas via `useScopedEventIds`.

### Dependências
- Dia 1 (sidebar + stub).
- ⏳ pg_policies verification (gate). **Se admin é bloqueado por RLS, parar e adicionar policy bypass — pode atrasar Dia 2 para meio-dia Dia 3.**

### Risco de bloqueio
**Médio.** RLS gotcha é o risco principal. Mitigação: validar com query manual `SELECT count(*) FROM operacao_etapas` como admin platform_admin **antes** de começar codificação.

---

## Dia 3 — Drill-down do Dashboard para Etapas

### O quê
Tornar os 2 KPIs "Em curso" e "Bloqueadas" do Dashboard clicáveis (`<Link>` wrappers). **Fix dead link L429** (cobertura → etapas com responsibility filter). Smoke test do fluxo: Dashboard → click KPI → lista pré-filtrada.

### Quem dispatcha
**Lovable** (edição localizada em Dashboard.tsx).

### Estimativa
2-3 horas.

### Critérios de aceitação
- [ ] KPI "Em curso" envolto em `<Link to="/operacao/etapas?event=<id>&status=in_progress">`, hover state visível, click navega.
- [ ] KPI "Bloqueadas" idem com `status=blocked`.
- [ ] KPI "Etapas totais" também clicável (sem filtro status — opcional Dia 3, mover para Dia 6 se apertar).
- [ ] Dashboard L429 dead link `/operacao/relatorios?tab=cobertura` substituído por `/operacao/etapas?event=<id>&responsibility=sem_responsavel`.
- [ ] Filtros chegam à lista correctamente (parseCsv funcionando com URL).
- [ ] Voltar do Etapas para Dashboard preserva o evento seleccionado (URL params).

### Dependências
Dia 2 (lista Etapas funcional para aceitar parâmetros).

### Risco de bloqueio
Baixo. Edits cirúrgicos em Dashboard.

---

## Dia 4 — Lista Zonas L1

### O quê
Implementar `/operacao/zonas` com grid de cards `ZonaCard`. Counts de etapas (por status) e chamados abertos por zona. Click navega para `/operacao/frente/:id` (FrenteDetail existente).

### Quem dispatcha
**Lovable**.

### Estimativa
4-6 horas.

### Critérios de aceitação
- [ ] Grid responsivo (1col mobile, 2-3col desktop).
- [ ] Card mostra: barra cor lateral, nome, type badge (Zona/Serviço), count total etapas, produtor (ou "Sem produtor + atribuir"), 4 mini-counters por status, badge chamados abertos se >0.
- [ ] Filtros: event, type (zone/service), status (active/completed). Sort: `display_order`.
- [ ] Click no body do card → `/operacao/frente/:id`.
- [ ] Dropdown `•••` no header da card: Editar (abre `EditFrenteSheet`), Eliminar (admin).
- [ ] Empty state.
- [ ] Mobile testado.

### Dependências
Dia 2 (padrão `useOperacaoListFilters` + `OperacaoListShell` estabelecido).

### Risco de bloqueio
Baixo. Componente decorrente do mesmo padrão; counts são queries simples.

---

## Dia 5 — Lista Chamados L3 + drill-down

### O quê
Implementar `/operacao/chamados` (gestão cross-evento). Renomear rota actual para `/operacao/meus-chamados`. Tornar KPI "Chamados abertos" do Dashboard clicável. Adicionar alias de redirect opcional.

### Quem dispatcha
**Lovable**.

### Estimativa
5-7 horas (lista + rename + drill-down).

### Critérios de aceitação
- [ ] Rota `/operacao/chamados` agora aponta para `ChamadosList` (cross-evento gestão).
- [ ] Rota `/operacao/meus-chamados` aponta para `MeusChamados` (vista pessoal — componente não muda).
- [ ] Alias `<Route path="chamados-meus" element={<Navigate to="/operacao/meus-chamados" replace/>} />` (opcional, se Pedro tinha bookmark).
- [ ] Sidebar item "Chamados" → gestão; "Meus Chamados" → pessoal.
- [ ] Lista cross-evento: filtros event, frentes, status, priority, breaches; sort by `created_at desc` default.
- [ ] Click numa row → `/operacao/chamado/:id`.
- [ ] KPI "Chamados abertos" do Dashboard envolto em `<Link to="/operacao/chamados?event=<id>&status=open,in_progress">`.
- [ ] Mobile testado.

### Dependências
Dia 2 + padrão estabelecido. Confirmar com Pedro a Opção A da rota colisão.

### Risco de bloqueio
**Médio** — se Pedro não confirmar rename, mudar para Opção B (`/operacao/chamados/todos`). Custo: 30min de refactor de paths nos sidebar items.

---

## Dia 6 — Polish + smoke test + buffer

### O quê
- Smoke test E2E dos 6 fluxos críticos (auditoria geral `docs/audits/2026-05-19-operacao/02-fluxos-criticos.md`).
- Polish UX: estados loading consistentes, mensagens empty state com terminologia canónica (Produtor / Staff / Zona / Serviço / Etapa / Chamado).
- Opcional: fix do `QuickActionFab` Rules of Hooks (P0 herdado da auditoria geral) — se ainda não foi resolvido, **dispatchar agora** porque afecta toda a navegação para as novas rotas.
- Opcional: avg KPIs do Cobertura widget clicáveis.
- Opcional: refactor `OperacaoFiltersBar` para usar `useScopedEventIds` (resolve gap admin sem team na barra global do Dashboard também).

### Quem dispatcha
**Lovable** para polish/UX, **Code** se precisar de migration RLS bypass.

### Estimativa
4-8 horas (depende de quantos opcionais entram).

### Critérios de aceitação
- [ ] 6 fluxos da auditoria geral passam smoke test sem ❌.
- [ ] Terminologia consistente nas 3 novas listas + sidebar.
- [ ] Loading/error/empty states alinhados em todas as listas.
- [ ] (Se aplicável) `QuickActionFab` fix dispatchado e validado.
- [ ] Mobile testado nos 3 paths novos.
- [ ] Documentar quaisquer follow-ups em `docs/op-13-gestao-geral/FOLLOWUPS.md`.

### Dependências
Dias 1-5.

### Risco de bloqueio
Baixo (é o dia de buffer). Se algum item P0 herdado bloquear, prioridade absoluta.

---

## Dia 7 (28 maio) — Coala arranca

Nada de dispatchar durante o dia do evento. Apenas:
- Monitoring do EventoPhase (fase Evento Live) com refresh manual.
- Standby para hot-fix de issues `severidade alta` reportadas pelo Pedro.

---

## O que cortar se atrasar

> Coala em produção é mais importante que feature parity.

**Cortar em ordem (primeiro = menos doloroso):**

1. **Dia 6 polish opcionais** — manter só smoke test.
2. **Dia 4 (Lista Zonas L1)** — não é prioritária para o Coala. Diretor pode navegar por evento → fase Setup → ver zonas. Custo de cortar: zero para Coala, médio para próximas semanas.
3. **Dia 3 drill-down (Em curso / Bloqueadas)** — manter só "Chamados abertos" (Dia 5) e adiar os 2 da etapa. Pode-se aceder à lista directamente pela sidebar nova.
4. **Dia 5 rename `/operacao/chamados` → `/operacao/meus-chamados`** — fica para depois; usar Opção B (`/operacao/chamados/todos`) sem rename.

**Não cortar:**
- Dia 1 (sidebar) — sem isto Pedro não tem como chegar às listas.
- Dia 2 (Lista Etapas L2) — é o que ele pediu como prioridade máxima.
- Dia 6 smoke test — garantia de não regressão.

---

## Critérios de "pronto para Coala"

Aos 27 maio às 18h, devem estar verdadeiros:

- [ ] `/operacao/etapas` lista todas as etapas do Coala filtráveis por status, ordenadas por data.
- [ ] `/operacao/chamados` (ou `/operacao/chamados/todos`) lista chamados cross-evento.
- [ ] Sidebar mostra os items permanentes quando user está em `/operacao/*`.
- [ ] Pelo menos 1 KPI do Dashboard navega para lista pré-filtrada (mínimo: Chamados abertos).
- [ ] Mobile funciona — Pedro testou no iPhone.
- [ ] Smoke test dos 6 fluxos críticos passou.

Se faltar algum, prolongar Dia 6 ou cortar (ver acima).

---

## Resumo timeline

```
20 mai (qua)   ← gate decisions (Pedro: rota colisão? bulk fora?)
                ← pg_policies SQL check
22 mai (qui)   Dia 1 — Sidebar + stub etapas
23 mai (sex)   Dia 2 — Lista Etapas L2 funcional (P0)
24 mai (sáb)   Dia 3 — Drill-down Dashboard → Etapas
25 mai (dom)   Dia 4 — Lista Zonas L1
26 mai (seg)   Dia 5 — Lista Chamados L3 + drill-down
27 mai (ter)   Dia 6 — Polish + smoke test + buffer
28 mai (qua)   Coala arranca · monitoring
```

> **NOTA:** o briefing pediu "6 dias 22-27 maio". O dia de hoje (19 mai) é gate/setup; 20-21 mai são para o Pedro validar este dossier antes do dispatch. Se Pedro aprovar mais cedo, antecipa-se 1 dia (Dia 1 → 21 mai) e ganha-se buffer.
