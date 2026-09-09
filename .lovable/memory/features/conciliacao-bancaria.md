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

## Conciliação — camadas, por ordem, pára na primeira

1. **Lote SEPA** — descrição contém `LOTE TRF CRED SEPA+`; casa com
   `payment_list_sepa_exports` por `total_amount` (±0,01) **e** pela data
   presente na descrição, comparada com a data dentro do `msg_id`
   (`PAGAMENTOS-MP-11082026-12080959` → 11/08/2026), aceitando `DDMMAA` e
   `DDMMAAAA`. O `msg_id` **não** viaja inteiro na descrição do banco: só a
   data e um código de referência. Se a data não desempatar, usa o total
   isolado; com mais de um candidato não casa nenhum e fica por explicar.
   Liga `matched_sepa_export_id` + `matched_payment_list_id` e cobre de uma vez
   todas as transações de `transaction_ids`.

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
