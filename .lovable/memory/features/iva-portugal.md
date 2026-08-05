---
name: IVA Portugal (Art.º 18 CIVA)
description: Cálculo do IVA por linha com arredondamento ao cêntimo. Single source of truth em src/lib/iva.ts; importação valida e relatório /relatorios/auditoria-iva audita.
type: feature
---

> **Eventos fora de Portugal:** as taxas aplicáveis são as do país da cidade do
> evento (ES: 0/4/10/21) e esse IVA fica **fora do apuramento PT**.
> Ver [IVA Espanha](mem://features/iva-espanha).

## Regra
- Cálculo **linha a linha** (Art.º 36/37 CIVA): `iva = round(base × taxa/100, 2)`. Total = `base + iva` (cêntimo).
- DB guarda `amount` (BASE sem IVA) + `iva_rate`. Nunca guardar IVA absoluto.
- Tolerância padrão de comparação: **0,01 €**.

## SSOT (Single Source of Truth)
**`src/lib/iva.ts`** — todos componentes/exports/edge devem importar daqui:
- `calcIvaAmount(base, rate)` → IVA arredondado
- `calcTotalWithIva(base, rate)` → total c/IVA arredondado
- `checkIvaConsistency(base, rate, recordedIva, tol?)` → `{ ok, expectedIva, diff, absDiff }`
- `snapToStandardRate(rate)` → ajusta a 0/6/13/23%
- `inferIvaRateFromTotal(base, total)`
- `STANDARD_IVA_RATES`, `IVA_TOLERANCE`, `roundCents`

Aliases legados em `src/lib/utils.ts` (`calcWithIva`, `isFullyPaid`) e `src/lib/mock-data.ts` (`calcIvaAmount`/`calcTotalWithIva`) já usam a mesma fórmula — manter compat, mas em código novo importar de `@/lib/iva`.

## Validação no import (BP XLSX)
`src/lib/import-pl-xlsx.ts` — quando linha traz `(base, iva, total)` do Excel:
1. Infere taxa por `(iva/base)*100` e faz snap a 0/6/13/23.
2. Calcula `expectedIva = round(base × taxa)`.
3. Se `|ivaImportado − expectedIva| > 0,01`, regista warning com formato `Linha N ("desc"): IVA do ficheiro (X€) difere do cálculo correto (Y€ a Z%). Usando valor calculado.` e **substitui** pelo valor calculado.
4. Garante que o BP nunca herda erros de digitação manual no Excel.

## Relatório de auditoria
Rota **`/relatorios/auditoria-iva`** (permission `view_report_document_pendencies`):
- Lista transações + linhas BP onde `|base × taxa − round(base × taxa, 2)| > tolerância`.
- Tolerância configurável (default 0,01 €). Filtro por evento.
- Exporta XLSX com origem/data/evento/descrição/base/taxa/IVA esperado/resíduo.
- Útil pré-fecho de mês para detetar bases com cêntimos "estranhos" que vão divergir das faturas dos fornecedores.

## Testes
`src/lib/__tests__/iva.test.ts` cobre cálculo, consistência, snap e inferência.

## Rateio Master → Sub (BP)
Em `EventForecast.tsx` (`proratedParentExpenses` + totais do BP do sub-evento):
- Base prorrateada **arredondada ao cêntimo** antes de qualquer soma (`roundCents(parentBase / siblingCount)`).
- IVA somado **linha-a-linha** via `calcIvaAmount`, nunca como `Σ(base) × taxa`.
- Mesma regra aplicada a `incomeForecasts`/`expenseForecasts` para evitar resíduo agregado (caso Maiara e Maraisa Porto: ficheiro 191.721,09 vs ecrã 191.721,02 antes da correção).

### Compensação do último irmão (Σ sub = Master)
Quando `parentBase / siblingCount` não fecha ao cêntimo, os primeiros N−1 sub-eventos
recebem `roundCents(parentBase / N)` e o **último irmão (ordenado por data crescente)**
absorve o cêntimo residual: `share_last = round(parentBase − share * (N−1), 2)`.
Garante `Σ shares = parentBase` exato sem espalhar resíduo por todos.
- Variáveis expostas no objeto prorrateado: `_isLastSibling`, `_siblingIndex`, `_siblingCount`.
- Em rateios 50/50 com IVA 23%, o desvio típico é ±0,01€/linha que vai parar ao último sub-evento.
