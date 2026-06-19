---
name: Currency dynamic (MP CRM / MP Audience)
description: Moeda em CRM/Audience segue hierarquia ad account → empresa ativa → EUR; helper formatMoney + hook useDisplayCurrency; nunca hardcode €; ERP/BP/Sponsorship ficam EUR
type: feature
---

## Regra (hierarquia de moeda apresentada)
Em MP CRM e MP Audience, a moeda **apresentada** segue, por ordem:
1. **AD ACCOUNT** — `ad_account_currency` / `meta_*.currency` quando existe no
   contexto (campanha, adset, insight).
2. **EMPRESA ATIVA** — `companies.currency` via `useDisplayCurrency()` (default
   `"EUR"` só se vazio). Cobre ecrãs como o **Dashboard Meta Live** numa
   empresa BR sem ligação Meta — passa a mostrar `R$ 0,00` em vez de `€ 0,00`.
3. **"EUR"** — defesa em profundidade dentro de `formatMoney` (não confiar
   neste fallback nos call sites).

Sem conversão FX: só formatação. Os números (cents, ROAS, CPC, CPM) ficam como
vêm da Meta API — só o símbolo/locale muda.

**ERP, Business Plan e Sponsorship Pipeline ficam fixos em EUR** (regra de
negócio — `goal_revenue_eur`, `total_budget_eur`, etc.).

## Helper canónico e hook
- `src/lib/currency.ts` → `formatMoney(value, currency, opts?)`. `Intl`
  com locale derivado (`BRL→pt-BR`, `USD→en-US`, default `pt-PT`). `fromCents`
  divide por 100. Fallback final `"EUR"`.
- `src/hooks/useDisplayCurrency.ts` → devolve `companies.currency` da empresa
  ativa via `useCompany()`. **Puro de leitura — os call sites é que aplicam
  a hierarquia** (`adAccount?.currency ?? useDisplayCurrency()`).

## Estado por fase
- **Fase 0 (DONE)** — `formatMoney`.
- **Fase 1 (DONE)** — ecrãs triviais com moeda já no contexto:
  - `Campaigns.tsx` (formatCurrency → formatMoney; labels/toasts/budget/impact)
  - `CampaignView.tsx` (`eur()` → formatMoney; cap label)
  - `EditAdsetBudgetDialog.tsx`
  - `AudiencePrint.tsx` (CampaignAnalysis + Audit)
  - `AdAccounts.tsx`, `Connections.tsx` — já dinâmicos
- **Fase 1.1 (DONE)** — fallback dinâmico via `useDisplayCurrency()`:
  - Novo hook `useDisplayCurrency`.
  - `Campaigns.tsx` — Dashboard Meta Live (ROAS / Gasto / Receita / Conversões)
    cai na moeda da empresa ativa quando não há ad account ligado.
  - `CampaignView.tsx`, `EditAdsetBudgetDialog.tsx`, `AudiencePrint.tsx`
    (CampaignAnalysis + Audit) — fallback `"EUR"` → `displayCurrency`.
- **Fase 2 (PENDENTE)** — derivação via hook (campanha/estratégia → ad account):
  Strategies*, StrategyView, StrategyRedesign, StrategyPrint, StrategyNew*,
  Insights, Audit.
- **Fase 3 (PENDENTE)** — DB: `currency text` em `crm.meta_campaign_strategies`.
- **Fase 4 (PENDENTE)** — limpar sufixos `*_eur` em edge functions CRM.
- **Fase 5 (PENDENTE)** — locale `pt-PT`→`pt-BR` para datas/números puros.

## Validação Fase 1.1
- Empresa PT (MP), sem ad account: continua `€ 0,00` (companies.currency=EUR).
- Empresa BR (Siriguella/Fortal), sem ligação Meta: Dashboard mostra `R$ 0,00`
  em vez de `€ 0,00`.
- Empresa BR com ad account BRL ligado: `R$ 1.234,56` (vinda do ad account).
- Empresa PT com ad account USD: `$ 1,234.56` (ad account ganha à empresa).

