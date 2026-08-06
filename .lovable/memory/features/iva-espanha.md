---
name: IVA Espanha (taxas por país da cidade do evento)
description: Taxas 21/10/4/0 para eventos em cidades de Espanha; empresa continua PT, IVA ES fora do apuramento português
type: feature
---

# IVA de Espanha (e outros países) — Fase 1 + 2

**Isto NÃO é a Fase 8 multi-país** (em quarentena). Continua proibido criar
`TaxEngine`, `fiscal_meta` ou `src/lib/tax/*`. A empresa continua **PT**,
`amount` continua **BASE sem IVA em EUR**, invariante D1 intacto.
O que muda é só: **as taxas aplicáveis quando o evento acontece numa cidade
de outro país**.

## Regra
Taxas pelo **país da cidade do evento** (`events.city_id → cities.country`).
- Portugal: `[0, 6, 13, 23]` (normal 23%)
- Espanha: `[0, 4, 10, 21]` (normal 21%)
- Sub-eventos usam a **própria** cidade.
- **Master de turnê sem cidade** (`city_id` NULL): resolve pelos países das
  cidades dos sub-eventos (`parent_event_id`). Um só país → esse país; países
  mistos → **união ordenada** das taxas (ex.: 0/4/6/10/13/21/23) com default 23.
- Evento sem cidade e sem sub-eventos, ou transação sem evento (overhead) → **Portugal**.

## SSOT — `src/lib/iva.ts`
- `IVA_RATES_BY_COUNTRY` (chaves = nomes completos como em `cities.country`)
- `DEFAULT_IVA_COUNTRY = 'Portugal'`
- `getIvaRatesForCountry(country)` — fallback PT
- `getIvaRatesForCountries([...])` / `getDefaultIvaRateForCountries([...])` — turnês multi-país
- `getDefaultIvaRateForCountry(country)` — taxa normal (23 / 21)
- `snapToStandardRate(rate, rates?)` — **sem** o 2.º argumento comporta-se
  exatamente como antes (PT). Nunca remover esse default.

## Resolução do país
`src/hooks/useEventIvaCountry.ts` → `{ country, countries, rates, defaultRate }`
(inclui sub-eventos quando o evento é master sem cidade)
(react-query, resolve `events.city_id → cities.country`).

## Seletor partilhado
`src/components/IvaRateSelect.tsx` — usar em qualquer sítio novo onde o
utilizador escolha `iva_rate`. Pontos já convertidos: transações (criar/editar,
incl. taxas permitidas do OCR), BP (`EventForecast`, `ForecastEditModal`,
`BPGridEditor`, `BPPlanilha` (Handsontable) data validation), `AdoptForecastsModal`,
`SplitByIvaModal` (IVA médio faz snap ao conjunto do país), bilheteira
(`EventTicketing`, `ImplTicketsTab`), `EventClosingCosts`, recorrentes,
cotações, `ImplBPTab`.

## Import BP XLSX
`parseXlsxPL` aceita as taxas permitidas do evento de destino — uma fatura ES
a 21% **não** pode ser "corrigida" para 23%.

## DB
Constraints de `transactions.iva_rate` e `quotations.iva_rate` aceitam
`ARRAY[23, 13, 6, 0, 21, 10, 4]`.

## Gestão IVA (Fase 2) — `src/pages/IvaManagement.tsx`
- O **apuramento PT** (trimestres, IVA por evento, desagregação por taxa,
  IVA pendente) usa **apenas** transações/vendas de eventos em Portugal ou
  sem evento.
- Secção separada **"IVA suportado no estrangeiro"**: agrupada por país × taxa
  com base/IVA de despesas e receitas, total informativo e **export XLSX**
  (para reembolso UE ou registo local). **Nada** desta secção entra no
  apuramento PT.
- Receitas de eventos ES ficam igualmente segregadas; a obrigação declarativa
  local é tratada fora do sistema.

## Testes
`src/lib/__tests__/iva.test.ts` cobre cálculo 21/10/4, snap com conjunto ES e
garante que o comportamento PT não muda um cêntimo.
