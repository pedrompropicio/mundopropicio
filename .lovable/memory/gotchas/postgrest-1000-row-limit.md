---
name: PostgREST 1000-row silent truncation
description: Queries supabase-js sem .range() são truncadas silenciosamente a 1000 linhas — usar fetchAllPaginated ou RPC
type: constraint
---

## Problema
Queries via supabase-js (`.select()` / `.in()` / etc.) sem `.range()` são truncadas **silenciosamente** às primeiras **1000 linhas** pelo PostgREST. Não há erro — só vêm menos dados. Sintomas típicos:
- Agregados (somas, contagens) aparecem incompletos ou zerados de forma **determinística** (a ordem física do heap decide quem entra).
- F5 / aba anónima / limpar cache **não resolvem** (não é cache, é o servidor a cortar).
- Alguns registos batem e outros não, conforme a ordem heap.

## Caso real (commit c0ddf87a, 2026-06-11)
Página **Bilheteiras** (`src/components/TicketOfficeEventsList.tsx` + `src/lib/ticket-office-retained.ts`) fazia `.in("zone_id", zoneIds)` sobre `ticket_sales` (~2.444 linhas em ~150 zonas) numa única chamada → cortado a 1000.
- Ivete Clareou: aparecia **0** (BD tem 4.133 bilhetes / 314.720 €) — todas as linhas calhavam depois da fronteira.
- Anitta EDA: aparecia **2.073.300 €** em vez de **2.329.780 €** — corte a meio.
- Simone Lisboa/Porto: batiam por sorte (linhas dentro das primeiras 1000).

## Solução
Helper `src/lib/paginated-select.ts` — `fetchAllPaginated(builder, pageSize=1000)` faz loop `.range(from, from+pageSize-1)` até a resposta vir menor que `pageSize`. O `builder` devolve uma nova query a cada página (supabase-js não permite reusar com `.range()` aplicado).

```ts
const rows = await fetchAllPaginated(() =>
  supabase.from("ticket_sales")
    .select("zone_id, quantity, unit_price")
    .in("zone_id", slice),
);
```

Para `IN` muito grandes, chunkar primeiro (ex: 200 ids por chunk) e paginar dentro de cada chunk.

## Regra
Qualquer query que **possa** devolver >1000 linhas deve:
1. **Agregar server-side (RPC)** — preferido quando a lógica é simples (SUM/COUNT/GROUP BY).
2. **Paginar com `fetchAllPaginated`** — quando há transformação complexa no cliente (ex: cruzar `ticket_sales` com `event_ticket_lots` para inferir IVA) que arriscaria divergir se replicada em SQL.

Nunca assumir que `.in()` ou filtros largos cabem em 1000.
