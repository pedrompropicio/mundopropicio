---
name: reverse_transaction
description: Estorno de transações — overloads existentes e chamada tipada no frontend
type: feature
---

Desde 2026-09-20 (#123), só existem as seguintes overloads de `public.reverse_transaction`:

- `reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date)` — wrapper.
- `reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean)` — implementação real.

A overload legada de 3 argumentos `(uuid, text, text)` foi removida em Live e registada como migration tracked.

No frontend (`src/components/PaymentTimeline.tsx`), a chamada usa os 5 argumentos nomeados e está tipada sem `as any`.
