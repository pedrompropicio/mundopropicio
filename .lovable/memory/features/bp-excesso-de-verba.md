---
name: Excesso de verba — aprovar implica elevar a linha (D2 revista)
description: DR-2026-09-02-D2 (revista 03/09); helper bp-budget-excess, RPC raise_forecast_budget, RaiseBudgetDialog, budget_raises em approve-transaction e budget_raise em close-camarim-session
type: feature
---

# D2 revista (03/09/2026) — o BP é o norte

Aprovar uma despesa que faça o realizado da linha de BP ultrapassar a verba
implica **ELEVAR A LINHA no mesmo acto**. Não existe "assumir o excesso" nem
normalização posterior: a linha nunca fica abaixo do realizado. Quem não tem
`raise_budget` não aprova o excesso — fica pendente e escala. Sem limite em euros.

## Cálculo (base LÍQUIDA — D11)

`transactions.amount` contra `event_forecasts.amount`.

- realizado da linha = soma de `amount` das transações com esse `forecast_id` em
  `approved`/`paid`, excluindo as que `hasResultBlockingFlags` apanha
  (`is_transitory`, `exclude_from_result`, `reversed_at`, `is_hidden`);
- N:1 — agrega **por linha**, nunca despesa a despesa. Uma pergunta por linha;
- excesso = realizado + a aprovar − verba, só quando > 0;
- verba sugerida = realizado + a aprovar (pergunta pré-respondida ao cêntimo).

Análise por acto: reembolsos por **par evento × rubrica**, camarim por **sessão**,
lote de transações **por linha**.

## Peças

| Peça | Papel |
|---|---|
| `src/lib/bp-budget-excess.ts` | `computeBudgetExcess(entries)` → `BudgetExcessLine[]`; `isLikelyIvaRounding` (≤ 5 € ou ≤ 1%) |
| `public.raise_forecast_budget(_forecast_id, _new_amount, _observation)` | SECURITY DEFINER; exige `auth.uid()`, `is_platform_admin` OU `has_permission_in(uid,'raise_budget', company_id da linha)`; observação não vazia; só sobe; escreve `forecast_audit_log` (`field_name = 'Valor (EUR)'`, a convenção já existente) |
| `src/components/RaiseBudgetDialog.tsx` | todas as linhas de uma vez; observação partilhada + "usar observação própria"; sem `raise_budget` só explica e não avança. Modos: `onConfirm` (devolve raises) ou `applyViaRpc` |
| `approve-transaction` | body `budget_raises: [{forecast_id, new_amount, observation}]`; 409 `{ error, budget_excess }` sem aprovar nada; valida cada raise (403 sem permissão) e aplica ANTES de aprovar; `transaction_audit_log` ganha `bp_budget_raised` |
| `close-camarim-session` | body `budget_raise: { new_amount, observation }`; 422 `{ error, budget_excess }` no pré-voo; aplica antes de criar transações |

## Ecrãs ligados

- `Transactions.tsx` — individual e lote (modo devolver); trata também o 409
  `budget_excess` devolvido pela função e repete;
- `CamarimSessionDetail.tsx` — depois de escolher a linha; trata o 422;
- `ReimbursementNoteDetail.tsx` — `LinkBpLineDialog` passou a ser **por par
  evento × rubrica** (o `forecast_id` aplica-se a todas as despesas do par) e
  depois `RaiseBudgetDialog` em `applyViaRpc` com todas as linhas;
- `CacheTransactionModal.tsx` — cachê FIXO: diálogo em `applyViaRpc` depois de
  escolher a linha. Cachê VARIÁVEL: **sem diálogo** — a linha é do módulo e ele
  actualiza-a pela RPC com observação "Cachê variável recalculado pelo módulo".

## Fora de âmbito neste passo

- **Cartões** (`src/components/cards/`) — serão redesenhados para o modelo do
  camarim; só depois entram aqui.
- **Trigger** `enforce_transaction_approval_permission` não foi tocado. A última
  linha de defesa no servidor para escrita directa é a issue **#114** (P1).
- `baseline_amount` (D3) nunca é tocado — só a RPC mexe em `amount`.
- As 6 linhas hoje já excedidas normalizam-se na próxima aprovação de cada uma.
