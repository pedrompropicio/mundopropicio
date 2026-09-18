---
name: Conciliação bancária (extrato do banco)
description: Importação do extrato Santander (tabulado Excel) para bank_statements/bank_statement_lines, conciliação em 3 camadas (lote SEPA > valor exato ±5d > Dice ≥0,8) que só liga e nunca altera transações, mais a lista inversa de transações pagas sem movimento no banco
type: feature
---

## Peças

| Peça | Ficheiro |
|---|---|
| Parser Santander + `line_hash` | `src/lib/bank-statement/parse-santander.ts` |
| Motor de conciliação (puro) | `src/lib/bank-statement/reconcile.ts` |
| Semelhança Dice (casa única **no frontend**) | `src/lib/string-similarity.ts` |
| Ecrã | `src/pages/BankReconciliation.tsx` — rota `/conciliacao-bancaria` |
| Permissão | `manage_bank_reconciliation` (admin, manager) |

Atenção: a edge function `generate-historical-transactions` mantém cópia própria
do Dice, com normalização diferente. Não há motor único — quem mexer numa tem
de ir ver a outra.

Tabelas: `bank_statements`, `bank_statement_lines` (com `bank_ref`). RLS pelo padrão financeiro
(RESTRICTIVE de empresa + leitura para admin/manager/`financial_account_access`,
escrita admin/manager). Índices por `financial_account_id + booking_date`,
`status` e `statement_id`.

## Formato Santander (tabulado Excel)

Sem cabeçalho, separador `;`, latin-1, CRLF, 11 colunas: nº conta; data mov.
`DD-MM-AAAA`; data-valor; descrição (enchimento à direita); zeros; débito;
crédito; saldo após o movimento; 3 códigos. Débito/crédito/saldo com sinal
colado, zeros à esquerda e vírgula decimal (`-00000000000002968,13`). Só um de
débito/crédito vem preenchido. `amount` é guardado com sinal (negativo a débito).

O tipo `BankStatementFormat` deixa a porta aberta a outros bancos; só o
Santander está implementado.

## Identidade da linha

`line_hash` = SHA-256 de `conta | data mov | data-valor | descrição normalizada
| valor | saldo após`. O saldo entra **de propósito**: é o que distingue dois
movimentos iguais no mesmo dia. `UNIQUE (financial_account_id, line_hash)` +
upsert com `ignoreDuplicates` → reimportar o mesmo ficheiro não cria linhas.

## Validações

- **Interna (bloqueia):** saldo[i] = saldo[i−1] + movimento[i], tolerância
  0,005 €. Se partir, a importação é recusada e a mensagem diz a linha.
- **Contra o sistema (avisa, não bloqueia) — cascata de 3 ramos** (issue #185,
  `useMemo cutoffMismatch` em `BankReconciliation.tsx`). Tolerância 0,01 € em
  todos, nunca bloqueia a importação:
  1. **O ficheiro cobre a data de corte** (`bookingDate <= cutoff`): referência é
     o `balance_after` da última linha até ao corte, comparada com
     `initial_balance` (D-ERP25) — o implantado é o saldo ao FECHO desse dia, por
     isso não se usa a abertura do ficheiro. Rótulo "fecho da data de corte".
  2. **Começa depois do corte e há linhas importadas** da mesma conta com
     `booking_date < period_from`: a referência é `parsed.openingBalance` e o
     esperado é o `balance_after` da **última linha importada** antes do
     início do ficheiro (query a `bank_statement_lines`, `booking_date` desc,
     e dentro do dia reconstrói-se a cadeia — a última linha do dia é a única
     cujo `balance_after` não é "preciso" por nenhuma irmã, porque não há
     coluna de ordem). Diz "não encaixa no saldo após o último movimento
     importado, de <booking_date>" e quantos dias úteis separam as datas.
     Comparar com o `closing_balance` do extrato anterior falhava com
     períodos sobrepostos (extrato 14→16 já importado, ficheiro 16→17:
     o fecho do 14→16 já incluía os movimentos de 16 → aviso FALSO).
  3. **Sem nenhuma linha anterior:** abertura contra o saldo do sistema à
     véspera de `period_from` (`account_true_balances_asof`). Se vier NULL
     (sem permissão para ver o saldo), não se mostra aviso nenhum.
  O ramo 2 usa query própria a `bank_statement_lines` (a lista de extratos
  dos chips já não chega — períodos sobrepostos); o ramo 3 mantém a query
  ao saldo do sistema, só quando não há linhas anteriores.

## Conciliação — três PASSAGENS sobre todas as linhas, por esta ordem

Não é linha a linha: corre primeiro toda a camada SEPA, depois o valor, depois a
descrição, com um registo partilhado do que já foi consumido. Sem isto, uma
transação já coberta por um lote SEPA voltava a casar com outra linha mais
abaixo no ficheiro (caso real: −3.000,00 € para Pedro Coelho de Araújo vs
«Influencers»).

1. **Lote SEPA** — descrição contém `LOTE TRF CRED SEPA+`; casa com
   `payment_list_sepa_exports` por `total_amount` (±0,01) **e** pela data
   presente na descrição, comparada com a data dentro do `msg_id`
   (`PAGAMENTOS-MP-11082026-12080959` → 11/08/2026), aceitando `DDMMAA` e
   `DDMMAAAA`. O `msg_id` **não** viaja inteiro na descrição do banco: só a
   data e um código de referência. Liga `matched_sepa_export_id` +
   `matched_payment_list_id` e cobre de uma vez todas as transações de
   `transaction_ids`.

   **Dupla geração não é ambiguidade:** candidatos empatados da MESMA
   `payment_list_id` são o mesmo lote gerado duas vezes (dois `msg_id` a um
   minuto) — casam como um só e somam as transações das irmãs. Só se recusa
   quando os candidatos são de listas diferentes. O ecrã diz quantas
   exportações teve a linha.

   As três linhas do mesmo acontecimento — o lote, a `COMISSÃO` e o `IMP.SELO`
   — partilham o código de referência do banco (`D485O347`), guardado em
   `bank_ref` e usado **só** para as mostrar agrupadas no ecrã.
2. **Valor exato** — `|paid_amount|` igual (±0,01) numa transação da mesma
   conta ainda não usada, com `COALESCE(payment_date, date)` a ±5 dias da data
   de movimento. Empate → a mais próxima na data.
3. **Descrição** — Dice ≥ 0,8 (`src/lib/string-similarity.ts`, o mesmo motor da
   edge `generate-historical-transactions`) sobre descrição/fornecedor, com o
   valor a bater ao cêntimo.

Uma linha **ignorada** deixa de explicar a transação a que estava ligada.
Cada transação só é consumida por uma linha. `matched_by` guarda
`auto:<camada>`, `manual:<email>` ou `ignored:<email>`.

**Invariante absoluta:** a conciliação **só liga**. Não liquida, não muda
`status`, não escreve `paid_amount`, não cria transações (D-ERP28).

## Retenção na fonte

No lote, o banco paga o LÍQUIDO e o sistema registou o BRUTO. A diferença é
retenção e mostra-se na linha conciliada (bruto + retenção apurada), mas **não**
entra na decomposição da diferença: o saldo do sistema já sai líquido, porque
`fetchAccountCashAdjustments` desconta a retenção ao caixa. Medido a 09/09/2026:
retenção 207,00 € e diferença de 32.204,80 € a fechar exatamente com as duas
parcelas reais (26.084,80 € por explicar + 6.120,00 € SUPERSOUNDS).

## Voltar a conciliar

Ação no ecrã que corre outra vez as camadas sobre as linhas já importadas, sem
apagar nada. Só toca nas `unmatched` e nas `auto:`; preserva as manuais (com as
suas transações já consumidas), as ignoradas e as anteriores ao corte.

## Ecrã

Conta → ficheiro → resumo antes de gravar (período, nº de linhas, quantas
casaram em cada camada, quantas por explicar). Depois: separadores
**Conciliadas** (com as ignoradas no fim, esbatidas e com a nota),
**Linhas do banco por explicar** (conciliar à mão contra uma transação, ou
ignorar com nota obrigatória) e **Transações sem movimento no banco**.

No topo, o confronto **sistema × banco** (não ficheiro × ficheiro, que dava
sempre zero): saldo do sistema à data de fim do extrato, pela fonte única
`computeAccountBalance` com data de corte e ajustes de caixa → saldo declarado
pelo banco (`balance_after` da última linha) → diferença, em vermelho enquanto
não for zero → decomposição nas duas causas: soma das linhas por explicar e
soma das transações sem movimento no banco.

Reimportar reutiliza o extrato existente da mesma conta e período quando as
impressões digitais coincidem, e diz quantas linhas já existiam e quantas são
novas; um extrato novo que não fique com nenhuma linha é apagado. O ficheiro
original vai para o cofre privado `bank-statements` (isolado por empresa) e o
caminho fica em `file_url`. Todas as consultas paginam de 1000 em 1000.

## O lado inverso (o mais valioso)

`findTransactionsWithoutBankLine` lista transações com `paid_amount > 0` na
conta, com data efetiva dentro do período, não ligadas a nenhuma linha. É a
classe de erro dos Bombeiros (1.328,45 € pagos a 11/08 que nunca saíram do
banco porque a linha caiu do ficheiro SEPA por não ter fornecedor).

## Fora deste lote

Criação de transações a partir das linhas do banco, sugestões de lançamento e
regras que aprendem. Liquidação, listas de pagamento e exportação SEPA
intocadas.

## Lançar a partir da linha do banco (D-ERP29 / D-ERP30)

| Peça | Ficheiro |
|---|---|
| Regras (casar + sugerir padrão) | `src/lib/bank-statement/rules.ts` |
| Formulário de lançamento | `src/components/bank/BankLineLaunchModal.tsx` |
| Tabela | `public.bank_line_rules` (RLS do módulo financeiro + isolamento de empresa) |

**Princípio inviolável:** a regra PROPÕE, a pessoa CONFIRMA. Nada é criado
automaticamente, nem com regra a casar. Só se aplica a linhas `unmatched` —
depois de as três camadas falharem.

- Valor e data são factos do banco e não se editam. A transação nasce `paid`,
  na conta do extrato, `payment_date` = data-valor, `paid_amount` = bruto,
  `amount` = líquido. A linha fica `matched` com `created_transaction_id` e
  `matched_by = created:<email>`.
- **Várias linhas, um lançamento:** selecionam-se as linhas e cria-se UMA
  transação pela soma; todas apontam para ela. Caso do TPA (16 linhas
  `EST-0002TPA-...` de 07/09, 27.241,87 €, receita 1.1.03 F&B do Ivete Clareou,
  com repartição bar/alimentação e taxas do adquirente por apurar no fecho A&B)
  e das comissões de lote.
- **Aprender:** sem regra a casar, propõe-se guardar uma, com o padrão sugerido
  a partir da descrição normalizada sem a parte variável (número/código de
  referência no fim). Separador **Regras** no ecrã lista, ativa/desativa e apaga.
- **Transitória (a repassar):** caixa marcável nas ações despesa/receita. Cria a
  transação com `is_transitory = true` — move o saldo da conta mas não é receita
  nem custo (dinheiro de terceiros que passa e vai ser repassado). Com ela ligada
  a **rubrica é opcional** (`transactions.category_id` é nullable) e **não se
  guarda regra**: `bank_line_rules` não tem coluna para o flag, e uma regra que o
  perdesse em silêncio seria pior do que não existir.
- **Linha de BP obrigatória (D1+D8):** quando a ação é **despesa**, há **evento**
  escolhido e `event_budget_mode(event_id) = 'with_bp'`, aparece o campo
  **"Linha de BP"**, obrigatório. A escolha usa o mesmo `LinkBpLineDialog` em modo
  `pickOnly` (com criação de linha para quem tem `manage_bp`) e a transação nasce
  já com `forecast_id` — sem isto o trigger `enforce_transaction_approval_permission`
  recusava o lançamento depois de a transação já estar criada. A validação corre
  **antes** de qualquer insert (`toast.error("Escolhe a linha de BP deste evento.")`).
  Vale igual no lançamento pela soma: uma transação, uma linha de BP. A linha
  **nunca** entra em `bank_line_rules` (rubrica e evento sim) — as linhas pertencem
  a um evento concreto e a regra reutilizaria a linha errada.
- **Google Ads (D-ERP30):** débito por limiar não é custo. A ação
  `create_transfer` gera o PAR de transações da rubrica 10.3, como o
  `TransferFormModal` — no débito, saída da conta do extrato e entrada em
  "Google Ads — conta corrente" (`other`). A **direção segue o sinal do
  movimento**: numa linha de crédito é o inverso — receita na conta do extrato
  (o dinheiro entrou lá) e despesa na conta indicada. A transação da conta do
  extrato é sempre a primária ligada à linha. O custo por evento vem da camada de
  faturas de plataformas; lançar como despesa contaria duas vezes.
- **Taxas bancárias:** comissão de gestão, imposto de selo e os selos/comissões
  dos lotes SEPA vão para 10.6.01, sem evento.
- **Regra visível antes do clique (#187):** na lista "Linhas do banco por explicar",
  cada linha `unmatched` em que uma `bank_line_rules` **ativa** casa mostra por baixo
  da descrição `Regra: <nome> → <ação legível>` ("despesa 2.2.02 · Hospedagem · Braga",
  "transferência p/ Google Ads — conta corrente"). É **só texto**: usa o mesmo
  `findMatchingRule` do modal (`describeRuleAction` para o rótulo) e nada é criado.
- **Taxas de transferência internacional pela referência (D-ERP74):** as linhas
  `TRF.CRÉD.N.SEPA+(DESP.SHA) <ref>`, `DESPESAS SWIFT <ref>`,
  `IMP.S/VALOR ACRESCENTADO <ref>` e `IMP.DE SELO <ref>` agrupam-se pela **referência
  numérica no fim da descrição** (`src/lib/bank-statement/transfer-fees.ts`). Procura-se
  a **linha-mãe** `TRF.CRÉD.N.SEPA+EMITIDA <ref>` já `matched` na mesma conta; com mãe,
  o grupo mostra `Taxa da transferência <ref> → <descrição da mãe> · <evento>` e um botão
  **"Lançar taxas (N linhas)"** que abre o `BankLineLaunchModal` já preenchido, só para
  confirmar. Cria **duas** transações: (1) SWIFT + IVA → `amount` = valor do SWIFT,
  `iva_rate` 23, `paid_amount` = soma dos dois; (2) DESP.SHA + imposto de selo → `amount`
  = soma, `iva_rate` 0. Ambas despesa em 10.6.01, data das linhas, conta do extrato,
  `payment_method` `transfer`, `is_transitory` false, **`event_id` e `forecast_id`
  herdados da transação-mãe**. Mãe com evento `with_bp` e sem `forecast_id` → o modal
  **exige** a linha de BP (`LinkBpLineDialog` em `pickOnly`) antes de gravar. Cada perna
  é inserida e ligada às suas linhas por `insertAndLinkLines`, que **apaga a transação**
  se a ligação falhar, e a perna anterior é revertida se a seguinte rebentar (#154):
  nunca fica transação órfã. Sem mãe conciliada, o grupo aparece apenas com a nota
  "Taxa de transferência sem mãe conciliada" e o Lançar normal. **Não** se cria regra em
  `bank_line_rules` para estes casos: o evento vem da mãe, não do padrão.
- **Peça C (#187) — a linha de BP proposta, medida, e a mãe ligada de arrasto.**
  Quando a mãe tem `event_id`, **não** tem `forecast_id` e o evento é `with_bp`, o modal
  "Lançar taxas da transferência":
  1. **Propõe** a linha do BP do evento na **mesma rubrica da mãe** (`event_forecasts`
     com `approved_at` não nulo, `version_id IS NULL`, `type = 'expense'`); havendo mais
     do que uma, a de **maior `amount`**. Aparece já selecionada, com "Trocar linha".
  2. Mostra **Previsto · Utilizado · Disponível** da linha (o utilizado é o mesmo cálculo
     do modal Nova Transação: soma de `transactions.forecast_id = linha` que contam como
     compromisso — sem transitórias, sem `exclude_from_result`, sem revertidas, sem
     escondidas, sem `shared_cost_account_id`) e a frase "A taxa de X € cabe" ou
     "A taxa de X € excede a linha em Y € — entra como custo fora do BP; a verba
     aumenta-se no ecrã do BP". **Nunca bloqueia** (só a ausência de linha bloqueia).
     Vale também quando a linha foi herdada da mãe.
  3. Sem nenhuma linha aprovada nessa rubrica: "O BP deste evento não tem linha
     `<código · nome>`. Escolhe outra ou cria a linha." e o `LinkBpLineDialog` em
     `pickOnly` como antes.
  4. Caixa **"Ligar também a transferência-mãe (<descrição> · <valor>) a esta linha"**,
     marcada por defeito, visível só quando a mãe não tem `forecast_id`. Ao confirmar,
     depois das pernas das taxas, faz o `UPDATE` de `transactions.forecast_id` na mãe
     **pela edge function `update-transaction`** (nunca UPDATE directo do cliente; o campo
     `forecast_id` foi acrescentado à `allowedFields`), dentro da mesma sequência: se o
     update da mãe falhar, as pernas das taxas são revertidas e a mensagem diz porquê. A
     auditoria da mãe é a normal (`transaction_audit_log`). Nota: a mãe está `paid`, logo o
     ramo `paidAllowedFields` exige `approve_transactions` — quem não tem essa permissão
     recebe 422 e as taxas não ficam criadas.

As camadas de conciliação, a liquidação, as listas de pagamento e os
Recorrentes ficaram intocados.

## Lançamento atómico (2026-09-18, #154)

`public.launch_from_bank_lines(p_items jsonb) RETURNS uuid[]` — plpgsql, **SEM
`SECURITY DEFINER`** (corre com as permissões de quem chama; a RLS do módulo
financeiro continua a valer), `search_path = public`. Grants: `anon` false,
`authenticated` e `service_role` true.

`p_items` é um array de `{ "transaction": { …colunas de transactions… },
"line_ids": [uuid…], "matched_by": text, "note": text }`. Um item pode ter
`line_ids` vazio — é o caso da **segunda perna do par de transferência**, que não
liga linhas do banco. As colunas do JSON são validadas contra o catálogo e
inseridas por `jsonb_populate_record` + lista explícita (colunas ausentes ficam
com o default da tabela). `company_id` é **sempre** o resolvido das linhas,
nunca o que vier no JSON; `id`, `created_at` e `updated_at` são ignorados.

Três validações, antes de qualquer insert:

1. **Empresa** — todas as linhas referidas têm de existir, pertencer à mesma
   `company_id` e essa empresa tem de ser a de `current_company_id()`. Array sem
   nenhuma linha → recusa (um lançamento do banco fica sempre ligado ao extrato).
2. **Linha livre** — todas com `status = 'unmatched'`, `matched_transaction_id`
   e `created_transaction_id` a NULL; senão `Linha do banco já está conciliada:
   <id>`. É a **guarda contra o duplo clique**: quem vê um toast de erro volta a
   clicar, e antes disto criava segunda transação.
3. **Ligação completa** — o `UPDATE` das linhas confere `ROW_COUNT` contra o
   número de ids; se faltar uma, rebenta e nada fica.

Devolve os ids pela ordem dos itens. Qualquer erro → a transação de base de
dados inteira reverte.

**Regra:** o `BankLineLaunchModal` **nunca** insere em `transactions`. Tudo passa
pela RPC. Foram removidos o `insertAndLinkLines` (apagar-se-falhar) e o
`revertLeg` — compensação no cliente não é atomicidade: se o `delete` também
falhasse, a órfã paga ficava a mexer no saldo (caso real: TPA ZigPay
27.241,87 €, 10/09/2026).

Fora da RPC, e por isso já sem desfazer nada: a ligação da **transferência-mãe**
à linha de BP (edge function `update-transaction`, Peça C do D-ERP74) — se
falhar, as taxas já estão lançadas e o aviso diz "liga-a manualmente na
transação <descrição>". Guardar a regra e incrementar `hits` continuam depois do
commit.

Prova: `supabase/tests/launch_from_bank_lines.sql` (BEGIN … ROLLBACK) — caminho
feliz com duas linhas pela soma, duplo clique recusado sem criar nada, linha
inexistente recusada.

## Explicada por conta, não por extrato (2026-09-18, #189)

A pergunta "esta transação tem movimento no banco?" olha para **todas as linhas
da CONTA**, seja qual for o `statement_id`: `matched_transaction_id`,
`created_transaction_id` e a ponte `bank_line_transactions` das linhas dessa
conta (e, no ramo SEPA, as transações dos exports irmãos). Com **períodos
sobrepostos** — a prática recomendada nos ficheiros do banco — a linha vive no
**primeiro extrato que a trouxe**, porque o `line_hash` impede o duplicado no
ficheiro seguinte; procurar só dentro do extrato aberto marcava como "transação
sem movimento no banco" dinheiro já conciliado (caso Crédito Google Ads,
`DÉBITO DIRETO-Google Ireland` de 16/09/2026, 500,00 €, que ficou no extrato
14→16/09 e não no 16→16/09).

A base é ÚNICA (`accountExplainedIds` em `BankReconciliation.tsx`): alimenta a
lista "Transações sem movimento no banco", a parcela `contribSystem` da
decomposição do triângulo e as candidatas da conciliação manual — lista e total
não podem sair de contas diferentes. Uma leitura das linhas da conta + uma da
ponte, nunca N por transação.

## Importar: duas travas (2026-09-18)

Incidente: às 19:48 de 18/09 o ficheiro do Santander de 16/09 (abertura
482.158,14 €) foi importado com a conta **"Cartão Santander Pre-Pago - 0663"**
(`prepaid_card`, saldo 1.386,68 €) escolhida. O ecrã gravou sem um pio: extrato
+ 3 linhas novas na conta errada (apagadas à mão).

- **Trava 1 — só contas bancárias.** O seletor do importador lista apenas
  `financial_accounts` com `type = 'bank'`, `is_active` e não ocultas. A
  gravação (`saveImport`) confirma o tipo **outra vez** contra a lista: um
  seletor não é uma trava. Mensagem: "Só contas bancárias recebem extrato."
- **Trava 2 — abertura do ficheiro contra o último saldo conhecido da conta**
  (`openingCheck` / `openingRefuseMessage`). Referência, em cascata:
  (a) `closing_balance` do extrato mais recente da conta (maior `period_to`; em
  empate, `imported_at` mais recente); (b) sem extratos, saldo do sistema à
  véspera de `period_from` (`account_true_balances_asof`); (c) se o ficheiro
  cobre a data de corte, a #185 já compara com o implantado — não se duplica.
  **RECUSA** a gravação (botão desativado, sem forçar) quando
  `|abertura − referência| > 1.000 €` **E** `> 10% de max(|ref|, |abertura|, 1)`:
  "A abertura do ficheiro (X €) está a Y € do último saldo conhecido desta conta
  (Z €, <origem>). Este ficheiro não parece ser desta conta." Abaixo disso nada
  muda — o aviso da #185 continua informativo.
  A **referência e a origem mostram-se SEMPRE** no resumo antes de gravar, mesmo
  quando não recusa.

## Invariante `linha_conciliada_sem_transacao` (2026-09-18)

`bank_statement_lines` com `status = 'matched'` e **nenhuma** ligação —
`matched_transaction_id`, `created_transaction_id`, `matched_sepa_export_id` e
`matched_payment_list_id` todos NULL e sem linha em `bank_line_transactions`.
Severidade `error`, referência **0**, âmbito global; vive em
`_run_invariant_checks_extra()`. Semeada com 0 casos em Live.

Veio do mesmo dia: a linha `PAG SERVICOS … AUDIOGEST` de 16/09 estava `matched`
com tudo a NULL — a transação criada pelo "Lançar" de 17/09 desapareceu (modo de
falha da #154, fechado pela RPC atómica) e ninguém deu por ela. Ligada à mão à
transação real.
