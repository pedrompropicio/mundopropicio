# 03 — Fluxos críticos end-to-end

> Notação: cada passo conta um clique principal (modal abrir conta como passo). Mobile = portrait < 768 px.

---

## Fluxo 1 — Criar um evento do zero (Promotor)

**Entrada:** `/login` → dashboard.

| # | Passo | Cliques | Atrito |
|---|-------|---------|--------|
| 1 | Sidebar → "Eventos" | 1 | OK |
| 2 | Botão "Novo evento" (canto superior direito) | 1 | Em mobile o botão pode ficar abaixo da fold |
| 3 | Modal `EventEditModal` — preencher nome, datas, local, tipo, capacidade | ~10 campos | Sem wizard por etapas — formulário longo |
| 4 | Guardar → vai para `/eventos/:id` aba "Resumo" | 1 | OK |
| 5 | Configurar bilheteira (aba "Bilheteira") | 1 | Sem indicador de que falta configurar |
| 6 | Configurar zonas, lotes, preços | 5+ | Validação capacidade vs zonas (Core rule) só dispara ao guardar |
| 7 | Eventualmente passar a "Confirmed" → cria snapshot v1 do BP automaticamente | 1 | Transição não tem onboarding "o que vai acontecer agora" |

**Total cliques mínimos:** ~15. **Total real para evento utilizável:** ~30.

**Pontos de abandono:**
- Passo 3: utilizador vê 10+ campos sem hierarquia, abandona se não souber o que é "tipo" (festival vs concert vs split).
- Passo 5: nenhuma sugestão visual para "passo seguinte". Promotor pode publicar sem zonas configuradas.

**Mobile:** modal `EventEditModal` ocupa ~95% da tela; botões "Cancelar"/"Guardar" no fundo, exigem scroll. Sem sticky footer.

---

## Fluxo 2 — Lançar uma despesa em um evento (Financeiro)

**Entrada:** dashboard.

| # | Passo | Cliques |
|---|-------|---------|
| 1 | Sidebar → Transações | 1 |
| 2 | "Nova transação" (header) | 1 |
| 3 | Modal `TransactionFormModal` — tipo (despesa), descrição, valor, IVA, conta, evento, fornecedor, categoria L3, data, vencimento, anexos | 12+ campos |
| 4 | Picker de Plano de Contas — abrir, navegar L1>L2>L3, escolher | 3 |
| 5 | Picker de fornecedor — buscar ou criar inline | 2-4 |
| 6 | Anexar fatura (drag-drop ou click) | 1-2 |
| 7 | Guardar | 1 |

**Total:** ~20 cliques.

**Pontos de abandono / atrito:**
- Passo 4: utilizador escolhe L1 ou L2 e o sistema aceita visualmente (cliquável) mas falha ao guardar — Core rule "Only L3 nodes are selectable" não é reforçada visualmente no picker (H-CAD-2).
- Passo 5: criação inline de fornecedor exige todos os dados fiscais — bloqueia se o utilizador não os tem.
- Passo 6: anexo não é obrigatório no schema mas é-o operacionalmente para `is_accounting=true`. Sem checkbox/toggle visível "esta é fatura contabilizável?".
- Memória `accounting-allocation-rules` — utilizador escolhe categoria errada (ex: 2.6.08 genérico em vez de 10/2.9 estrutural) e só descobre na auditoria mensal.

**Mobile:** modal extenso, scroll vertical longo. Pickers de evento/fornecedor com `Combobox` — no iOS Safari o teclado tapa o input.

---

## Fluxo 3 — Gerar nota de reembolso e quitar (Financeiro + Aprovador)

**Refs:** `Reimbursements.tsx`, `ReimbursementNoteDetail.tsx`, `ReimbursementNoteFormModal.tsx`.

### Parte A — Criação (Financeiro)

| # | Passo | Cliques |
|---|-------|---------|
| 1 | Sidebar → Reembolsos | 1 |
| 2 | "Nova Nota" | 1 |
| 3 | Modal: escolher funcionário (lista de `suppliers` filtrada) | 1-2 |
| 4 | Confirmar → criada com status `draft`, abre detail | 1 |
| 5 | Adicionar despesa: dropdown com transações elegíveis | N×2 (uma a uma) |
| 6 | Anexar fatura por despesa (se ainda não tiver) | N |
| 7 | "Aprovar nota" → valida que todas têm fatura, aprova as `pending` | 1 |

**Total para 5 despesas:** ~15 cliques.

**Atrito:**
- Passo 5: adicionar item é sequencial, sem multi-select. Para uma viagem com 12 despesas isto é doloroso.
- Passo 7: validação "missing accounting docs" vem como erro toast (`ReimbursementNoteDetail.tsx:190`) — utilizador não vê quais despesas faltam até ler. Sem destaque na tabela.
- Drill-in da nota substitui a página em vez de URL próprio (H-REM-1) — perde-se partilha de link.

### Parte B — Aprovação e pagamento

| # | Passo | Cliques |
|---|-------|---------|
| 8 | Aprovador: ver banner `ApprovedPaymentListReminder` ou ir manualmente a `/reembolsos?status=approved` | 1-2 |
| 9 | Abrir nota | 1 |
| 10 | Marcar pagamento (conta, data) | 3 |
| 11 | Confirmar | 1 |

**Atrito:** entre "approved" e "pending_payment" e "paid" há 3 estados confusos visualmente similares (badges de cor parecida). Aprovador pode esquecer-se de avançar uma fase. **H-REM-1, H-REM-3.**

**Mobile:** tabela de notas com 5 colunas (`Reimbursements.tsx:174-184`) e `overflow-auto` implícito — sem cards.

---

## Fluxo 4 — Aprovar transação/pagamento (Aprovador)

| # | Passo | Cliques |
|---|-------|---------|
| 1 | Login | 1 |
| 2 | Ver banner `ApprovedPaymentListReminder` (se houver lista pendente) **OU** ver badge no PWA (memória `app-icon-badge`) | 0-1 |
| 3 | Decidir entre 3 sítios: `/transacoes?status=pending`, `/reembolsos?status=approved`, lista de pagamento embebida | mental load alto |
| 4 | Filtrar status, abrir transação, validar, "Aprovar" | 4-5 |
| 5 | Repetir para próxima | … |

**Total para aprovar 5 itens dispersos:** ~20 cliques + navegação entre páginas.

**Pontos críticos:**
- **Não há centro de aprovações.** H-APR-1, H-APR-2, H-APR-3.
- Aprovação em lote só existe para pagamento (`BatchPaymentModal`), não para aprovação status. Aprovador clica 1 a 1.
- Sem "rejeitar com motivo" — só editar e mudar status, perde-se motivação registada.

**Mobile:** o aprovador acaba a usar desktop por necessidade.

---

## Fluxo 5 — Fechar/finalizar um evento (Promotor + Admin)

| # | Passo | Cliques |
|---|-------|---------|
| 1 | `/eventos/:id` → aba "Fecho" (visível só para admin/manager — H-EVT-3) | 2 |
| 2 | Validar transações pendentes, anexar comprovativos finais | N |
| 3 | Resolver pendências sócios (aba "Sócios") | 3-5 |
| 4 | Resolver fecho de bilheteira por sessão (memória `ticket-office-settlement`) | 5+ por sessão |
| 5 | Resolver overhead/rateio (aba "Overhead") | 2-4 |
| 6 | Mudar status para "Completed" | 1 |
| 7 | Sistema cria snapshot do BP (memória `bp-auto-versioning-lifecycle`) | auto |

**Total:** 20-40 cliques + decisões.

**Atrito:**
- Não existe um checklist visual "tudo está pronto para fechar?" — utilizador pode mudar status com pendências e só descobre depois.
- Reabertura (Completed → Active) cria nova versão do BP automaticamente, mas a UI não avisa antes da acção (memória `bp-auto-versioning-lifecycle`).
- Aba "Fecho" tem dependências cruzadas com Cachê, Sócios, Overhead, Bilheteira — sem barra de progresso.

---

## Fluxo 6 — Onboarding novo utilizador (todas as personas)

| # | Passo | Cliques |
|---|-------|---------|
| 1 | Receber convite por email → `/accept-invitation?token=…` | 1 |
| 2 | Definir password (criação de conta) | 3 |
| 3 | Login | 1 |
| 4 | Landing depende do role (`AuthRoute` em `App.tsx:477`): admin/manager → `/`; partner → `/parceiro`; marketing-only → `/audience/dashboard`; camarim-only → `/camarim-equipa` | auto |
| 5 | Ver dashboard sem eventos (se org nova) ou com lista do que existe | — |

**Atrito:**
- Não há tour/wizard de primeiros passos. Utilizador vê dashboard e tem de descobrir o que fazer.
- Sem "demo data" ou exemplo guiado (excepto `/demo/simulador` que é específico).
- `/ajuda` (HelpCenter) existe mas não é mencionado no first-login.
- Para promotor sem evento, dashboard mostra zeros — sem CTA "Criar primeiro evento" (H-DSH-3).

**Mobile:** primeiro acesso é frequentemente em mobile (link em email). Layout responsivo aceitável mas tooltips e densidade hostis.

---

## Fluxo 7 (extra) — Importar bilheteira de um operador externo (Financeiro)

**Identificado como crítico** porque condiciona toda a contabilidade Coala/Fever/Ticketline.

| # | Passo | Cliques |
|---|-------|---------|
| 1 | `/bilheteiras` → escolher evento | 2 |
| 2 | Decidir entre wizard Fever, Coala, Ticketline (3 fluxos diferentes) | 1 |
| 3 | Wizard 4 passos (Fever): upload XLSX 1, upload XLSX 2, mapear, confirmar | 4+ |
| 4 | Reconciliar lotes/sessões/zonas | manual |
| 5 | Confirmar import → cria batch | 1 |

**Atrito:**
- **3 wizards distintos** (`FeverImportModal`, `CoalaImportWizard`, `TicketForecastImportModal`) com UX diferente cada — H-BIL-1.
- Re-import substitui vendas anteriores do mesmo operador (memória `fever-import-system`) — não há diff antes de aplicar.
- Erros de parsing aparecem como toast genérico, sem indicar a linha do XLSX.
- Mobile: completamente inviável (uploads de XLSX, tabelas grandes).

---

## Resumo de cliques por fluxo

| Fluxo | Mínimo | Real (médio) | Mobile-friendly |
|-------|--------|--------------|-----------------|
| 1. Criar evento | 7 | 15-30 | 🟡 |
| 2. Lançar despesa | 8 | 20 | 🔴 |
| 3. Reembolso ponta-a-ponta | 12 | 25 | 🟡 |
| 4. Aprovação | 4 | 20+ | 🔴 |
| 5. Fechar evento | 10 | 30+ | 🔴 |
| 6. Onboarding | 5 | 5 | 🟢 |
| 7. Import bilheteira | 8 | 15 | 🔴 |
