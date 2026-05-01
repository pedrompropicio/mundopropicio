---
name: Sponsorship Pipeline ↔ BP/Simulador
description: Pipeline de patrocínios alimenta BP só via botão manual; Simulador lê só BP
type: feature
---

## Fluxo (2026-05-01)

- Simulador lê apenas `event_forecasts` em L3 sob L2 1.2 (não toca no pipeline).
- Ponte Pipeline → BP/TX é **MANUAL**, via botão "Gerar BP + Transação" (ou "Atualizar BP + Transação") no `SponsorDetailDrawer`.
- Mudar stage no Kanban (drag-and-drop) **não cria nada**. Mover para "Fechado" abre apenas diálogo a pedir o valor confirmado e muda de coluna; a criação efetiva é o utilizador que dispara depois no drawer.
- Permutas (`is_barter=true`) ficam só no pipeline — botão fica oculto.
- Sem botão clicado, cards Closed sem vínculo mostram badge amarelo **"Sem BP"**.

## syncSponsorToBP (src/lib/sponsorship-bp-sync.ts)

- Sempre cria TX em estado `approved` com `paid_amount=0` (sem `payment_date`). A liquidação é feita depois no fluxo normal de pagamentos.
- Categoria fixa **1.2.01 Patrocínios** (resolve por `code+company_id`). 1.2.02 deixou de ser usado pelo sync.
- Idempotente: se `linked_transaction_id` + `linked_forecast_id` existem, faz UPDATE em ambos (amount, iva_rate, description, category_id). Nunca toca em `payment_date` / `status` da TX (preserva liquidações).
- `useSyncSponsorBP` (mutation manual) invalida `event_forecasts`, `transactions` e `sponsorship-pipeline`.

## Edição de valor confirmado

- Se há vínculo e o valor muda, drawer abre `AlertDialog` de confirmação e propaga ao BP + TX após "Confirmar".
- Se TX vinculada está liquidada (`status='paid'` ou `paid_amount > 0.005`), `MoneyInput` do valor confirmado fica disabled com cadeado + mensagem para desfazer a liquidação primeiro. Detecção via `isLinkedTransactionPaid(transactionId)`.

## Deprecated

- Coluna `auto_sync_bp` na tabela `sponsorship_pipeline` continua a existir mas é **ignorada** pelo sync. Toggle removido do drawer.
- `useUpdateSponsor` deixou de chamar `syncSponsorToBP` automaticamente.
