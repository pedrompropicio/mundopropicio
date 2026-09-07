# ESTADO — Financeiro & Tesouraria

Atualizado: 2026-09-07 · Issues abertas: #90, #91, #92, #124, #125 · #93 fechada por decisão do Pedro (não reabrir a auditoria do paid_amount)

## Em que pé está

- **Conta gerencial (`financial_accounts.is_accounting`).** Flag nova com default `true`; a conta "Pgto Mágicos Acerto Madrid" foi marcada como gerencial. A edge function `generate-accountant-zip` exclui transações dessas contas (query principal + ramo de notas de reembolso), mantendo o filtro `transaction_documents.is_accounting = true`. Efeito: 11 transações e 10 documentos fora do ZIP. Na transação a marca é herdada e apenas informativa (badge "Conta não contábil") — não existe campo em `transactions`.
- **Invariantes de valor pago reforçadas na BD.** `validate_installments_total()` deixou de depender de cronograma: INSERT recusa qualquer excesso sobre o bruto (`amount * (1 + iva_rate/100)`, tolerância 0,01 €); UPDATE só recusa se a nova soma for maior que a anterior e exceder o bruto (linhas legadas continuam editáveis e removíveis). Novo trigger `trg_validate_paid_amount_not_exceeds_gross` em `transactions` com a mesma lógica de legado. Ambos testados em Live.
- **`TransactionPaymentModal` endurecido.** Relê `paid_amount` da BD imediatamente antes de submeter (o snapshot em memória permitia duplicar); tolerância apertada para `>= 0,01`; todos os inserts em `transaction_payments` (incluindo irmãs de grupo-fatura e `BatchPaymentModal`) leem `{ error }` e lançam.
- **Editor ganhou correção de pagamentos.** Pode alterar a data e apagar um pagamento registado; valor, conta e método continuam só para admin/manager. Nenhuma ação disponível em evento fechado (`status='completed'`). Auditoria por campo mantida.
- **Lista de Contas a Pagar sem escrita direta.** "Marcar como Pago" voltou a ser estritamente visual (grava só `payment_list_items.manually_marked_paid`). "Liquidar (N)" passou a usar o `BatchPaymentModal` com conta obrigatória, uma linha em `transaction_payments` por transação e data inicial de `payment_lists.payment_date`. Filhas de rateio recebem `paid_amount`, `status` e `payment_date`, mas nunca `account_id` nem linha de pagamento (evita contagem dupla no saldo).
- **Faturas avulsas — aba Conferência.** Seletor de mês com lista vinda de consulta própria (independente do limite de linhas), abertura no mês mais recente com faturas, grupo próprio "Sem data da fatura" sempre no topo, consulta por intervalo quando há mês escolhido, aviso quando o limite de 1000 é atingido em "Todos os meses", e "Exportar mês" a consultar o período completo em vez das linhas em memória. Scanner/OCR intocados.
- **Faturas Ads — ciclo completo, em produção.** Tabelas `public.ads_invoice` e `public.ads_invoice_line`, bucket privado `ads-invoices`, edge functions `ads-invoice-ingest` (`parse_meta`, `propose_google`) e `ads-invoice-apply` (`confirm`, `generate`, `reopen`, `revert`), função `public.resolve_ads_event`, colunas `events.ads_allocation_level` e `events.ads_match_aliases`. O ecrã chama-se **Faturas Ads** (rota inalterada, `/faturas-plataformas`). Validado contra as cinco faturas Meta de abril a agosto e três meses de Google, todos a fechar ao cêntimo; 98% do valor é atribuído por regra explícita. A 07/09 fecharam-se as três lacunas que impediam corrigir um erro de matching: atribuição manual de evento por linha (`match_source = 'manual'`, com `matched_by`/`matched_at`), reabertura de uma fatura confirmada, e reversão de uma fatura já aplicada. Versão em produção confirmada por invocação: `v2.3_revert_guards`.
- **Tráfego pago da Anitta fechado.** A linha de BP "Trafego Pago (MP e Anitta)" de 13.551,12 € decompõe-se ao cêntimo em 10.126,02 € de faturas Meta Ireland (Fev 2.249,10 · Abr 1.312,02 · Mai 1.864,60 · Jun 797,44 · Jul 3.902,86) mais 3.425,10 € de pagamentos pela conta brasileira (1.730,30 + 1.694,80). Faltavam lançar Fevereiro e Abril, 3.561,12 € — lançados a 07/09 como liquidados. A rubrica 3.2.01 Digital da Anitta passou de 15.701,96 € para **19.263,08 €**, com o realizado da linha a 13.551,11 € contra BP de 13.551,12 €. O resultado do evento não mudou: a despesa do fecho é a soma das linhas de BP, e a linha já continha estes valores. Ficaram ligadas ao `forecast_id` as quatro transações de tráfego que estavam órfãs.
- **Fonte única do saldo de conta (parcial).** `src/lib/account-balance.ts` passou a exportar `computeAccountBalance(account, transactions, adjustments): number | null`, que devolve `null` quando `financial_accounts.skip_balance_check = true`. Cinco consumidores migraram e mostram "Sem controlo de saldo" em vez de número: `FinancialAccounts.tsx`, `TransactionPaymentModal.tsx`, `BatchPaymentModal.tsx`, `TransferFormModal.tsx` e `card-account-balance.ts`. Os três modais passaram a incluir os ajustes de retenção/crédito, terminando uma divergência de 460,00 € face ao ecrã de Contas. Os ecrãs de sessão de camarim/cartão ficaram deliberadamente de fora — ali o saldo é o da sessão, não o da conta, e o `skip_balance_check` só significa "não bloqueies o pagamento". Nenhuma validação nova foi introduzida.

- **Conta-espelho de sócio (07/09).** `financial_accounts` ganhou `partner_id` (→ `event_partners`) e `mirror_partner_aporte`. Numa conta com essa flag, o trigger `trg_sync_partner_aporte_mirror` cria automaticamente um aporte (`10.1.01`, receita, transitório, IVA 0) de valor igual a cada despesa paga por ali, atribuído ao sócio da conta, com evento do sócio e `flow = partner_settlement`. A ponte `partner_aporte_mirror` liga despesa↔aporte e garante idempotência: o espelho sincroniza com o `paid_amount` — se este mudar ou a transação for estornada ou apagada, o aporte acompanha ou desaparece. Aplicado à conta "Pgto Mágicos Acerto Madrid": 18 espelhos, 56.761,50 € de aporte do Henry Vargas, saldo da conta a 0,00. Os modais de pagamento avisam antes de confirmar que a conta gera aporte automático. Rubricas novas `10.1.04 · Empréstimo a Sócio` e `10.1.05 · Reembolso de Empréstimo de Sócio`, que ao contrário das 10.1.01/02/03 não exigem sócio de evento.

## A trabalhar agora

Nada em execução.

## Próximo passo concreto

Testar em Live o ciclo novo das Faturas Ads, por esta ordem: (1) abrir a fatura 254484037 de julho e carregar em "Gerar lançamentos" — tem de devolver 409 e listar os quatro lançamentos manuais da Delia de 03/08; (2) reabrir uma fatura confirmada e verificar que as campanhas Meta destrancaram; (3) reatribuir uma linha à mão e confirmar o carimbo de autor no tooltip. A reversão não se testa em Live enquanto não houver uma fatura aplicada que se possa perder sem custo.

## Bloqueios

- **(a) Regra dos cupões da Meta por decidir.** Em maio foram abatidos à Simone, em junho à Ivete; não há regra escrita.
- **(b) Regime de IVA das faturas Google por confirmar.** Não existe nenhuma transação de Google no sistema.
- **(c) 47.429,39 € de tráfego por lançar.** Abril: a mãe de 9.995,23 € estava na rubrica errada (10.8.07 Outros) e foi corrigida para 3.2.01 Digital a 07/09; tem agora uma filha (Anitta, 1.312,02 €) e faltam ratear 8.683,21 €. Agosto: 38.746,18 € da fatura de 02/09, dos quais 34.702,85 € são do Raphael Ghanem.
- **(d) Jan-26, Fev-26 e parte de Mar-26 nunca entraram no sistema — 71.989,54 €.** Issue #124. Quase tudo de eventos anteriores ao arranque do ERP e nunca importados.

## Dados legados deixados intactos por decisão do Pedro

- 3 transações com o pagamento registado duas vezes em `transaction_payments`.
- Transação "Aluguel espaço": `paid_amount` 11.842 sobre bruto de 10.086.
- 526 transações liquidadas sem conta e sem registo de pagamento (1.247.597 EUR).

Não corrigir sem decisão explícita.

## Diagnóstico aberto (números apurados em Live a 30/08/2026)

- 624 de 706 transações liquidadas não têm linha em `transaction_payments` (issue #91).
- 526 liquidadas sem `account_id`, das quais 395 (75%) vêm da Lista de Contas a Pagar; 218 itens marcados com "Marcar como Pago" ficaram todos `paid`.
- Saldo do Santander apurado por SQL a 07/09/2026: **-218.115,20 EUR** (-217.655,20 com os ajustes de retenção). O extrato bancário a 01/09 dizia **+107.257,71 EUR**. A conta tem `initial_balance = 0` e apenas 2 entradas contra 113 saídas — a diferença é receita por carregar, não erro de cálculo. O `skip_balance_check` foi ligado nesta conta para desbloquear pagamentos, não por desenho. As contas de bilheteira (Blueticket, BOL, Ticketline, Fever) não têm uma única entrada registada — a receita de bilhetes não está modelada como entrada de conta.
- `skip_balance_check` passou a ser respeitado nos cinco sítios do saldo de conta (ver "Em que pé está"), mas continua ignorado no export do extrato, no Fluxo de Caixa, na Projeção de Tesouraria, em `get_event_cash_position` e nos cálculos inline de `card-session-balance.ts` e `CardSessions.tsx`. Issue #90 mantém-se aberta por isso.
- Tornar a tesouraria utilizável exige três peças em conjunto: fonte única de saldo (#90), backfill de `transaction_payments` (#91) e modelação da receita de bilheteira. Uma peça isolada piora o resultado.
- Menor, sem issue: o OCR das faturas avulsas usa a edge function `extract-camarim-receipt` e o prompt de talões de camarim (bebidas, snacks, IVA 6%), o que pode degradar a extração em faturas de outra natureza.

## Factos que não se reinvestigam

**A lista de reembolso é um veículo de pagamento, não uma unidade contabilística.** `reimbursement_note_items` tem quatro colunas úteis — o item **é** uma transação que já existe. Qualquer regra aplica-se por transação, nunca por lista. Das 24 notas, 9 misturam despesas de evento com despesas só da empresa, e uma mistura dois eventos diferentes.

**O camarim já tem o campo do vínculo ao BP e nunca foi preenchido.** `camarim_items.bp_forecast_id` está a NULL nos 35 itens; os 24 já integrados viraram transações com `event_id` e sem `forecast_id`, num total de 15.496,15 €.

**Movimentos de capital ficam fora do resultado por trigger.** Qualquer rubrica `10.1.%` recebe `is_transitory = true` por `force_transitory_for_capital_branch`. Mas **entram no apuramento de IVA na mesma** — o `IvaManagement.tsx` não filtra transitórias nem excluídas do resultado.

**`transactions.iva_rate` tem default 23.** Uma transação criada sem passar a taxa nasce a 23% e vai direta ao apuramento de IVA. A taxa tem de ser sempre explícita.

**Feriados não entram no cálculo da data de execução SEPA** — decisão registada em `pain001.ts`: o banco reagenda.

**`paid_amount` não é derivado de `transaction_payments`** (624 de 706 liquidadas ficariam a zero). Auditoria do tema encerrada na #93, por decisão do Pedro.

**A fatura mensal da Meta discrimina o gasto linha a linha por campanha, com o nome completo.** Cada campanha aparece duas vezes, uma por posicionamento (Instagram e Facebook).

**O Google não envia PDF por email.** O aviso "documento de faturamento está pronto" traz só o número da fatura e um link para a consola. O custo por evento sai do espelho `crm.google_campaign_insights_daily`.

**O Google cobra por limiar de 500 EUR, não por mês.** O débito bancário nunca corresponde a um mês nem a um evento.

**`crm-meta-sync-insights` limita a janela a 90 dias por código, mesmo em mode full.** Buracos históricos do espelho são irrecuperáveis por essa via — para meses já faturados, a fatura é a fonte, não o espelho.

**Meta Platforms Ireland Limited, VAT IE9692928F, IVA 0% por autoliquidação (art.º 196.º da Diretiva 2006/112/CE).** Conta Meta 5094207367314169. Google Ads cliente 220-004-3144, perfil de pagamentos 5700-5654-4710.

**O saldo de conta nunca filtra `reversed_at`.** A RPC `reverse_transaction` tem dois tipos de estorno: `cash_refund` põe `paid_amount = 0` (o dinheiro voltou), `supplier_credit` mantém o `paid_amount` (o dinheiro saiu mesmo e nasce um crédito no fornecedor). `paid_amount` já é a resposta certa nos dois casos; filtrar `reversed_at` no saldo inflacionaria os estornos por crédito de fornecedor.

**Existem três overloads de `reverse_transaction` em Live.** A de 5 argumentos (`p_tx_id`, `p_kind`, `p_reason`, `p_valid_until`, `p_release_for_repayment`) é a correta e é a única chamada pelo frontend, em `PaymentTimeline.tsx`. A legada de 3 argumentos (`p_transaction_id`, `p_reversal_kind`, `p_reason`) continua viva sem consumidor e não toca em `transaction_payments` nem liberta a transação das listas. Estornar por SQL direto, sem a RPC, deixa `reversal_kind` a NULL e o `paid_amount` intacto — foi o que corrompeu o saldo do Santander em 3.177,96 € entre 01/09 e 07/09.

**A despesa do fecho de um evento é a soma das linhas de BP, não a soma das transações.** Lançar uma transação contra uma linha de BP que já contém o valor não altera o resultado do evento nem o apuramento por sócio — só converte previsão em realizado. Só há impacto no resultado se o total ligado à linha exceder o BP, e aí entra como custo fora do BP.

**Reverter uma fatura Ads aplicada apaga a transação-mãe, e as filhas caem por CASCADE.** Sete guardas correm antes e nenhuma é opcional: pago ou com `paid_amount` > 0, `settlement_id`, `card_session_id`, linha em `transaction_payments`, presença em `payment_list_items`, `reimbursement_note_items` ou `reimbursement_notes`, conferência em `accountant_transaction_reviews`, e data dentro de um período já em `accounting_exports`. A ordem das operações é fixa: soltar `event_forecasts.transaction_id` (FK NO ACTION, é a que bloqueia), apagar a mãe, e só depois apagar os ficheiros do storage.

**A rubrica de destino de uma fatura de tráfego não é garantida.** A fatura Meta de abril (252466632) esteve quatro meses lançada em 10.8.07 Outros em vez de 3.2.01 Digital, e por isso não aparecia em nenhuma leitura do Digital. Ao conferir tráfego pago, procurar por `invoice_ref` e por fornecedor, nunca só por categoria.

## Onde ler mais

- `.lovable/memory/features/payment-amount-invariants.md` — soma de pagamentos e paid_amount nunca excedem o bruto
- `.lovable/memory/features/payment-account-ownership.md` — conta e pagamento só na transação-mãe; "Marcar como Pago" é visual
- `.lovable/memory/features/financial-accounts-non-accounting-flag.md` — contas gerenciais fora da exportação contabilística
- `.lovable/memory/features/standalone-invoices.md` — scanner e aba Conferência das faturas avulsas
- `.lovable/memory/features/card-sessions.md`, `supplier-credits.md`, `transaction-installments.md`, `role-accountant.md`
- Issues #90, #91, #92
