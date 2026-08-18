---
name: Sync nunca escreve no planeamento de bilhética
description: Fronteira entre syncs de bilheteira e o planeamento humano (event_ticket_zones/event_ticket_lots); flag sync_generated e réguas do portal em event_marketing.ticket_lots
type: constraint
---

## Regra

O **planeamento** de bilhética (`event_ticket_zones` + `event_ticket_lots` com capacidade,
preço e quantidade) é **humano e intocável** por qualquer rotina automática. Nenhuma sync
pode criar linhas "de previsão".

**Why:** em 2026-08-18 encontrámos 72 lotes `quantity=0, price=0, ticket_type_id IS NULL`
criados em batches automáticos em 13 eventos (nomes das réguas da Ticketline: "Lote Promo",
"Lote 1 | Mob.Reduzida"…). Poluíram a secção "Zonas de Bilhetes" e fizeram a previsão
"pular lotes". Apagados por SQL.

## Como se aplica

- `event_ticket_zones.sync_generated` e `event_ticket_lots.sync_generated` (boolean, default
  false) marcam **âncoras técnicas** criadas pelas syncs de vendas (Ticketline, BOL) só para
  pendurar `ticket_sales` (que não tem `event_id`; a ligação ao evento é via `zone_id`).
- Quem escreve com `sync_generated: true`: `_shared/ticketline-import-server.ts` e
  `_shared/bol-import-server.ts`. Nunca reescrevem preço/quantidade de linhas humanas.
- `src/components/EventTicketing.tsx`: `allZones`/`allLotsRaw` (cru) → `zones`/`allLots`
  filtrados por `!sync_generated` alimentam **todo** o planeamento; o bloco
  "Vendas por Zona (realizado)" usa `realizedZones` (inclui âncoras) para não perder vendas.
- Fever (`fever-import-server.ts`) está **fora** desta regra: o import Fever É o setup
  (zonas/lotes com preço real) e continua a escrever planeamento normal.

## Réguas/preços do portal

O portal público **não** lê os lotes do ERP. A sync de réguas (`bilheteira-sync`) escreve
apenas em `event_marketing` (`ticket_lots` jsonb, `offer_price_min`, `age_rating`,
`doors_time`) e a view `events_public` lê daí. Nunca voltar a usar `event_ticket_lots` como
fonte do portal.
