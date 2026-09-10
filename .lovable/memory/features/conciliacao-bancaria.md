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
- **Contra o sistema (avisa, não bloqueia):** com `initial_balance_date`
  preenchida (D-ERP25), o saldo de abertura do extrato (saldo da 1.ª linha
  menos o seu movimento) tem de igualar o `initial_balance`. Se não, importa
  e mostra aviso em destaque — o erro está no corte ou no saldo implantado.

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

As camadas de conciliação, a liquidação, as listas de pagamento e os
Recorrentes ficaram intocados.
