---
name: Event revenue basis (SSoT)
description: Função única da receita do evento em 3 bases (real / previsto corrente / previsto + excedido) com decomposição por bucket
type: feature
---

`src/lib/event-revenue-basis.ts` (+ hook `src/hooks/useEventRevenueBasis.ts`) é a ÚNICA
fonte da receita de um evento ou Master+Splits — DR-2026-09-06-D24.

- `real` — `ticket_sales` linha a linha (D11) + TX `income` pelo filtro canónico do
  Fecho (`isValidFechoTransaction`). Anti-duplicação por PREFIXO `1.1.01`
  (`isBilheteiraCategoryCode`) quando há `ticket_sales`. **Sem `partially_paid`.**
- `currentForecast` — bilheteira `computeLiveTicketForecast` (D21 ad.2), A&B cenário
  forecast (injectado pelo hook), patrocínios `computeSponsorshipSynthetic` (D22),
  outras receitas = BP income da versão activa não coberto por sintéticas.
  `null` por componente sem base.
- `committed` — por componente `max(real, currentForecast ?? real)` (espelha o custo).

Realizado devolve `{net, gross}` por bucket (Bilheteira / A&B / Patrocínio / Outros);
o previsto é sempre s/IVA. Consumidores: `useEventFinancialCardData`, `EventFecho`,
`EventDetail`, `computeTicketSynthetic`. Nunca recriar cálculo local de receita.
