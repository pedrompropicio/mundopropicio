---
name: Partner Settlement & Paid Expenses
description: Regras de Despesas Pagas por Sócios e Fecho com Parceiros — vínculo, escopo Master+subs, status automático, transitórias/cauções
type: feature
---

# Despesas Pagas por Sócios

**Conceito**: rótulo que indica que uma despesa do evento foi adiantada do bolso de um sócio. NÃO é categoria especial, NÃO consome BP, NÃO cria nova despesa — apenas marca quem desembolsou. No Fecho com Parceiros, o valor vira crédito a favor do sócio.

## Regras
- **Qualquer categoria** do plano de contas que aceite despesa em evento (não restrito a BP nem a overhead)
- **Sem limite de orçamento** — não consome saldo do BP
- A despesa **continua a contar normalmente** no DRE, no Fecho e no rateio com sócios (impacta resultado do evento)
- Único efeito diferencial: no acerto, o valor é creditado ao sócio que pagou

## Escopo do painel "Desp. Sócios" (Master)
Em turnês/multi-dia (event com `parent_event_id` null e subs):
- Lista despesas com `event_id` no Master **e em todos os sub-eventos** (`parent_event_id = master.id`)
- Cada despesa mostra a coluna "Evento" identificando a qual cidade/dia pertence
- Filtro `partner_paid_expenses.event_id IN (master_id, ...sub_ids)`

## Aprovação de propostas (editora)
`partner_paid_expenses` tem `status` ('approved' | 'pending_approval', default 'approved'), `proposed_by`, `approved_by`, `approved_at`.
- **Editor**: vê a aba Sócios (sem `EventPartnersTab` nem gestão de acessos) e pode propor vínculos → nascem `pending_approval`, **sem tocar na transação**; badge "Aguarda aprovação"; pode remover a própria proposta pendente.
- **Admin/manager**: fluxo instantâneo inalterado (vínculo `approved` + tx `paid` com `payment_date = paid_date`). Nas propostas pendentes tem Aprovar (status→approved, approved_by/at, tx→paid com `paid_date`, registo em `transaction_audit_log`) e Rejeitar (apaga o vínculo, tx intocada).
- **Todos os agregadores contam SÓ `status='approved'`**: totais por sócio no painel, `PartnerSettlementTab`, `EventFecho`, `PartnerEventDetail` (portal do sócio), `ReportBPTransactions`, `ReportPartnerExpenses`, `ReportPartnerSettlement`, badge "Pago por Sócio" em `/transacoes` e `TransactionRow`.
- RLS: INSERT admin/manager (qualquer status) + INSERT editor só `pending_approval` com `proposed_by = auth.uid()`; UPDATE só admin/manager; DELETE admin/manager ou editor na própria proposta pendente.

## Fluxo unificado: toggle "🤝 Pago por Sócio" no lançamento/edição
Os dois caminhos escrevem SEMPRE em `partner_paid_expenses` (UNIQUE em `transaction_id` impede vínculo duplo).
- **TransactionFormModal** (criação, tx simples e rateio Master): toggle abre sócio (`event_partners` do evento/Master, com herança) + data obrigatória. Insert com `status = admin/manager ? 'approved' : 'pending_approval'`, `proposed_by`, `approved_by/at` só quando aprovado. Só liquida a transação (`paid`, `payment_date = paid_date`, `account_id = null`) quando quem lança pode aprovar (`partnerPaidSettles`); proposta de editor deixa a transação no estado normal (pending/approved conforme BP). Sem sócios no evento o toggle fica desativado com aviso (já não desaparece).
- **TransactionEditModal**: bloco azul permite trocar o sócio, editar a data e remover o vínculo; admin/manager sempre, restantes papéis só na própria proposta pendente (`canManagePartnerPaidLink`). Overrides de liquidação (`account_id = null`, `payment_date`) só se aplicam a vínculos aprovados (`partnerPaidSettled`).
- O painel `PartnerPaidExpensesPanel` do evento mantém-se como visão de conferência/aprovação e vinculação de despesas já existentes.


## Status automático ao vincular
Ao criar `partner_paid_expenses`:
1. Insert com `paid_date` informada pelo utilizador (default = hoje)
2. UPDATE `transactions SET status='paid', payment_date=paid_date` para a transação vinculada
3. Mensagem: "Despesa vinculada e marcada como paga"

## Filtro "Pago por Sócio" em /transacoes
- Agrupa por `supplier_id` (identidade real do sócio), não por `partner_id` (que é por evento)
- Lista distinct de sócios cadastrados em eventos com `status <> 'completed'`
- Map `transaction_id → Set<supplier_id>` via join `partner_paid_expenses → event_partners.supplier_id`

## Fecho com Parceiros
- Soma despesas pagas por sócio por sócio
- Compara com participação % nos resultados (lucro/prejuízo conforme `partner_calc_basis`)
- Diferença = a pagar/receber do sócio

## Cauções / transitórias (is_transitory)
Despesas com `is_transitory = true` (ex: caução de venue) **não compõem o resultado/DRE** mas entram no acerto societário como crédito até serem devolvidas.

### NUNCA são rateadas entre sub-eventos (Master/Splits)
Cauções/transitórias ficam **sempre como lançamento único no evento Master**. Como não compõem
resultado por sub-evento, o rateio por cidade não tem propósito contabilístico e geraria filhos
"fantasma" no acerto. Implementação em `TransactionFormModal.tsx → createMutation`:
- Se `isTransitory && isSplit && splitMasterEventId` → força `data.event_id = splitMasterEventId`
  e cai no caminho de transação simples (não cria parent + children).
- A condição da branch split (`isSplit && splitEntries.length >= 2 && !isTransitory`) e a
  validação pré-submit (`isSplit && !isTransitory`) garantem o bypass das regras de rateio.
- UI mostra aviso cyan no painel de split: "🛡️ Caução / Transitória sem rateio: gravada como
  lançamento único no evento Master (...)".
- O vínculo `partner_paid_expenses` continua a ser criado normalmente, agora apontando ao Master
  (via fluxo simples, linha ~1145), tanto para sócio quanto para Mundo Propício (órfã).

### Atalho "🛡️ Caução / Transitória" no lançamento (TransactionFormModal)
Botão admin/manager que ativa `is_transitory=true` e abre selector **Pago por**:
- **Mundo Propício (caixa da empresa)** — opção default. Transitória órfã (sem vínculo a sócio).
- **Sócio X** — ativa `isPaidByPartner=true` + `paidByPartnerId` + pede `partnerPaidDate`. Cria `partner_paid_expenses` com a tx vinculada.

O antigo botão "🔄 Marcar como Transitória" foi **removido** — era duplicado (mesma flag `is_transitory`) e gerava confusão. O atalho "🛡️ Caução / Transitória" é a única entrada e cobre os dois casos (MP ou sócio).

### Cálculo no acerto (`PartnerSettlementTab`)
1. **Sócio externo**: `transitoryCredit = max(0, Σ transitória.expense vinculadas − Σ transitória.income vinculadas)` (via `partner_paid_expenses`)
2. **Mundo Propício (sócia principal)**: `transitoryCredit = max(0, Σ transitória.expense ÓRFÃS − Σ transitória.income ÓRFÃS)` — todas as transitórias do evento sem vínculo a `partner_paid_expenses`
3. `operationalSettlement = partnerShare + totalPaidByPartner − totalPartnerExtras` (caixa real, liquidável agora)
4. `settlement = operationalSettlement + transitoryCredit` (saldo total, só liquidável após retorno das cauções)

### Separação Operacional vs Cauções (exposição de caixa)
Cauções pendentes **não são receita do evento** — são caixa retido (ex: no venue) que volta quando devolvido.
Para evitar leitura enganosa do tipo "MP deve pagar X ao sócio" quando parte de X depende de cauções a recuperar:
- Card do sócio: grid de **6 colunas** (Quota / Pagas / Extras / **Operacional** / Cauções / **Saldo c/ Cauções**) + nota cyan explicativa quando `transitoryCredit > 0`
- Badge no header: quando há cauções pendentes mostra dois chips ("Operacional X" + "+ Caução Y")
- Resumo Financeiro: bloco cyan "🛡️ Cauções pendentes (fora do resultado)" com split MP vs sócios externos + total caixa retido + nota explicativa
- PDF tabela "3. Distribuição": colunas Operacional + Cauções + Saldo c/ Cauções; PDF "4. Detalhes": direcção operacional ("liquidável agora") + linha de nota se há cauções

### Queries / UI
- `paidExpenses` query traz `is_transitory, type, status, category_id, account_categories(id,name,code,parent_id)` da tx vinculada
- `totalPaidByPartner` (afeta resultado) **exclui** transitórias; `transitoryItems` lista-as à parte
- **Categoria no detalhe das cauções**: helper `buildCategoryPath(category_id)` resolve a cadeia de pais via `allCategories` e devolve "L1 > L2 > L3" (com códigos), exibido nas tabelas PDF "Cauções/transitórias pagas pelo sócio" e "4a. Cauções pagas pela Mundo Propício" — dá contexto contabilístico completo, não apenas o nome da folha
- Fecho do Evento (DRE) continua intocado — transitórias só aparecem aqui no acerto

### Exemplos
- Caução 5 000 € paga por Sócio A, sem devolução → +5 000 € no acerto de A
- Caução 5 000 € paga pela empresa (MP), sem devolução → +5 000 € no acerto da Mundo Propício
- Devolução transitória de 5 000 € para Sócio A (vinculada como income) → crédito de A = 0
- Devolução transitória de 5 000 € para conta da empresa (sem vínculo) → abate o crédito da MP, não dos sócios externos

## Onde nasce o vínculo "Pago pelo Sócio" (decisão final)

- **Criação/edição de transação: NÃO existe** opção de sócio (removida do `TransactionFormModal`).
- **Modal de pagamento (`TransactionPaymentModal`)**: bloco "Pago pelo Sócio" (só despesas, só se o evento tiver sócios e não existir vínculo). Esconde conta/método; usa a Data de Pagamento do modal como `paid_date`.
  - admin/manager → vínculo `approved` + transação `paid` (`account_id = null`), auditoria em `transaction_audit_log`.
  - outros papéis → vínculo `pending_approval` (`proposed_by`), transação intocada.
- **Painel do evento** mantém conferência/aprovação. Unicidade garantida por `UNIQUE(transaction_id)` em `partner_paid_expenses`.

## `events.partner_calc_basis` — porque existe (contexto de negócio)

O critério de fecho do resultado **difere consoante a empresa sócia/parceira seja
do Brasil ou de Portugal**. É essa a razão de existir o campo:

- `net_result` — Receitas s/IVA − Despesas s/IVA (40 dos 44 eventos).
- `net_result_gross_expenses` — Receitas s/IVA − Despesas **c/IVA** (ex.: Anitta EDA 2026,
  parceiro brasileiro: o IVA português não é recuperável do lado dele, logo a despesa
  entra bruta no acerto).
- `gross_revenue` — só receitas s/IVA, sem despesas operacionais.

O campo continua a ser **o valor gravado do evento** e é o **valor inicial** do toggle
de IVA do seletor de critério do Fecho. O toggle é de escolha livre do utilizador e
**nunca escreve** em `partner_calc_basis`. Não há avisos de "vista alternativa" nem
referências a base contratual no ecrã ou no PDF — o PDF apenas indica "c/IVA" ou
"s/IVA" junto aos totais.

## Seletor de critério do Fecho (`useFechoBasis` + `FechoBasisSelector`)

Presente no Encontro de Contas (`PartnerSettlementTab`) e no Fecho do Evento (`EventFecho`):

- **IVA nas despesas**: s/IVA ↔ c/IVA (inicial: `partner_calc_basis`).
- **Base da despesa**: `realized` (transações, default) ou `committed` (linhas aprovadas do BP).
- **Incluir overhead**: default **ON** (comportamento histórico).
- **Incluir transações fora do BP**: default **OFF**; só ativo na base `committed`.

Persistido em `localStorage` por user+evento. Propaga ao PDF, que imprime o critério
no cabeçalho (`describeFechoBasis`). Cálculo via `@/lib/event-cost-basis` (IVA linha a linha).
