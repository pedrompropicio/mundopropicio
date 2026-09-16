---
name: Custo partilhado com terceiros (conta de circuito)
description: Colunas, triggers e rubrica do adiantamento por conta de terceiros; espelho automático em shared_cost_mirror e relação com exclude_from_result e com a trava de linha de BP (D-ERP69)
type: feature
---

# Custo partilhado com terceiros — funcionamento técnico

Regra de negócio em **D-ERP69**; procedimento em `docs/procedimentos/PROC-rateio-dayoffs-turne.md`.
Uma fatura entra uma só vez pelo total; cada linha declara de quem é o custo. A parte de
terceiros não é custo da MP: é adiantamento, e a posição vive numa **conta de circuito**.

## Colunas (Live, 16/09/2026)

- `financial_accounts.is_circuit_account boolean NOT NULL DEFAULT false` — marca a conta
  corrente do circuito. Convenção de configuração: `is_accounting = false`,
  `skip_balance_check = false` (o saldo é a posição, tem de ser verificável).
- `transactions.shared_cost_account_id uuid → financial_accounts(id)` — quando preenchida,
  a linha é adiantamento por conta de terceiros e a posição vive nessa conta.
- `transactions.shared_cost_counterparty_id uuid → suppliers(id)` — opcional, o terceiro
  concreto; serve para abrir a posição por contraparte.
- Índice parcial `idx_transactions_shared_cost_account`.

## Rubricas

`10.12 Rateio com Terceiros` (L2, income) e `10.12.01 Adiantamento por Conta de Terceiros`
(L3, income), na Mundo Propício. **Deliberadamente fora da família `10.1.*`**: o trigger
`force_transitory_for_capital_branch()` força `is_transitory = true` nessa família e não é
isso que se quer — o adiantamento não é transitória, é posição de circuito.

## Ponte

`public.shared_cost_mirror` — molde exacto de `partner_aporte_mirror`: `id`, `company_id`,
`account_id`, `source_transaction_id` (UNIQUE), `mirror_transaction_id` (UNIQUE),
`created_at`, `updated_at`. FKs para `transactions` com `ON DELETE CASCADE`. RLS ligada com
as mesmas duas políticas: `scm_select_privileged` (admin, platform_admin, manager,
accountant, editor, viewer) + RESTRICTIVE `company_isolation_shared_cost_mirror`.

## Triggers

**`force_exclude_from_result_for_shared_cost()`** — `BEFORE INSERT OR UPDATE ON transactions`
(`trg_force_exclude_result_shared_cost`): `shared_cost_account_id IS NOT NULL` →
`exclude_from_result := true`. Não depende de ninguém ligar o toggle à mão. Nunca força
`false` no caso inverso.

**`sync_shared_cost_mirror()`** — `AFTER INSERT OR UPDATE` (`trg_sync_shared_cost_mirror`) e
`BEFORE DELETE` (`trg_sync_shared_cost_mirror_del`).

O que o espelho faz:
- só actua com `type = 'expense'` e `shared_cost_account_id IS NOT NULL`;
- condições cumulativas para existir: `status = 'paid'`, `reversed_at IS NULL`,
  `paid_amount > 0`;
- cria uma transação `income` na conta `shared_cost_account_id`, com `amount` e
  `paid_amount` iguais ao `paid_amount` da origem (é o dinheiro que saiu, **bruto**),
  `iva_rate = 0`, `status = 'paid'`, `date`/`payment_date` iguais aos da origem, rubrica
  10.12.01, `event_id NULL`, `supplier_id = shared_cost_counterparty_id`,
  `exclude_from_result = true`, descrição `'Adiantamento por conta de terceiros — ' ||`
  descrição da origem, `company_id` da origem;
- em UPDATE reescreve valor, datas, conta, contraparte e descrição;
- se qualquer condição cair — estorno, despagamento, valor a zero, coluna limpa — **apaga**
  o espelho; a ponte cai por cascata;
- em DELETE da origem, apaga o espelho.

O que o espelho **não** faz: não toca em linhas de BP, não escreve em
`partner_capital_moves`, não tem `event_id`, não gera par de transferência, não conhece IVA
(o adiantamento é bruto, não tem base tributável nossa).

Guarda anti-recursão: o espelho nasce com `shared_cost_account_id NULL` e a função sai
logo à entrada se a transação que a dispara existir em `shared_cost_mirror` como
`mirror_transaction_id`.

Independente de `sync_partner_aporte_mirror()`, que fica **exactamente** como está. Uma
conta com as duas naturezas é erro de configuração, não caso suportado.

## Relação com `exclude_from_result` e com a trava de linha de BP

`exclude_from_result = true` é uma das quatro isenções da trava D1+D8 (ver
`bp-linha-obrigatoria.md`), iguais nas três camadas — trigger, `src/lib/bp-line-required.ts`
e `approve-transaction`. Logo: a linha de adiantamento por conta de terceiros **não** exige
linha de BP e **não** consome verba, por construção, sem excepção nova nenhuma. É também um
dos flags de `hasResultBlockingFlags` (`fecho-filter-parity.md`), pelo que sai do resultado
em Fecho, DRE, Acerto e cards.

O custo da MP entra no resultado por um lançamento **próprio**, na rubrica dele, pago pela
conta de circuito — e esse leva linha de BP como qualquer despesa.

## Hardening

Ambas as funções são SECURITY DEFINER com `search_path = public` e
`REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`. Verificado por
`has_function_privilege` (anon/authenticated false, service_role true).

## Ainda por fazer

UI: marcar a conta como circuito no ecrã de Contas, marcar a linha no modal de transação, e
painel da posição do circuito (por conta e por contraparte).
