---
name: Linha de BP obrigatória na aprovação (D1 + D8)
description: Despesa de evento with_bp não pode ser aprovada sem forecast_id; trigger no servidor + diálogo "Vincular ao BP" na UI; isenções auth.uid() NULL e parent_transaction_id
type: feature
---

# D1 + D8 — a linha de BP é obrigatória na APROVAÇÃO (nunca no lançamento)

## Regra
Numa empresa/evento gerido **com BP**, uma transação de **despesa** não pode
passar a `approved` sem `transactions.forecast_id`.

Bloqueia quando **tudo** é verdade:
- `NEW.type = 'expense'`
- `NEW.event_id IS NOT NULL`
- `public.event_budget_mode(NEW.event_id) = 'with_bp'`
- `NEW.forecast_id IS NULL`

## Isenções (deliberadas)
1. `auth.uid() IS NULL` — service_role, crons pg_cron, edge functions. Sem isto
   partem-se os syncs, o `close-camarim-session`, o `apply-coala-bp`, etc.
   **Consequência conhecida:** a edge fn `approve-transaction` corre com
   service_role, logo *não* é travada pelo trigger — a UI é a barreira real
   nesse caminho.
2. `NEW.parent_transaction_id IS NOT NULL` — filha de rateio ou parcela: a
   obrigação é do pai (e o master de rateio tem `event_id` nulo).
3. Evento em `without_bp` e transações sem evento: fora do âmbito.

## Servidor
Vive dentro de `public.enforce_transaction_approval_permission()`
(`BEFORE INSERT OR UPDATE ON public.transactions`), a seguir ao gate de
`approve_transactions`. Erro `42501` em pt-PT.

## UI (`src/pages/Transactions.tsx`)
- `src/lib/bp-line-required.ts` — `structurallyNeedsBpLine`,
  `fetchWithBpEventIds` (lê `events.budget_mode` com fallback a
  `companies.default_budget_mode`, default `with_bp`),
  `needsBpLineBeforeApproval`, `partitionByBpLineRequirement`.
- Aprovação individual → `requestApprove(id)`: se falta linha, abre
  `LinkBpLineDialog` em vez de chamar a edge function.
- `LinkBpLineDialog` lista as linhas activas (`version_id IS NULL`) da **mesma
  rubrica L3 e mesmo evento**, ou deixa criar a linha via RPC
  `batch_insert_event_forecasts` (só com `manage_bp`). Grava `forecast_id` e só
  depois aprova.
- Lote → aprova as válidas e mostra painel âmbar com as bloqueadas, cada uma com
  botão "Vincular ao BP" (resolução individual).

## Ponto ainda aberto
`src/components/ReimbursementNoteDetail.tsx` aprova por `update` directo em lote
(gate `isAdmin || isManager`) — o trigger apanha-o, mas sem o diálogo de
resolução. Ver issue de seguimento.
