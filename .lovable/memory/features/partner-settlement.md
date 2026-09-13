---
name: Partner Settlement & Paid Expenses
description: Regras de Despesas Pagas por Sócios e Fecho com Parceiros — vínculo, escopo Master+subs, status automático, transitórias/cauções
type: feature
---

> **Terminologia (13/09/2026).** O termo visível ao utilizador para um nó de `event_settlements` é **Fechamento** (raiz: "Fechamento do evento"). "Apuramento" fica como sinónimo histórico; nomes técnicos `settlement` não mudam.

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
- **Base da despesa**: `realized` ("Realizado", transações, default) ou `committed` ("Previsto + excedido"): linhas operacionais aprovadas do BP **mais** o excesso por rubrica (Σ max(realizado − previsto, 0)), que entra sempre.
- **Incluir overhead**: default **ON** (comportamento histórico).
- O antigo toggle "Incluir transações fora do BP" foi removido a 20/08/2026 (ver `event-cost-basis.md`): o excedido deixou de ser opcional e não há UI que o desligue.


Persistido em `localStorage` por user+evento. Propaga ao PDF, que imprime o critério
no cabeçalho (`describeFechoBasis`). Cálculo via `@/lib/event-cost-basis` (IVA linha a linha).

## Base de apuramento POR SÓCIO (D-ERP9, ago/2026)

`event_partners.expense_includes_iva` é **anulável**:

- `NULL` → herda a base contratual do evento (`events.partner_calc_basis`);
- `true` → esse sócio apura sempre com despesas c/IVA;
- `false` → esse sócio apura sempre com despesas s/IVA.

Motivo: a MP produz em Portugal com artistas brasileiros. Um sócio com sede fora de PT
não recupera IVA (o custo dele é o bruto); um sócio português recupera. O mesmo evento
pode ter os dois.

Helpers em `src/lib/partner-calc-basis.ts`: `partnerUsesGrossExpenses(eventBasis, override)`,
`getPartnerEffectiveExpenseBase(...)` e `describePartnerExpenseBasis(...)`.
`gross_revenue` no evento **prevalece** (ignora despesas para todos os sócios).

O seletor `basis.withVat` (`useFechoBasis`) **NUNCA** entra em nenhum valor que componha a
quota, nem nas "pagas pelo sócio"/extras, nem nos pools de liquidez/caução (esses são do
evento e usam a base contratual). O seletor manda só na VISTA: totais do resumo e PDF.

Superfícies alinhadas: `PartnerSettlementTab`, `EventFecho`, `ReportDRE`,
`ReportDREEmpresarial`, `export-dre.ts`, `partner-settlement-report.ts`. Edição do campo
(tri-estado Herda / c/IVA / s/IVA) em `EventPartnersTab`. Quando as bases divergem no
mesmo evento não existe resultado único e a soma das quotas não fecha — nota visível no
ecrã e no PDF.

## (g4) Documento do sócio — estanque e igual em todo o lado

O PDF/XLSX de um sócio (Portal e export da equipa) é a prestação de contas:
só o destinatário pelo nome; os restantes colapsam em "Sócios locais — NN%"
(ou "Mundo Propício — NN%" em acordo bilateral com a casa). Sem "nível",
"fechamento acima/abaixo" ou "bases diferentes". Língua por
`suppliers.doc_locale`. Base de cálculo é do fechamento (ver event-settlements
(g4)); `expense_includes_iva` por participante já não é usado.

## (g4·2) Base a transferir com desembolso efectivo

Base a transferir = parte no fechamento + desembolso efectivo (transações do
sócio + linhas de BP com `paying_partner_id` sem transação, na base do nó) −
adiantado (extras + entradas nas contas de acerto do sócio). IVA 23% só com
`transfer_with_vat`. Ver `src/lib/partner-disbursement.ts`.

## (g5) Linha final do sócio

parte · + desembolso · ± ajustes ao desembolso · − receitas em poder do sócio
(itemizadas) · − extras/adiantamentos · = BASE A TRANSFERIR · + IVA 23% se
`event_settlement_participants.transfer_with_vat` · = TOTAL.

SSoT do cálculo: `src/lib/partner-disbursement.ts`. Painel de capital tem
"Posição de caixa por sócio" (aportes − devoluções + despesas pagas por ele).

## (g7) "Recebido por" nas receitas por encontro de contas

Uma receita liquidada por compensação nunca tem conta (trigger
`force_no_account_on_compensation`). Quando quem fez o encontro de contas com o
terceiro foi um sócio, marca-se na própria transação:
`transactions.held_by_supplier_id` (só em `type='income'` +
`payment_method='compensation'`). No editor aparece o campo "Recebido por"
(vazio = Mundo Propício; opções = sócios do evento). Ao marcar um sócio a
receita fica paga na data da transação — nunca fica "a receber".

Entra no (g5) como quarta fonte de receitas em poder do sócio
(`RevenueHeldSource = "compensation"`, rótulo "Encontro de contas"): painel do
acerto, export de conferência, prestação de contas (secção 5) e Portal (via
`get_partner_settlement_summary`). Nunca duplica com as contas de acerto porque
uma compensação não tem `account_id`.

Base (aplicado 13/09/2026): coluna + índice parcial, CHECK
`transactions_held_by_only_compensation_income`, bloco (C) da RPC, trigger
`trg_enforce_held_revenue_is_paid` e isenção da compensação em
`enforce_tx_paid_requires_account` (uma receita por compensação é paga sem
conta, por desenho).

## Descrições são texto de negócio

Descrições de transações e de linhas de BP escrevem-se como o sócio ou o
contabilista as devem ler. Nunca levam notas de implementação, referências a
fechamentos, "exclusivo", "planilha vNN" ou semelhantes — essa informação vive
nos campos próprios (perímetro/fechamento, devolução, recebido por), visíveis no
editor.

## (g10) Base EFETIVA de despesa de um fechamento — só rótulo

Num fechamento com `returns_parent_deductible_vat = true` a quota vem do
resultado c/IVA do fechamento acima E o IVA dedutível desse perímetro é devolvido
por inteiro — equivale a apurar sobre despesas s/IVA. Logo a base EFETIVA do nó e
de todos os seus participantes apresenta-se como **"Despesas s/IVA"**, mesmo que
a base de cálculo do nó seja c/IVA. Sem devolução, a base efetiva é a do próprio
nó (`parent_share_basis` / `partner_calc_basis`). **O cálculo não muda** — só
rótulos e apresentação.

Fonte única: `src/lib/settlement-basis.ts`
(`effectiveUsesGrossExpenses`, `effectiveExpenseBasisLabel`,
`effectiveBasisShortLabel`, `effectiveResultBasisLabel`). O motor expõe
`returnsParentDeductibleVat` e `effectiveUsesGrossExpenses` no nó e no
participante. Usado no painel de fechamentos, PartnerSettlementTab (ecrã + PDFs),
prestação de contas e Portal do Sócio. Nunca textos específicos de um sócio.

No documento do sócio: com devolução, secção 3/4 dizem "Despesas s/IVA" e
"Resultado s/IVA" e a linha "IVA dedutível recuperado" desaparece (regra de
02/09: descrever o que cada número é, nunca o mecanismo da negociação). O
resultado e as partes ficam iguais ao cêntimo. No painel, o badge da quota passa
a incluir "· IVA dedutível devolvido X" e a linha solta correspondente saiu.

## (g13) Documento do sócio em acordo derivado — cascata desde o evento

Duas regras absolutas no gerador do documento (`buildSoloDocInput` em
`PartnerSettlementTab` → `buildPartnerStatementDoc`):

1. **Despesas e receitas do documento são SEMPRE o perímetro da raiz**, pela
   fonte única `collectSettlementExpenseDocLines` (`src/lib/event-settlement-inputs.ts`)
   filtrada com `keepRootPerimeter`. É a MESMA aritmética dos totais do evento
   (critério do Fecho: realizado ou previsto + excedido, overhead pelo toggle,
   excedido por rubrica itemizado por `computeOutsideBpExcessLines`). Nunca as
   linhas do apuramento do sócio — o bug de 13/09 mostrava 587.610,42 c/IVA em
   vez de 1.931.219,49.
2. **Cascata (`cascade` no input do documento).** Quando o acordo apura sobre
   parte do resultado do evento, a secção 4 desce: resultado do evento − partes
   dos sócios de cada acordo acima (PELO NOME, com a percentagem: nominal se o
   participante é nominal, real se acerta) = parte da sociedade (%) + IVA
   dedutível recuperado + receitas exclusivas da sociedade (itemizadas) +
   operações de terceiros (itemizadas) + custos internos = resultado da
   sociedade. A casa nominal do acordo acima nunca é linha: é a própria parte da
   sociedade. Ficam invisíveis: sócios do MESMO acordo (colapsam em "Sócios
   locais" / "Mundo Propício") e acordos ao lado ou abaixo. Na raiz não há
   cascata e nada muda. Com cascata, a secção 2 mostra só as receitas do evento
   (os termos adicionais saem de lá) e `cascadeMismatch > 0,02` imprime aviso
   vermelho em vez de esconder.

## g10 vs g13-b — base de apresentação no documento do sócio

- **Sem cascata** (fechamento raiz) e no **rótulo de base efectiva no ecrã**:
  vale a g10 — um nó que devolve o IVA dedutível apresenta-se "Despesas s/IVA" /
  "Resultado s/IVA" e não fala do mecanismo do IVA.
- **Com cascata** (g13-b): a conta parte do resultado do evento na base da RAIZ
  (c/IVA na Anitta), deduz os sócios acima pelo nome, chega à parte da sociedade
  e soma explicitamente "+ IVA dedutível recuperado" (só o recuperável, g14),
  receitas exclusivas, operações de terceiros e devoluções. A linha do IVA
  **nunca se esconde** — sem ela a conta não fecha.
- Rótulos em cascata: secção 3 "As despesas do evento (despesas c/IVA)";
  secção 4 "O resultado" sem base; linha inicial "Resultado do evento
  (despesas c/IVA)".
- O aviso vermelho "a conta não fecha" é mecanismo permanente: só desaparece
  quando a conta fecha.

## (g11) Receitas em poder do sócio — coluna `type`

O bloco de contas de acerto lê `financial_accounts.type` (nunca `account_type`,
que não existe). Bug de 13/09: as receitas em poder do sócio carregavam 0 sem
erro visível.

## (g12) Detalhe do desembolso por sócio — só apresentação

`src/components/PartnerDisbursementDetail.tsx`, aberto pelo botão "Ver detalhe"
no bloco de cada sócio externo do Encontro de Contas. Mostra exactamente os dados
do export de conferência (linhas do BP agrupadas por rubrica de Nível 2,
transacções pagas pelo sócio, ajustes com sinal, receitas em poder, extras) e a
conta por extenso: parte + desembolso ± ajustes − receitas em poder − extras =
base a transferir (+ IVA 23% quando `transfer_with_vat`). Se o detalhe não bate
com o resumo, aviso vermelho com a diferença — nunca se ajusta para fechar.

## Estado publicado (13/09/2026)

g7, g9c, g10, g11, g12, g13, g13-b e g14 estão em produção. Referências da Anitta
EDA 2026: ANITTA 417.293,42 · RAFAEL LOBO 178.840,04 · nível 3 547.906,69 · EIN
273.953,35 · IVA devolvido 262.459,85 · base a transferir da EIN 230.990,35.

## (g15) Relatório interno do Encontro de Contas — PDF reformulado

Botão "Exportar PDF → Relatório completo (gestão)". Gerador novo:
`src/lib/partner-settlement-internal-report.ts` (modelo puro) +
`src/lib/export-partner-settlement-internal-pdf.ts` (jsPDF A4 **retrato**). O
antigo `exportPdf()` embutido em `PartnerSettlementTab.tsx` (A4 horizontal, com
quebra de página por secção) foi removido.

É vista de STAFF: pode nomear o fechamento e todos os sócios (os termos proibidos
valem só para documentos de sócio).

Secções: 1 resultado do evento no perímetro raiz · 2 cascata até este fechamento
(igual à g13/g13-b, com nomes: raiz → sócios de cima → parte deste fechamento →
+ IVA dedutível recuperado → + exclusivos → + operações de terceiros →
+ devoluções g6 → − despesas exclusivas do nó) provada contra o resultado do nó
do motor · 3 distribuição (modo, %, base efectiva g10, onde acerta) · 4 por sócio
a linha g5 completa + os quadros do "Ver detalhe" g12 · 5 posição da Mundo
Propício · 6 anexos A bilheteira e B **despesas por categoria na base do
critério** (previsto + excedido, com overhead), não transações realizadas.

Regras fixas:
- Nunca se ajusta um número para fechar: `cascadeMismatch` / `partnerBlockMismatch`
  imprimem aviso vermelho com a diferença.
- Participante nominal aparece como "Posição nominal de X · acerta em <fechamento>",
  não como "Acerto com X".
- Sem quebra de página forçada por secção; tabelas pequenas em keep-together,
  grandes com cabeçalho repetido.
- Nos PDFs usar sempre "(-)" e "(+/-)" em ASCII: os sinais − e ± não existem nas
  fontes padrão do jsPDF e saem como caracteres estranhos.

Verificado nos 3 fechamentos da Anitta EDA 2026 (13/09/2026): raiz 596.133,45 ·
Rafael Lobo 178.840,04 · MP + EIN 547.906,69 com IVA 262.459,85 · base a
transferir da EIN 230.990,36 (1 cêntimo de arredondamento face aos 230.990,35 do
ecrã) · anexo B 1.931.219,49. Sem avisos de conta que não fecha.

## g15-b — os totais vêm do SSoT, as linhas são apresentação (2026-09-13)

Em documento não existe "dentro da tolerância". O PDF interno (g15) e o
documento do sócio apresentam EXACTAMENTE os totais calculados pelo SSoT
(`partner-disbursement.ts`: `partnerDisbursement`, `partnerFinancingToReturn`,
base a transferir, IVA e total) — os mesmos objectos que o ecrã usa. Nunca se
re-soma uma lista de linhas já arredondadas para produzir um total.

Regras:
- `reconcileDisplayValues(values, total)` / `reconcileDisplayField(rows, field, total)`
  em `partner-settlement-internal-report.ts`: arredondam cada linha em
  round-half-even e empurram o residual para a linha de maior valor absoluto.
- Aplicado a: cascata (itens de cada termo), distribuição (partes vs `nodeResult`),
  blocos do sócio (BP, transações pagas, ajustes, receitas em poder, extras) e
  Anexo B (grupos L1 vs base/IVA/total do modelo).
- `StatementDocInput` aceita overrides `totalRevenuesHeldOverride`,
  `financingToReturnOverride`, `transferBaseOverride`, `transferVatOverride`,
  `transferTotalOverride`; `PartnerSettlementTab.buildSoloDocInput` passa-os
  sempre a partir da linha do ecrã.
- `CLOSE_TOLERANCE = 0.004` — o aviso vermelho "a conta não fecha" passa a
  sinalizar erro real, não arredondamento.
- Referência Anitta EDA 2026: base a transferir da EIN = 230.990,35 no ecrã,
  no PDF interno e no documento do sócio.

## g15-c — o relatório interno é o documento da Mundo Propício (2026-09-13)

Três regras, todas alimentadas pelo motor (`event-settlement-engine`):

1. **Marca** — logótipo da empresa (`fetchExportBranding`) no cabeçalho da 1.ª
   página e nome da empresa no cabeçalho corrente. Sem marca de terceiros.
2. **Secção 1 "Resumo geral (Mundo Propício)"**, antes de tudo e independente do
   fechamento seleccionado: (a) resultado real do evento = `eventNetResult`
   (receitas s/IVA − despesas s/IVA − IVA não recuperável + operações de
   terceiros + custos internos devolvidos); (b) "O que cada sócio leva de facto"
   — parte REAL de cada participante `settles`, com o fechamento onde acerta e a
   % em cadeia ("20% de 30%"); (c) "Líquido final da Mundo Propício" =
   `house.residual`, decomposto em `declared` + `nominalGap` + `ivaDeductible`
   (+ `rest` com aviso). Prova na própria secção: total distribuído + líquido MP
   = resultado real (`overviewMismatch` = 0, C1 = 0).
3. **Posição nominal na cascata** — a dedução continua a ser o valor NOMINAL (é o
   que sai do pool), mas por baixo, em itálico, fica a nota "acerta X% de Y% =
   … no <fechamento> · diferença … fica com a Mundo Propício". Mesma nota no
   ecrã do Encontro de Contas, sob a participação no resultado.

Símbolos: `InternalOverview`, `InternalOverviewNominalRow`, `overviewMismatch`,
`InternalCascadeDeduction.realNote`, kind de linha `"note"`.

## g17 — Portal do Sócio = consumidor do gerador único (2026-09-13)

O Portal **não calcula nada do fecho**. O cálculo vive num só sítio:

- Pacote partilhado `supabase/functions/_shared/settlement/` (os 16 módulos
  puros do fecho). `src/lib/*.ts` são shims `export * from "@shared/settlement/…"`
  — alias `@shared` em tsconfig/vite/vitest. Nunca duplicar código de cálculo.
- `_shared/settlement/statement-service.ts`:
  `loadStatementBundle(client, eventId)` (mesmas queries do Encontro de Contas,
  critério de custo lido de `events.cost_expense_source` / `cost_include_overhead`)
  + `buildPartnerStatement(bundle, supplierId)` → `{ doc, block, cards }`.
  Só devolve algo se o sócio tiver participação `mode = 'settles'`.
- Edge function `partner-statement` (`verify_jwt = true`, service_role): valida
  o utilizador, resolve o sócio por `user_supplier_id`, exige
  `partner_event_access` activo e participação `settles`; **nada** vem do
  cliente a não ser `event_id`. Log em `system_audit_log`
  (`entity_type = 'partner_statement'`). Devolve JSON; o PDF/XLSX é gerado no
  browser com os exportadores existentes a partir do mesmo `doc`.
- `PartnerEventDetail`: saíram as leituras parciais
  (`get_partner_event_shares`, `get_partner_visible_settlements`,
  `get_partner_settlement_summary`, `returns_parent_deductible_vat`) e o segundo
  gerador (`buildStatementDocInput` passou a devolver o `doc` do servidor + logo).
  Novo bloco `PartnerSettlementBlock` ("O seu fechamento") no topo, com a
  cascata resumida, a linha g5 e os botões PDF/Excel.
- `PartnerFinancialCards` ganhou `fecho` — quando presente mostra receitas,
  despesas e resultado DO FECHO (perímetro da raiz), nunca um resultado
  calculado com o que a RLS deixa ver.
- (g15-b) Na base a transferir os componentes são arredondados ao cêntimo
  ANTES de compor o total, para o Portal e o ERP darem o mesmo número.
  Anitta: base da EIN 230.990,35; resultados 596.133,45 (raiz) · 178.840,04
  (Rafael Lobo) · 547.906,69 (MP + EIN).
- Limitação registada: operações de terceiros com `source = 'ab_module'` usam os
  valores gravados; o servidor não recalcula o cenário A&B ao vivo.
- Nota: `suppliers.doc_locale` não tem GRANT de leitura a `authenticated` — no
  browser o locale cai para pt-PT; no servidor (service_role) é lido.

## g17-d — Regra única de arredondamento ao cêntimo (2026-09-13)

`roundCents` em `supabase/functions/_shared/settlement/iva.ts` (reexportado por
`src/lib/iva.ts`) é a ÚNICA função de arredondamento do fecho: motor, ERP, edge
function `partner-statement` e Portal. `Math.round(x*100)/100` está proibido no
fecho — falhava em `596.133,45 × 70% = 417293.4149999999`, devolvendo
417.293,41 em vez de 417.293,42. Implementação: normaliza a 15 dígitos
significativos (`toPrecision(15)`), reescala em notação exponencial e arredonda
half-away-from-zero, simétrico para negativos. Nunca `toFixed` nem truncatura
na apresentação de valores (só em percentagens).

Números confirmados após a correcção: ANITTA 417.293,42 · RAFAEL LOBO 35.768,01
· EIN 273.953,35 (+ MP 273.953,34 = 547.906,69) · base a transferir da EIN
230.990,35. `calcWithIva` em `src/lib/utils.ts` delega em `calcTotalWithIva`.
