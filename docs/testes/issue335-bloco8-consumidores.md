# #335 — Bloco 8: inventário de consumidores da fórmula antiga de saldo/caixa

Data: 22/10/2026 (UTC). Âmbito: só leitura e documentação. Nenhum ficheiro de código, SQL,
migration ou dado foi alterado; sem instalação, sem Publish.

## 0. O que muda com o #335 (modelo usado na classificação)

- Legado (hoje): `transactions.paid_amount` inclui a componente de compensação
  (prova: `_derive_paid_amount` soma `p.amount` de todas as pernas,
  migration `20260928221118_bea24c4b-...sql:24-43`; `_apply_transaction_offset`
  cria pernas de compensação e chama `_derive_paid_amount`, `:174-231`).
- Gerido (#335): pernas de compensação são `transaction_payments` com
  `payment_method='compensation'` e `account_id NULL` — não são dinheiro de conta
  nenhuma. Os candidatos inertes `supabase/manual/20261021_issue335_offset_balance.INERTE.sql`
  e `..._cash_position.INERTE.sql` redefinem o saldo como: transações NÃO geridas
  contribuem `paid_amount` assinado (como hoje); transações geridas (grupo
  `preparing/applied/reversing` com perna paga ligada) contribuem APENAS a soma
  das pernas `payment_method<>'compensation'`, `status='paid'`, `reversed_at IS NULL`,
  pela conta da perna; ajustes (withholding+credit) inalterados.

Classificação por consumidor:
- (a) já correcto com compensação gerida (exclui pernas compensation do caixa);
- (b) mudaria de valor com o #335 (conta compensação como se fosse caixa);
- (c) irrelevante (não é saldo/caixa: dívida, BP, conta-corrente de sócio, projeção).

Exemplos canónicos usados nos testes de aceitação (fonte:
`docs/testes/issue335-fases12-local.md:14-15` e `docs/estado/estado-financeiro-e-tesouraria.md:10,18`):

- Quatro IVAs: movimento líquido 12.300 + 15.900 − 5.650 − 3.690 = 18.860;
  dinheiro 12.300 / 6.560 (= 15.900 − 9.340); compensação 0 / 9.340 / 5.650 / 3.690.
  Caixa esperado após o encontro = 18.860; a compensação (9.340 recebida vs
  5.650 + 3.690 pagas) cancela-se fora do caixa.
- Estoril: receita 30.996 = 23.406 transfer (dinheiro) + 7.590 compensation;
  despesa 7.590 compensation; linha bancária única 23.406.
  Caixa esperado = 23.406 (a fórmula antiga só dá 23.406 quando receita e despesa
  estão na MESMA conta; com contas diferentes diverge).

## 1. Fórmulas de saldo de conta e caixa (núcleo)

| # | Consumidor (ficheiro:linhas) | O que lê / fórmula | Classe | Prova |
|---|---|---|---|---|
| 1 | `supabase/migrations/20260911003710_edab7dab-....sql:8-45` — `_account_true_balance_raw` | `initial_balance + Σ paid_amount assinado (por account_id) + Σ(withholding+credit)`; sem filtro de método/geridos | **(b)** | `:20-44`; candidato inerte `offset_balance.INERTE.sql:10-59` mostra a exclusão que falta (`managed`, `cash` com `payment_method<>'compensation'`) |
| 2 | `supabase/migrations/20260911143727_5167c2fe-....sql:1-35` — `_account_true_balance_asof_raw`; `:39-60` — `account_true_balances_asof` | idem com `_as_of` | **(b)** | `:11-34`; drizzle `0035_derp190_...sql` só adicionou `status/reversed_at` ao CTE de ajustes, não ao paid_amount |
| 3 | mesma migration 20260911003710 `:81+` — `account_true_balance`; `20260911161621_4a3f0e28-....sql:48-79` — `account_has_balance_for` | wrappers: devolvem/comparam o saldo de #1 | **(b)** (herdado) | `account_has_balance_for`: `v_balance := _account_true_balance_raw(...)`, `:73-76` |
| 4 | `src/lib/account-balance.ts:27-46` — `computeAccountBalance` | `initial_balance + Σ paid_amount assinado` (data efetiva, corte estrito) + ajustes; `skip_balance_check → null` | **(b)** | não filtra `payment_method` nem transações geridas, `:27-46`; ajustes em `:81-111` também sem filtro de método |
| 5 | `src/lib/account-balance.ts` — `fetchAccountCashAdjustments` | Σ(withholding+credit) de pernas `status='paid'`, `reversed_at IS NULL`, da conta | **(a)** | pernas de compensação não têm withholding/credit na prática e têm `account_id NULL`, logo não entram; filtro `onlySettlingPayments` já exige paid/não revertida |
| 6 | `supabase/migrations/20260909195352_eb89ddd4-....sql:1-98` — `get_event_cash_position` | por evento: `Σ paid_amount assinado` + ajustes (realized), `amount-paid_amount` (committed), `amount` (pending); contas bank/cash/prepaid não-skip | **(b)** | `:32-55` sem filtro de método/geridos; candidato inerte `cash_position.INERTE.sql:28-64` mostra a exclusão (`managed` + pernas `payment_method<>'compensation'`) |
| 7 | `supabase/migrations/20260909203309_b453670a-....sql:1-61` — `get_event_cash_position_invariant` | soma `realized` de #6 e recalcula o lado direito com a MESMA fórmula antiga | **(b)** | `:17-51`; os dois lados mudam juntos — invariante continua "equilibrado" mas mede um número que deixa de ser dinheiro real; tem de ser actualizado no mesmo bloco que #6 |
| 8 | `supabase/migrations/20260912185027_f1400cd0-....sql:5-38` — `_ticket_office_balance_raw`; `20260912184107_ee7d05ec-....sql:50-74` — `ticket_office_balances` | vendas + `Σ paid_amount` de tx `approved/paid` não estornadas/ocultas da conta bilheteira − adiantamentos abertos | **(b)** condicional | `:17-28` sem filtro de método; diverge SE a transação mãe de uma perna de compensação tiver `account_id` de bilheteira (com #335 a perna não toca a conta, mas o `paid_amount` da mãe inclui a compensação) |
| 9 | `src/lib/ticket-office-balance.ts:79-150` — `computeTicketOfficeBalance` (cliente) | réplica local de #8 | **(b)** condicional | mesma ausência de filtro de método, `:79-150` |
| 10 | `src/pages/TicketOffices.tsx:153-162` — `bankBalance` local | `initial_balance + Σ paid_amount assinado` das tx da conta bilheteira | **(b)** | `:156-162`, sem filtro de método |
| 11 | `src/lib/card-account-balance.ts:14-38`, `src/lib/card-session-balance.ts:33-88` | saldo de cartão via `computeAccountBalance` / `Σ paid_amount` assinado | **(b)** (herdado de #4) | delegam em #4 ou repetem `paid_amount` sem filtro |
| 12 | `supabase/functions/close-card-session/index.ts:788-849` | saldo teórico da sessão: abertura + carregamentos − gastos; gastos/directos valorizados por `paid_amount` (`:804`) | **(b)** | query `:798-801` sem filtro de método/status; se uma despesa de cartão entrar num encontro gerido, o teórico contaria a compensação como saída de caixa |

## 2. Consumidores SQL internos das funções de saldo (herdam a classe da base)

| # | Consumidor | Base usada | Classe | Prova |
|---|---|---|---|---|
| 13 | `supabase/migrations/20261002103000_camarim_invariant_saldo_sessao.sql:246-250` — invariante de sessão de camarim | `_account_true_balance_raw` | **(b)** herdado | `:246`,`:250` |
| 14 | `supabase/migrations/20261010184500_derp238_invariant_cash_negativo.sql:21-28` — `conta_cash_saldo_negativo` | `_account_true_balance_asof_raw(id, NULL)` | **(b)** herdado | `:23`; o próprio cabeçalho `:2-10` declara que vigia "o mesmo saldo que o Dashboard mostra" — com #335 esse número muda |
| 15 | `supabase/migrations/20260916032701_6925fcc4-....sql:37` — bloqueio de fecho de evento por posição | `_account_true_balance_raw` | **(b)** herdado | `:3` declara "formula unica do sistema"; `:37` |

## 3. Frontend — relatórios, páginas e validações

| # | Consumidor (ficheiro:linhas) | O que lê / fórmula | Classe | Prova |
|---|---|---|---|---|
| 16 | `src/components/ReportBankStatement.tsx:64-75,94-113,133-202` + exportações `src/lib/export-bank-statement.ts:32-33,136-139,189,229` (PDF/Excel) | abertura/fecho via `computeAccountBalance` (#4); linhas = `paid_amount` assinado; saldo corrido acumula | **(b)** | herda #4; linhas valorizadas por `paid_amount` bruto sem separar compensação; as exportações usam as mesmas linhas canónicas (`ReportBankStatement.tsx:204-206`) |
| 17 | `src/components/ReportCashFlow.tsx:90-98,108-142,152-232` | abertura = Σ `computeAccountBalance`; por período income/expense = `Σ paid_amount` (status paid, não estornado, sem filhas de rateio D-ERP70) | **(b)** | filtra status/estorno mas NÃO método nem geridos, `:108-142` |
| 18 | `src/hooks/useAccountBalanceCards.ts:55-94` + `src/components/DashboardBalanceCards.tsx:4-6,60` + `src/components/BalanceCompositionModal.tsx:4-6,29` + `src/pages/FinancialAccounts.tsx:151-155` | saldos do servidor: `account_true_balances_asof` (#2) e `ticket_office_balances` (#8); o hook só agrega | **(b)** herdado | `:56-63,87,93`; Dashboard declara "Nada é somado aqui" |
| 19 | `src/pages/BankReconciliation.tsx:805-856` — confronto sistema vs banco | sistema = `fetchAccountTrueBalancesAsOf` (#2); banco = `closing_balance`; decomposição do lado do sistema por `reconciliationCash` | sistema **(b)** herdado; decomposição **(a)** | `:805-856`; ver #21 |
| 20 | `src/pages/BankReconciliation.tsx:1069-1078,1083-1117` — cadeia de referência de abertura | fallback 3 = `account_true_balances_asof` à véspera | **(b)** herdado | `:1070-1078` |
| 21 | `src/lib/bank-statement/reconcile.ts:48-62` — `reconciliationCash` | caixa conciliável = Σ pernas da conta, `payment_method NOT NULL AND <>'compensation'`, `status='paid'`, `reversed_at IS NULL`, menos withholding/credit; fallback `abs(paid_amount)` só sem qualquer perna e antes do primeiro extrato | **(a)** | exclusão explícita de compensation, `:52-56`; é o ÚNICO consumidor de caixa em `src/lib` já alinhado com o modelo gerido (#336) |
| 22 | `src/components/AccountBalanceImplantModal.tsx:54-86,93-120` | saldo atual/simulado via `computeAccountBalance` (#4) | **(b)** herdado | `:54-86` |
| 23 | `src/pages/CardSessions.tsx:45-66` | saldo contabilístico dos cartões via `computeAccountBalance` (#4) + ajustes | **(b)** herdado | `:52-65` |
| 24 | `src/components/TransferFormModal.tsx:59-77,86-120`, `src/components/TransactionPaymentModal.tsx:243,376`, `src/components/BatchPaymentModal.tsx:276,332` | saldo mostrado/validado no servidor via `account_true_balance`/`account_has_balance_for` (#3) | **(b)** herdado | as escritas que criam são pernas bancárias normais — o que muda é o número validado |
| 25 | `src/components/TicketOfficeBalancePanel.tsx:52-74,163-186`, `src/components/ReportTicketOfficeAudit.tsx:160-196,242-348` (+ Excel/PDF), `src/components/TicketOfficePositionCards.tsx:11-22` | consomem #8/#9 (`computeTicketOfficeBalance` e/ou `ticket_office_balances`) | **(b)** condicional (herdado) | `ReportTicketOfficeAudit.tsx:255`; `TicketOfficePositionCards.tsx:22` |
| 26 | `src/components/ReportTreasuryProjection.tsx:17-40,53-95` | saldo inicial = Σ saldos servidor (#2); projeção por dia usa `amount` de tx `pending/approved` | projeção **(c)**; saldo inicial **(b)** herdado | a projeção não usa `paid_amount` nem pernas; compensação só existe em pernas pagas, fora do universo pending/approved |

## 4. Irrelevantes para saldo/caixa (classe c) — dívida, BP, sócio, projeção

Todos lidos neste bloco; usam `paid_amount` como "já pago" de um documento (dívida
aberta = bruto − pago), o que com compensação é o comportamento CORRECTO — a
compensação liquida dívida sem ser caixa:

- `src/components/ReportMovementReconciliation.tsx:147-173,196-213` (aberto = amount − paid_amount; exporta Excel/PDF);
- `src/components/ReportContasPagar.tsx:145-168,457-476` e `src/lib/export-contas-pagar.ts:63-86` (aberto = bruto IVA − pago);
- `src/components/ReportAging.tsx:24-43` (aberto = amount − paid_amount);
- `src/components/ReportForecastPayables.tsx:224-258,497-502` (pago por categoria; saldo BP);
- `src/lib/export-payment-list.ts:122-142,394-428` (saldo documental = withIva − paid_amount);
- `src/lib/export-event-bp-pdf.ts:173-176,545-550` e `src/components/EventForecast.tsx:3628-3633,4386` (estado de liquidação BP);
- `src/components/TransactionOffsetsBlock.tsx:40-62` (dívida disponível para compensar = max(0, gross − paid_amount));
- `src/components/PartnerCurrentAccountTab.tsx:51-86`, `src/components/PartnerPaidExpensesPanel.tsx:149-172` (conta-corrente/despesas do sócio);
- `supabase/functions/_shared/settlement/statement-service.ts:137-143,251-300,652-698` (demonstrativo do sócio: lê `amount`, não `paid_amount`; "compensation" aí é categoria de receita detida, não exclusão de método);
- `supabase/functions/_shared/settlement/partner-disbursement.ts:122-212` (desembolso/financiamento do sócio; sem `paid_amount`);
- `supabase/functions/_shared/settlement/event-cost-basis.ts:324-380` (saldo de BP por fracção paga — orçamento, não caixa);
- `supabase/functions/close-camarim-session/index.ts:877-883` (conta-corrente da titular: adiantamento líquido − pago pela titular);
- `supabase/functions/generate-accountant-zip/index.ts:100-104`, `supabase/functions/ads-invoice-apply/index.ts:743-763` (selecção/protecção, não saldo);
- CRUD/histórico: `TransactionFormModal`, `TransactionEditModal`, `TransactionPaymentsListModal`, `PaymentTimeline`, `TransactionRow`, `TransactionInstallmentGroupEditor`, `MarkInstallmentPaidModal`, `TransactionRenegotiateInstallmentsModal`, `SupplierTransactions`, `PaymentListsTab`, `src/lib/refund-grouping.ts:88-110` (agrupamento visual).

## 5. Casos de teste de aceitação sugeridos (por consumidor (b))

Setup A (quatro IVAs): encontro aplicado com movimento líquido 18.860,
dinheiro 12.300/6.560 na conta X, compensação 9.340/5.650/3.690.
Setup B (Estoril): receita 30.996 na conta Y = 23.406 transfer + 7.590 compensation;
despesa 7.590 compensation; extrato com linha única 23.406.

1. `_account_true_balance_raw(X)` (e `asof`, `account_true_balance`): = saldo anterior + 18.860; NUNCA + 18.860 + 9.340 nem + 18.860 + (9.340 − 9.340) duplicado. Repetir com as_of anterior e posterior ao corte do encontro.
2. `account_has_balance_for(X, 18.860,01)` = false; `account_has_balance_for(X, 18.860,00)` = true (fronteira exacta).
3. `get_event_cash_position` para o evento do encontro: `realized` = caixa (18.860 setup A / 23.406 setup B); `committed` e `pending` inalterados.
4. `get_event_cash_position_invariant`: `is_balanced = true` APÓS actualizar ambos os lados; provar que, sem actualização conjunta, o invariante passaria com número errado (teste de regressão do par).
5. `computeAccountBalance` / ReportBankStatement (setup B): fecho do período = abertura + 23.406; a linha da receita mostra 30.900/30.996 como documento mas o caixa do período = 23.406 — definir apresentação (linha única 23.406 vs documento + nota de compensação) ANTES de codificar.
6. ReportCashFlow: income do período da conta Y = 23.406, não 30.996.
7. Dashboard/Contas (`useAccountBalanceCards`): total caixa não inclui compensação; conta X reflecte +18.860.
8. Bilheteiras: encontro cuja transação mãe tem `account_id` de bilheteira — retido = vendas + caixa apenas; provar também o caso em que a mãe NÃO é bilheteira (inalterado).
9. close-card-session: despesa de cartão em encontro gerido — teórico não a conta como saída de caixa do cartão.
10. Invariantes #13/#14/#15: com encontro aplicado, `conta_cash_saldo_negativo` e o bloqueio de fecho avaliam o NOVO saldo; documentar se a semântica pretendida é "dinheiro" (nova) ou "dívida liquidada" (antiga) — decisão textual necessária antes do Publish.
11. BankReconciliation (setup B): confronto sistema vs banco fecha a 0 com linha 23.406; `reconciliationCash` já = 23.406 (classe a, teste de não-regressão).
12. Estorno do encontro: todos os valores acima voltam ao estado anterior (par aplicar/estornar, simétrico ao já provado no Bloco 2b para status/paid_amount/pernas).

## 6. O que teria de mudar em código antes do Publish (sem o mudar), por ordem de risco

1. **SQL `_account_true_balance_raw` / `_account_true_balance_asof_raw`** (e wrappers
   `account_true_balance`, `account_true_balances_asof`, `account_has_balance_for`) —
   risco mais alto: alimenta Dashboard, página de Contas, e as validações de saldo
   em pagamentos/transferências/lotes (#24). Um saldo inflado por compensação pode
   PERMITIR pagamento sem caixa; um saldo a menos pode bloquear pagamento legítimo.
   Candidato inerte já existe: `supabase/manual/20261021_issue335_offset_balance.INERTE.sql`.
2. **Frontend `computeAccountBalance` + `fetchAccountCashAdjustments`** — fórmula
   paralela no cliente usada por ReportBankStatement, ReportCashFlow, CardSessions,
   AccountBalanceImplantModal. Para excluir geridos precisa de dados de
   offsets/pernas no cliente (leitura extra) ou de migrar estes consumidores para
   o RPC do servidor. Decisão de desenho pendente.
3. **`get_event_cash_position` + `get_event_cash_position_invariant`** — actualizar
   no MESMO bloco (o invariante recalcula a fórmula; actualizar só um lado quebra-o
   ou certifica um número errado). Candidato inerte: `..._cash_position.INERTE.sql`.
   Nota: sem chamador executável encontrado no frontend/edges neste bloco (só
   `types.ts` gerado e comentário em `EventDetail.tsx:682`); o invariante SQL é o
   consumidor real.
4. **Bilheteiras** (`_ticket_office_balance_raw`, `ticket_office_balances`,
   `computeTicketOfficeBalance`, `TicketOffices.tsx` bankBalance) — risco condicional:
   só diverge se transação mãe de encontro tiver conta bilheteira; confirmar
   elegibilidade de contas `ticket_office` no núcleo do encontro antes de priorizar.
5. **close-card-session (edge) e card-session-balance** — saldo teórico da sessão
   usa `paid_amount`; mesmo condicional para contas `prepaid_card`.
6. **Invariantes consumidoras** (camarim `:246-250`, D-ERP238 `:21-28`,
   fecho de evento `:37`) — não recalculam; herdam o número novo. Decisão textual
   sobre a semântica pretendida (dinheiro vs dívida liquidada) antes de instalar.
7. **BankReconciliation** — o lado "sistema" do confronto e o fallback 3 da cadeia
   de abertura herdam do RPC (#1); `reconciliationCash` já está correcto (#336).
   Após o ponto 1, verificar que o confronto Estoril fecha a 0.

## 7. Limites e lacunas deste inventário

- Estado instalado: definições Live lidas do catálogo guardado
  `supabase/tests/issue335/live/phase2e-functions.json` (captura anterior); não foi
  feito novo SELECT Live neste bloco (não era indispensável).
- O agente de edge/SQL não leu integralmente os corpos de `launch_from_bank_lines`
  e `reconcile_bank_line` nem os seus chamadores; nenhum dos dois calcula saldo de
  conta (são de reconciliação/materialização), mas a leitura integral fica em dívida.
- `TicketOfficePositionCards.tsx` e as variantes de saldo de cartões/camarim não
  foram lidos integralmente linha a linha; a classificação vem da fórmula partilhada
  que consomem (#4/#8/#11).
- O grep inicial (~562 ocorrências dos termos) foi triado; os consumidores de saldo
  foram todos lidos, mas não se afirma auditoria integral de cada ocorrência de
  `paid_amount` em CRUD/histórico (classificadas (c) por padrão de uso).
- Nenhum valor monetário de desvio foi calculado: o código prova ausência de
  exclusão explícita; o desvio concreto depende dos dados (que documentos geridos
  existem e em que contas).
