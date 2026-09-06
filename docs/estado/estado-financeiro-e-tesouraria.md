# ESTADO — Financeiro & Tesouraria

Atualizado: 2026-09-06 · Issues abertas: #90, #91, #92 · #93 fechada por decisão do Pedro (não reabrir a auditoria do paid_amount)

## Em que pé está

- **Conta gerencial (`financial_accounts.is_accounting`).** Flag nova com default `true`; a conta "Pgto Mágicos Acerto Madrid" foi marcada como gerencial. A edge function `generate-accountant-zip` exclui transações dessas contas (query principal + ramo de notas de reembolso), mantendo o filtro `transaction_documents.is_accounting = true`. Efeito: 11 transações e 10 documentos fora do ZIP. Na transação a marca é herdada e apenas informativa (badge "Conta não contábil") — não existe campo em `transactions`.
- **Invariantes de valor pago reforçadas na BD.** `validate_installments_total()` deixou de depender de cronograma: INSERT recusa qualquer excesso sobre o bruto (`amount * (1 + iva_rate/100)`, tolerância 0,01 €); UPDATE só recusa se a nova soma for maior que a anterior e exceder o bruto (linhas legadas continuam editáveis e removíveis). Novo trigger `trg_validate_paid_amount_not_exceeds_gross` em `transactions` com a mesma lógica de legado. Ambos testados em Live.
- **`TransactionPaymentModal` endurecido.** Relê `paid_amount` da BD imediatamente antes de submeter (o snapshot em memória permitia duplicar); tolerância apertada para `>= 0,01`; todos os inserts em `transaction_payments` (incluindo irmãs de grupo-fatura e `BatchPaymentModal`) leem `{ error }` e lançam.
- **Editor ganhou correção de pagamentos.** Pode alterar a data e apagar um pagamento registado; valor, conta e método continuam só para admin/manager. Nenhuma ação disponível em evento fechado (`status='completed'`). Auditoria por campo mantida.
- **Lista de Contas a Pagar sem escrita direta.** "Marcar como Pago" voltou a ser estritamente visual (grava só `payment_list_items.manually_marked_paid`). "Liquidar (N)" passou a usar o `BatchPaymentModal` com conta obrigatória, uma linha em `transaction_payments` por transação e data inicial de `payment_lists.payment_date`. Filhas de rateio recebem `paid_amount`, `status` e `payment_date`, mas nunca `account_id` nem linha de pagamento (evita contagem dupla no saldo).
- **Faturas avulsas — aba Conferência.** Seletor de mês com lista vinda de consulta própria (independente do limite de linhas), abertura no mês mais recente com faturas, grupo próprio "Sem data da fatura" sempre no topo, consulta por intervalo quando há mês escolhido, aviso quando o limite de 1000 é atingido em "Todos os meses", e "Exportar mês" a consultar o período completo em vez das linhas em memória. Scanner/OCR intocados.
- **Camada de proposta para faturas de tráfego pago.** Existem as tabelas `public.ads_invoice` e `public.ads_invoice_line`, o bucket privado `ads-invoices`, a edge function `ads-invoice-ingest` (acções `parse_meta` e `propose_google`), a função `public.resolve_ads_event`, as colunas `events.ads_allocation_level` e `events.ads_match_aliases`, e o ecrã "Faturas de plataformas" em Financeiro (só leitura). Validado a 06/09/2026 contra as cinco faturas Meta de abril a agosto e três meses de Google, todos a fechar ao cêntimo. 98% do valor é atribuído por regra explícita.

## A trabalhar agora

Nada em execução.

## Próximo passo concreto

Confirmação pela contabilidade (que tranca `linked_event_locked`), geração da transação-mãe e das filhas por evento ligadas à linha de BP 3.2.01, e o comprovativo de veiculação por evento.

## Bloqueios

- **(a) Regra dos cupões da Meta por decidir.** Em maio foram abatidos à Simone, em junho à Ivete; não há regra escrita.
- **(b) Regime de IVA das faturas Google por confirmar.** Não existe nenhuma transação de Google no sistema.
- **(c) €48.741,41 de tráfego por lançar.** Abril: 9.995,23 € (lançado sem evento, nunca rateado) e agosto: 38.746,18 € (fatura de 02/09), dos quais 34.702,85 € são do Raphael Ghanem.

## Dados legados deixados intactos por decisão do Pedro

- 3 transações com o pagamento registado duas vezes em `transaction_payments`.
- Transação "Aluguel espaço": `paid_amount` 11.842 sobre bruto de 10.086.
- 526 transações liquidadas sem conta e sem registo de pagamento (1.247.597 EUR).

Não corrigir sem decisão explícita.

## Diagnóstico aberto (números apurados em Live a 30/08/2026)

- 624 de 706 transações liquidadas não têm linha em `transaction_payments` (issue #91).
- 526 liquidadas sem `account_id`, das quais 395 (75%) vêm da Lista de Contas a Pagar; 218 itens marcados com "Marcar como Pago" ficaram todos `paid`.
- Saldo do Santander apurado por SQL: **-111.264,22 EUR**. As contas de bilheteira (Blueticket, BOL, Ticketline, Fever) não têm uma única entrada registada — a receita de bilhetes não está modelada como entrada de conta.
- `skip_balance_check` é respeitado no card Saldo Total, na tabela de contas e no extrato em ecrã, mas ignorado no export do extrato, no Fluxo de Caixa, na Projeção de Tesouraria e em `get_event_cash_position` (issue #90).
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

## Onde ler mais

- `.lovable/memory/features/payment-amount-invariants.md` — soma de pagamentos e paid_amount nunca excedem o bruto
- `.lovable/memory/features/payment-account-ownership.md` — conta e pagamento só na transação-mãe; "Marcar como Pago" é visual
- `.lovable/memory/features/financial-accounts-non-accounting-flag.md` — contas gerenciais fora da exportação contabilística
- `.lovable/memory/features/standalone-invoices.md` — scanner e aba Conferência das faturas avulsas
- `.lovable/memory/features/card-sessions.md`, `supplier-credits.md`, `transaction-installments.md`, `role-accountant.md`
- Issues #90, #91, #92
