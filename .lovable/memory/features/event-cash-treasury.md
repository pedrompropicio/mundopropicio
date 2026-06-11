---
name: Tesouraria entre Eventos (Event Cash Treasury) — FASE 1
description: Camada de tesouraria que corre EM PARALELO ao resultado. Torna visível
  como o pool único de caixa da empresa é partilhado entre eventos (excedentes
  financiam défices e custos comuns). NÃO altera DRE/BP/Acerto de Sócios/Resultado.
type: feature
status: em-curso
---

# Tesouraria entre Eventos — FASE 1

## Princípio inegociável
Esta feature é uma camada **derivada** de leitura. NÃO altera 1 cêntimo de DRE,
BP, Acerto de Sócios ou Resultado. Nenhum cálculo existente muda. Zero tabelas
novas, zero alterações a tabelas existentes — apenas funções SQL derivadas e UI
de leitura.

## Contexto
O caixa da empresa é um pool único (`financial_accounts` por empresa, contas
líquidas). Os eventos partilham esse pool: eventos com excedente financiam
implicitamente eventos em défice e custos comuns. Antes desta feature isso era
invisível.

---

## Secção A — Posição no Pool (IMPLEMENTADO)

Migration: `supabase/migrations/20260611120000_event_cash_treasury.sql`
(aplicada em **Test** em 2026-06-11; Publish para Live é decisão do utilizador).

### Função `get_event_cash_position(p_company_id uuid, p_date_from date, p_date_to date)`
Devolve, por evento, a posição líquida contra o pool, **espelhando exatamente**
`computeBalance()` (`src/pages/FinancialAccounts.tsx`) + `account-balance.ts`,
particionada por `event_id`.

Colunas: `level` ('event'|'common'), `event_id`, `master_event_id`
(`coalesce(parent_event_id,id)`), `parent_event_id`, `event_name`, `event_date`,
`is_sub`, `realized`, `committed`, `pending`.

Convenção espelhada (contas líquidas `type IN ('bank','cash','prepaid_card')`;
`ticket_office` fica FORA do pool):
- `realized` = Σ `paid_amount` com sinal (income +, tudo o resto −, por conta de
  ORIGEM `account_id`) + ajustes de caixa (`withholding_amount + credit_amount`
  das `transaction_payments` cuja conta é líquida), atribuídos ao `event_id` da
  transação. É a parcela que **entra no invariante**.
- `committed` = approved não pago: Σ `(amount − paid_amount)` com sinal (timing).
- `pending` = pending: Σ `amount` com sinal (menor certeza — ressalva).
- `event_id IS NULL` → linha **Comuns** (custos/movimentos comuns, não distribuídos).
- Master/Split: cada linha traz `master_event_id` para o frontend consolidar
  (drill-down aos subs). Subs identificados por `is_sub` / `parent_event_id`.
- `date_from`/`date_to` filtram `realized` por `payment_date` (vista por período);
  sem filtro = acumulado (tempo real). `committed`/`pending` são sempre estado
  atual (ainda não têm `payment_date`).

### NOTA DE ESQUEMA IMPORTANTE (verificado em Test 2026-06-11)
A tabela `transactions` **NÃO** tem coluna `target_account_id` e **NÃO** existem
linhas `type='transfer'` em produção/Test. (`target_account_id` existe sim, mas
em `event_ticket_office_advances`, não em `transactions`.) Logo, a cláusula do
brief sobre "transfer de ENTRADA via `target_account_id`" não se aplica a este
esquema: a transferência (ex.: fecho de bilheteira) é registada numa única
transação no lado de ORIGEM (`account_id`). Espelhar `computeBalance` (income
soma, resto subtrai, por conta de origem) já fecha o invariante. Quando o
`account_id` de origem é uma `ticket_office` (fora do pool), a transação não
entra no pool — correto, pois a conta de origem não é líquida.

### Invariante de fecho (VALIDADO com dados reais de Test)
`get_event_cash_position_invariant(p_company_id)` →
`Σ realized (todos os eventos + Comuns) + Σ initial_balance(contas líquidas)`
deve igualar `Σ computeBalance(contas líquidas)`.

Resultado 2026-06-11 (Test):
- Mundo Propício: lhs = rhs = **-165 623,05** → diff 0,00 ✅ balanced
- Coala Festival Portugal: lhs = rhs = **-821 661,22** → diff 0,00 ✅ balanced

(As posições são negativas porque a receita de bilhetes vive em `ticket_sales`/
contas `ticket_office`, fora do pool; os bancos só veem a saída de despesa. É
exatamente o ponto da feature — ver Secção B/C.)

### Segurança / GRANTs
Ambas as funções: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, guard
`p_company_id = current_company_id() OR is_platform_admin()`, `GRANT EXECUTE ...
TO authenticated`. Mesma convenção das restantes RPCs.

---

## Secção B — Retido na Bilheteira (PENDENTE)
Reutilizar o cálculo existente do `TicketOfficeBalancePanel` (vendas `ticket_sales`
− despesas diretas − transferências − adiantamentos). "Liquidez condicionada"
(`withholds_revenue`). NÃO depender de `settlement_id`/`transfer_transaction_id`
— a verdade é o movimento real por `event_id`.

## Secção C — Ponte "Onde está o dinheiro" (PENDENTE)
Resultado do evento (DRE existente) ± Timing (committed) − Retido na bilheteira
− Caixa cedido ao pool (posição credora da Secção A) − Parte de sócios externos
por liquidar (PartnerSettlementTab) = Disponibilidade real. Mostrar % participação
da empresa (100 − Σ sócios externos). Sem reservas automáticas.

## Secção D — Ecrã "Tesouraria" (PENDENTE)
Rota nova junto às áreas financeiras; visão empresa + drill-down por evento;
toggle tempo real/período; export PDF; toggle "Onde está o dinheiro" no DRE
(sem alterar números do DRE); permissões = matriz financeira (RLS por company_id).

## Fora de âmbito (fases seguintes)
- Fase 2: DRE Geral Mensal.
- Fase 3: alocação gerencial `event_cash_allocations`.
