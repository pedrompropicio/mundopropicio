---
name: Sponsorship Pipeline ↔ BP/Simulador
description: Pipeline de patrocínios alimenta BP só via botão manual; Simulador lê só BP; reset_reimport preserva vínculos
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

## CRÍTICO: reset_reimport NÃO apaga patrocínios

`apply-coala-bp` na fase `reset_reimport` (e qualquer reimportador equivalente) carrega `sponsorship_pipeline.linked_transaction_id` + `linked_forecast_id` do evento ANTES de apagar BP/TX e exclui esses IDs do delete. Caso contrário os cards do Pipeline ficam órfãos (linked_* a apontar para IDs apagados) e perde-se a receita de patrocínios em BP+DRE — só se recupera com SQL manual (ver `scripts/recover-coala-2026-sponsors-bp-tx-live.txt`).

Regra de ouro: qualquer importador/reset que apague em massa `transactions`/`event_forecasts` por `event_id` tem de **excluir explicitamente** os IDs referenciados em `sponsorship_pipeline.linked_*`.

## Deprecated

- Coluna `auto_sync_bp` na tabela `sponsorship_pipeline` continua a existir mas é **ignorada** pelo sync. Toggle removido do drawer.
- `useUpdateSponsor` deixou de chamar `syncSponsorToBP` automaticamente.

## D22 (2026-09-05) — Verba por segmento e sintética de receita

- Planeamento por **verba de segmento**: `sponsorship_segments` (por empresa) + `event_sponsorship_targets` (por evento × segmento, com `baseline_amount` fixo). `sponsorship_pipeline.segment_id` classifica o card.
- BP › Receitas mostra 1 linha sintética **1.2.01** (não persistida) com original / corrente / real e sub-linhas por segmento. Corrente = fechados + verba por captar enquanto `events.sponsorship_closed_at IS NULL`; depois do encerramento = só fechados.
- **Sem verbas definidas o comportamento é exactamente o anterior** (sem sintética, linhas 1.2.01 persistidas contam normalmente). Com verbas, as linhas 1.2.01 de cards fechados são excluídas das listas/totais (a sintética representa-as) — nunca apagadas.
- `syncSponsorToBP`: só `stage='closed'`; card meio-vinculado devolve `half_linked` (nunca cria de novo); forecast nova nasce `formalidade='fechado'`.
