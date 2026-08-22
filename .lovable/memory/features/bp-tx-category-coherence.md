---
name: BP↔TX category coherence (L3)
description: Vínculo por FK entre linha do BP e transação — a rubrica L3 da linha manda; triggers alinham em vez de bloquear; ressalva 1:1 (issue #29)
type: feature
---

Enquanto `event_forecasts.transaction_id` aponta para uma transação:

- A rubrica (`category_id`) da **linha do BP** é a fonte de verdade, ao nível **L3**.
- `sync_tx_category_from_forecast` — mudar a rubrica da linha propaga à transação.
- `realign_tx_category_from_forecast` — mudar a rubrica da transação directamente é
  silenciosamente realinhado de volta; fica registado em `system_audit_log` como
  `auto_realign_tx_category`.
- Anti-recursão obrigatória: ambos só agem em `pg_trigger_depth() = 1`.
  Snapshots (`version_id IS NOT NULL`) são ignorados.
- Substituíram os antigos `enforce_tx_category_l2_match` /
  `enforce_forecast_tx_link_l2_match` (validavam só L2 e **bloqueavam**).

UI:
- `TransactionEditModal` — rubrica read-only quando vinculada, com link para a linha
  do BP e botão "Desvincular do BP para editar a rubrica aqui".
- `ReconciliacaoBpTx` — "Vincular e mudar L3" confirma explicitamente a mudança de rubrica.

Ressalva (issue #29): o vínculo é 1:1. Linha paga em N documentos só tem FK à primeira;
as restantes associam-se por rubrica e não são cobertas por esta coerência.

Issue #59: TX já reclamada por FK por **outra** linha do BP não conta como realizado
desta linha nem bloqueia a sua remoção (`claimedByOtherForecast` em
`src/lib/bp-tx-matching.ts` e `EventForecast.tsx`). Órfãs continuam a entrar por rubrica.
