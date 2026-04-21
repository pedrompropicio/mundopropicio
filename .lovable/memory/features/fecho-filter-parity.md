---
name: Fecho do Evento ↔ Fecho com Parceiros (paridade de filtros)
description: As duas vistas de fecho usam EXATAMENTE o mesmo universo de transações para evitar divergência de números. Filtros canónicos.
type: constraint
---

# Filtros canónicos de transações em qualquer vista de Fecho

Sempre que uma vista mostre "resultado do evento" comparável ao acerto com sócios, a query de transações TEM que aplicar exatamente:

```ts
.in("event_id", allEventIds)
.in("status", ["approved", "paid"])
// + filtro client-side:
.filter(t => !t.is_transitory && !t.exclude_from_result)
```

## Why
- `pending` / `draft` / `refused` ainda não são realidade contabilística
- `is_transitory = true` → cauções, devoluções, extras de sócio em trânsito (não impactam DRE)
- `exclude_from_result = true` → linhas marcadas explicitamente para fora do resultado

## Componentes que devem partilhar este filtro
- `src/components/PartnerSettlementTab.tsx` (referência — Fecho com Parceiros)
- `src/components/EventFecho.tsx` (Fecho do Evento — alinhado em 2026-04)
- Qualquer DRE / Acerto / Síntese futura

## Antipattern detectado (Mágicos Henry&Klaus, abril 2026)
EventFecho mostrava resultado 81 458,06 € enquanto PartnerSettlementTab mostrava ~129 712 €. Causa: 7 despesas pending (48 254,24 €) entravam só no EventFecho. Resolução: alinhar query.
