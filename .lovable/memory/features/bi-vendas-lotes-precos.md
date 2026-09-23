---
name: BI de Vendas — Lotes e preços (por evento)
description: Separador "Lotes e preços" em /vendas/:groupId/:eventId — tabela por zona (preço em vigor, vendido, ocupação do libertado, viradas) e curva diária por zona, tudo numa RPC jsonb única
type: feature
---

Issue #214, 1.ª ronda (23/09/2026). Elasticidade e projecção ficaram para a 2.ª ronda.

## Onde

`src/pages/SalesBIEvent.tsx` passou a ter dois separadores: **Visão geral** (o que já
existia, modo zonas/modo sessões) e **Lotes e preços**
(`src/components/sales/ZoneLotsPrices.tsx`). Não há nada disto em `/relatorios`.

## Fonte única — RPC

`public.get_event_zone_price_dynamics(p_event_id uuid) → jsonb`
— `plpgsql`, `STABLE`, `SECURITY DEFINER`, `search_path = public`;
`REVOKE` a PUBLIC e a `anon`, `GRANT EXECUTE` a `authenticated` + `service_role`.
Isolamento por empresa com `row_belongs_to_current_company(events.company_id)`
(`RAISE 'sem acesso a este evento'`). **Nunca** um `setof` grande no cliente — a
agregação toda é na base, por isso a barreira dos 1.000 do PostgREST (#206) não
se aplica a esta secção.

Devolve `{ zonas[], series[], viradas[], totais, espelho }`:
- `zonas` — uma linha por zona **com vendas** em `ticket_sales`: `preco_vigor`
  (`unit_price` da venda mais recente), `qty`, `value`, `released`,
  `released_on`, `released_fonte`, `ocupacao_pct`, `viradas`.
- `series` — `qty`/`value`/`price` por zona × `sale_date`.
- `viradas` — dias em que o preço em vigor da zona mudou face ao dia anterior da
  série: `preco_antigo` → `preco_novo`.
- `espelho` — total do evento por `get_daily_sales_series` (a mesma origem do
  resto do BI), para mostrar a diferença.

## Regras que não se negociam

- **Ocupação é sobre o LIBERTADO**: `event_zone_capacities` com
  `capacity_kind = 'released'`, última `observed_on` por rótulo. O casamento
  tenta primeiro `zone_label = event_ticket_zones.name` (`released_fonte =
  'exacta'`) e, quando falha, `normalize_zone_label()` somando os rótulos da
  mesma zona (`'normalizada'`, marcada com `≈` na UI) — em Live os rótulos da
  Ticketline trazem lote e recinto (“Balcão 1 - Lote 2 - SUPER BOCK ARENA …”),
  pelo que só a via normalizada dá ocupação. Sem correspondência → `—`; a zona
  **nunca** desaparece da tabela.
- **Lote codificado no nome da zona é zona** (Ticketline). Sem parsing do nome.
- **Diferença mostrada, nunca escondida**: quando o total por zona não bate com o
  do evento, aparece o aviso com a diferença e "por zona até <última sale_date>".
- **Bilheteiras de retrato acumulado** (BOL, Onebox: 1 dia de série) mostram a
  tabela e o aviso "esta bilheteira só dá o acumulado — sem curva por zona" —
  nunca um gráfico de um ponto.

## Detecção de viradas

`src/lib/zone-price-turns.ts` → `detectPriceTurns(points)`, função pura (teste em
`src/lib/__tests__/zone-price-turns.test.ts`, 3 casos). Mesma regra da RPC: o
preço muda entre dois dias **consecutivos da série**; dias sem venda não contam.

## Estado em Live (23/09/2026)

Simone Mendes Lisboa 7 zonas com venda / 1 virada; Porto 7 zonas / 7 viradas;
Ghanem Porto 2027 26 zonas / 0 viradas. Eventos BOL do Ghanem (Coimbra, Santa
Maria da Feira) caem no aviso de acumulado.
