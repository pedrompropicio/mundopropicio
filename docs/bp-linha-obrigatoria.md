# Linha de BP obrigatória na aprovação (D1 + D8)

Doc viva: `.lovable/memory/features/bp-linha-obrigatoria.md` (mais detalhada).
Este ficheiro existe para ser referenciável no repo.

## Regra

Numa empresa/evento gerido **com BP**, uma transação de **despesa** não pode
passar a `approved` (nem nascer `approved`/`paid`) sem `transactions.forecast_id`.

Camadas com o **mesmo** predicado:

- trigger `public.enforce_transaction_approval_permission()`
- helper `src/lib/bp-line-required.ts`
- edge function `supabase/functions/approve-transaction/index.ts`
- `countsAsBudgetCommitment` em `TransactionFormModal.tsx`

## Isenções

1. `auth.uid() IS NULL` — service_role, crons, edge functions.
2. `parent_transaction_id IS NOT NULL` — filha de rateio/parcela.
3. Evento `without_bp` e transações sem evento.
4. Não consomem verba do BP: `is_transitory`, `exclude_from_result`,
   `reversed_at` preenchido, `is_hidden`, `shared_cost_account_id` preenchido
   (D-ERP69, 16/09/2026).
5. **10.3 "Transferências Internas" nunca exige linha de BP (20/09/2026, #111)** —
   rubrica 10.3 ou descendente (`code LIKE '10.3%'`), **com ou sem evento**. São
   movimentos de tesouraria/bilheteira; o BP nunca tem linha para eles. Em Live
   havia 17 transações aprovadas/pagas em 10.3 com evento que ficariam "sem
   linha" por definição e nunca poderiam ter uma.

## Métrica de cobertura

Não existe invariante em `run_invariant_checks()` nem métrica de ecrã que conte
"transações sem linha de BP". O balde sintético do BP
(`orphanBucketLabel`, `bp-tx-matching.ts`) é **informativo** (não é pendência
desde 22/08/2026) e continua a mostrar as transações 10.3 — por desenho, para o
valor nunca desaparecer da vista. Nada foi excluído de contagens porque não há
contagens.
