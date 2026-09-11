# Auditoria — saldo de conta financeira, permissões e confidencialidade (11/09/2026)

Relatório de leitura. Nada foi alterado: sem código, sem migrações, sem base de dados.

## Leituras feitas antes de concluir

- `docs/INDEX.md` (ritual de arranque e mapa de camadas).
- `docs/DECISIONS.md` — D-ERP34 (linhas 808–831) e D-ERP35 (linhas 834–847).
- `.lovable/memory/security/account-balance-server-side-guard.md` (RPCs novas, consumidores, limitação).
- `.lovable/memory/features/account-balance-cutoff-date.md` (D-ERP25, data de corte, `skip_balance_check`).
- Código: `src/lib/account-balance.ts`, `src/lib/account-balance-rpc.ts`, `src/lib/card-account-balance.ts`, `src/lib/card-session-balance.ts`, `src/lib/ticket-office-balance.ts` e os ecrãs/modais listados abaixo.

## 1. Inventário — onde se mostra saldo de conta (ou número derivado)

| # | Ficheiro : linha | O que mostra | Como o número é obtido |
|---|---|---|---|
| 1 | `src/pages/FinancialAccounts.tsx:673-674` | Saldo por conta na lista | soma no cliente via `computeAccountBalance` (`:339`) |
| 2 | `src/pages/FinancialAccounts.tsx:416-418` | Card "Saldo Total" | soma no cliente (`:362-365`) |
| 3 | `src/pages/FinancialAccounts.tsx:431` | "Retido em bilheteiras" | `computeTicketOfficeBalance` no cliente (`:235-248`) |
| 4 | `src/pages/FinancialAccounts.tsx:438` | Total de acerto | soma no cliente (`:379`) |
| 5 | `src/components/AccountBalanceImplantModal.tsx:79,85` | "sistema calcula hoje" vs "depois de implantar" | `computeAccountBalance` no cliente |
| 6 | `src/components/TransactionPaymentModal.tsx:875-878` | "Saldo disponível" | **RPC** `account_true_balance` via `useAccountTrueBalance` (`:184`) |
| 7 | `src/components/TransferFormModal.tsx:203-206` | Saldo da conta de origem | **RPC** `account_true_balance` (`:59`) |
| 8 | `src/components/BatchPaymentModal.tsx:641-644` | "Saldo atual" no lote | **RPC** `account_true_balance` (`:173`) |
| 9 | `src/pages/CardSessions.tsx:152,161` | "Saldo contabilístico" e "Saldo real estimado" por cartão | soma no cliente via `computeAccountBalance` (`:48-63`) |
| 10 | `src/pages/CardSessionDetail.tsx:540-546` | Saldo contabilístico e real estimado do cartão | `fetchCardAccountBalance` → soma no cliente (`src/lib/card-account-balance.ts:17-37`) |
| 11 | `src/pages/CardSessionDetail.tsx:565,595-599` | Saldo de abertura calculado e saldo teórico da sessão | `fetchCardSessionAccountSync` → soma no cliente (`src/lib/card-session-balance.ts:58-123`) |
| 12 | `src/components/cards/OpenCardSessionModal.tsx:51-55` | Saldo do cartão proposto na abertura | `fetchCardAccountBalance` (cliente) |
| 13 | `src/components/cards/CloseCardSessionModal.tsx:568-579` | Saldo abertura + saldo teórico no fecho | aritmética no cliente sobre `opening_balance`, recargas e itens |
| 14 | `src/pages/CartaoEquipa.tsx:311` (cálculo `:231`) | "Saldo teórico" do portador | soma no cliente |
| 15 | `src/pages/TicketOffices.tsx:140` | Saldo retido por bilheteira | `computeTicketOfficeBalance` (cliente), vendas via RPC `get_ticket_office_sales` |
| 16 | `src/components/TicketOfficeBalancePanel.tsx:121,260,287` | Saldo retido, saldo esperado, saldo por evento | `computeTicketOfficeBalance` (cliente) |
| 17 | `src/components/ReportBankStatement.tsx:118,263` | Extrato: abertura, linhas e saldo final | soma no cliente + `fetchAccountCashAdjustments` |
| 18 | `src/components/ReportTreasuryProjection.tsx:67,131-145` | Saldo atual / mínimo / final projetado | `computeAccountBalance` (cliente) sobre todas as contas |
| 19 | `src/components/ReportCashFlow.tsx:278,329` | Coluna "Saldo" acumulada | soma no cliente (acumulado do período, não saldo da conta) |
| 20 | `src/pages/BankReconciliation.tsx:369,853-856` | Triângulo: "saldo do sistema" da conta | `computeAccountBalance` (cliente) |
| 21 | `src/pages/BankReconciliation.tsx:773-775` | "Saldo implantado a <data>" | campo `initial_balance` lido directamente |
| 22 | `src/lib/export-card-session.ts:80` | "Disponível no cartão" no export | valor vindo de #10 |
| 23 | `src/pages/EventDetail.tsx` (tesouraria do evento, `:698` comentário) | posição de caixa do evento | **RPC** `get_event_cash_position` (servidor) |

Não são saldo de conta e ficam fora do âmbito, apesar da palavra "Saldo": `ReportForecastPayables` ("Saldo BP"), `ReportMovementReconciliation:171` (aberto por transação), `EventFecho`/`PartnerSettlementTab` (acerto com sócios), `CamarimFundMoveModal:131` (saldo da sessão de camarim).

## 2. Quem respeita a permissão

- **`view_balances`**: usado apenas como porta de acesso, nunca a esconder o número — `src/components/AppSidebar.tsx:106` (item de menu "Contas") e `src/App.tsx:266,727` (lista `MANAGEMENT_PERMS` que decide o destino pós-login). Nenhum dos 23 sítios acima verifica `view_balances` para decidir mostrar o valor no ecrã; a única verificação real de `view_balances` está **dentro** das RPCs (#6, #7, #8).
- **`balance_visible_to_all`**: verificado em 2 sítios do frontend — `src/pages/FinancialAccounts.tsx:342-343` (`canSeeBalance = isAdmin || account.balance_visible_to_all`, aplicado em `:674` e no total `:364`) e `src/components/ReportBankStatement.tsx:62`. Nos três modais (#6–#8) a verificação existe mas do lado do servidor, dentro de `account_true_balance`.
- **Nada verificado (nem `view_balances` nem `balance_visible_to_all`)**: #3, #4 (usam só `isAdmin`, `FinancialAccounts.tsx:431,438`), #5, #9, #10, #11, #12, #13, #14, #15, #16, #18, #19, #20, #21, #22. Nestes o gate existente é de *módulo* (`card_manage`, `manage_accounts`, `manage_bank_reconciliation`, `view_reports`), não do número.
- **Esconde o número vs esconde o cartão/menu**: só #1, #2 e #17 escondem o *número* (mostram "—" ou omitem). #6, #7, #8 omitem o número quando a RPC devolve NULL. Todos os restantes mostram o número a quem entra no ecrã — o controlo é a entrada no ecrã, não o valor.
- Conclusão sobre a auditoria de 10/09: **confirma-se**. A flag continua a ser respeitada em 2 sítios de frontend (mais 3 modais que a delegam ao servidor); o resto calcula no cliente e mostra sem verificar nada específico de saldo.

## 3. As funções novas estão a ser usadas?

Sim, mas só em três ficheiros, todos através de `src/lib/account-balance-rpc.ts`:

- `account_has_balance_for`: chamada em `src/lib/account-balance-rpc.ts:22`; consumida por `TransactionPaymentModal`, `TransferFormModal` e `BatchPaymentModal` (imports em `TransactionPaymentModal.tsx:24`, `TransferFormModal.tsx:13`, `BatchPaymentModal.tsx:21`).
- `account_true_balance`: chamada em `src/lib/account-balance-rpc.ts:32`; exibida em `TransactionPaymentModal.tsx:184`, `TransferFormModal.tsx:59`, `BatchPaymentModal.tsx:173`.

**Fora destes três modais, nenhuma das duas funções é usada.** A página de Contas, os cartões, as bilheteiras, o Extrato, a Projeção de Tesouraria e a Conciliação **não** as chamam.

## 4. Fonte única

Existe: `computeAccountBalance` em `src/lib/account-balance.ts:131-158` (+ `fetchAccountCashAdjustments:71`, `countsAfterCutoff:37`, `buildAccountCutoffs:48`).

Passam por ela, directa ou indirectamente: #1, #2, #4, #5, #9, #10, #12, #18, #20 e #22 — 10 dos 23. As RPCs replicam a mesma fórmula (`_account_true_balance_raw`), logo #6–#8 são consistentes com ela por desenho.

Implementações paralelas que calculam "saldo" de forma diferente:

- `src/lib/ticket-office-balance.ts` (bilheteiras, #3, #15, #16): filtra `status ∈ {approved, paid}`, `reversed_at IS NULL`, `is_hidden = false`, e soma vendas e adiantamentos. **Regras diferentes** de `computeAccountBalance`, que não filtra status nem `reversed_at` nem `is_hidden` (`account-balance.ts:151-156`). Para a mesma conta os dois dão números diferentes — e é intencional: `FinancialAccounts.tsx:336-337` desvia as contas `ticket_office` para a fórmula da bilheteira.
- `src/lib/card-session-balance.ts:58-123` e `:132-160`: recalculam a soma localmente em vez de chamar `computeAccountBalance`, ignorando `skip_balance_check` (só aplicam corte e ajustes). Numa conta sem controlo de saldo devolvem número onde a fonte única devolveria `null`.
- `ReportBankStatement.tsx:118-134` reconstrói a cadeia linha a linha (usa os helpers de corte, não a função).
- `ReportCashFlow.tsx` é acumulado de período, com aviso explícito (`:248-250`) de que não é saldo.
- `CardSessionDetail`/`CloseCardSessionModal`/`CartaoEquipa` calculam o "saldo teórico da sessão", que é outro conceito e não deve convergir.

## 5. Confidenciais — onde a informação escapa

A limitação da D-ERP34 **continua verdadeira**: `computeAccountBalance` (`src/lib/account-balance.ts:151-156`) soma `paid_amount` de todas as transações recebidas, sem filtrar `status`, `reversed_at`, `is_hidden` nem `is_confidential`. Uma busca por `is_confidential` em `src/` (excluindo `integrations/`) só devolve escrita/edição/badge (`TransactionEditModal`, `TransactionFormModal`, `TransferFormModal:98,118`, `BankLineLaunchModal:283,329`, `TransactionRow:432`) — nenhuma leitura de saldo o filtra.

Há dois efeitos distintos e importa não os confundir:

1. **Onde o número é somado no cliente** (#1–#5, #9–#22): a policy RESTRICTIVE `transactions_confidential_guard` já esconde as linhas confidenciais na query, portanto o saldo mostrado sai **acima do real** para quem não tem `view_confidential`. Não é fuga de informação; é saldo errado, e é a incoerência que a D-ERP34 aceitou. Também torna o triângulo da Conciliação (#20) e a Projeção (#18) enganosos para esses utilizadores.
2. **Onde o número vem da RPC** (#6, #7, #8): `account_true_balance` é SECURITY DEFINER e vê tudo. Quem tenha `view_balances` numa conta com `balance_visible_to_all = true` mas **não** tenha `view_confidential` — hoje, na prática, os perfis `manager`, `editor` e `viewer` com essa permissão — vê ali um saldo que **inclui** movimentos confidenciais que não consegue listar em Transações. Comparando esse valor com o saldo somado no cliente na página de Contas, a diferença revela o montante escondido. **É aqui que a informação escapa** e é o ponto mais importante deste relatório. Notar que quem é `admin` ou `accountant` tem `view_confidential` (D-ERP34, ponto 3) e por isso não gera fuga; a exposição depende de existirem contas com `balance_visible_to_all = true` e utilizadores não-admin com `view_balances` — **não verificado** em dados de Live nesta auditoria.
3. Contas com `is_restricted` estão fora da leitura desses utilizadores (policy reescrita, D-ERP34 ponto 4), pelo que o risco de #2 vive nas contas normais com transações marcadas `is_confidential` — tipicamente a perna Santander de transferências para conta restrita.

## 6. Proposta, por risco e esforço (não executada)

**Passo 1 — fechar a fuga do ponto 5.2. Só base de dados (DDL em Live, a autorizar).**
Alterar `account_true_balance` para devolver NULL (ou o saldo já sem as linhas confidenciais) quando o chamador não tem `view_confidential` e a conta tem movimentos confidenciais. Ficheiros de frontend: nenhum — os três modais já tratam NULL como "não mostrar" (`account-balance-rpc.ts:53-61`). Risco: um `manager` deixa de ver o valor em contas com confidenciais; a decisão do pagamento continua a funcionar porque passa por `account_has_balance_for`, que devolve só booleano. Pode partir: mensagens que hoje mostram valor passam a genéricas.

**Passo 2 — a página de Contas passa a ler o saldo do servidor. Frontend + uma função nova em Live.**
Criar `account_true_balances(uuid[]) → (account_id, balance)` (DDL em Live) e trocar `computeAccountBalance` por essa leitura em `FinancialAccounts.tsx:332-343,362-379,673-674`. Isto arruma de uma vez #1, #2, #4 e o total. Risco: a fórmula da bilheteira (#3, #15, #16) é diferente por desenho e tem de continuar à parte; se for incluída, os números de bilheteira mudam.

**Passo 3 — cartões, Extrato, Projeção e Conciliação. Só frontend.**
`CardSessions.tsx`, `card-account-balance.ts`, `card-session-balance.ts`, `ReportBankStatement.tsx`, `ReportTreasuryProjection.tsx`, `BankReconciliation.tsx:369`: usar a função do passo 2 para o saldo *da conta* e manter local apenas o saldo *da sessão*. Risco alto de regressão numérica: o Extrato e o triângulo da Conciliação dependem de linha-a-linha e de datas efectivas; qualquer troca tem de ser validada conta a conta contra valores conhecidos (Santander Totta) antes de publicar.

**Passo 4 — decidir a definição de saldo. Decisão de negócio antes de código.**
A fórmula não filtra estornadas nem escondidas. Enquanto isso não for decidido, qualquer unificação propaga a definição actual. Recomendo tratar isto como D-ERP separada, depois dos passos 1–2.

**Passo 5 — bilheteiras. Frontend.**
Aplicar a `computeTicketOfficeBalance` uma verificação explícita de `view_balances`/`balance_visible_to_all` no ecrã (#15, #16) ou aceitar formalmente que "retido em bilheteira" não é saldo de conta e documentá-lo. Baixo risco.

Ordem recomendada: 1 → 2 → 5 → 3 → 4. Só os passos 1 e 2 envolvem DDL em Live; 3 e 5 são exclusivamente frontend.

## Não verificado

- Se existem hoje em Live contas com `balance_visible_to_all = true` e utilizadores não-admin com `view_balances` (condição da fuga do ponto 5.2).
- Volume real de transações com `is_confidential = true` e em que contas.
- Comportamento no ecrã (nenhuma verificação por browser foi feita nesta auditoria).
