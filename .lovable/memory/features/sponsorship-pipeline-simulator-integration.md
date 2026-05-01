---
name: Pipeline de Patrocínios ↔ Simulador
description: O Simulador (event-simulator-coala/calc/sync e loadSponsors) lê APENAS event_forecasts (BP). Cards do sponsorship_pipeline só entram no Simulador depois de virarem linha BP via syncSponsorToBP (auto_sync_bp=true em stage closed/barter). Em negociação/lead/proposta NÃO contam.
type: feature
---

## Regra
- **Simulador = visão BP aprovado**. Lê `event_forecasts` (income, approved) em categorias L3 sob L2 1.2.
- **Pipeline = funil comercial** (`sponsorship_pipeline`). Não é lido diretamente pelo Simulador.
- A ponte entre os dois é `src/lib/sponsorship-bp-sync.ts` (`syncSponsorToBP`):
  - Disparado por `useUpdateSponsor` (drag-and-drop, edição no drawer) e pelo importer XLSX.
  - Cria/atualiza linha BP + transação só se `stage IN ('closed','barter')` E `auto_sync_bp=true` E `confirmed_amount > 0`.
  - Categoria: `1.2.01 Patrocínios` para closed, `1.2.02 Apoios` para barter (resolvida por `company_id` — multi-tenant).
  - Idempotente via `linked_forecast_id` / `linked_transaction_id`.

## Decisão (2026-05-01)
Mantém-se separação rígida: cards "Em negociação"/"Lead"/"Proposta enviada" NÃO aparecem no Simulador nem no card "Receitas via patrocínios". Só virtualmente no Pipeline. Quando fecharem, a sincronização promove ao BP automaticamente.
