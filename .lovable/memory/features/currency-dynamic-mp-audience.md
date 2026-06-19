---
name: Currency dynamic (MP CRM / MP Audience)
description: Moeda no CRM/Audience segue o AD ACCOUNT; helper canónico formatMoney; nunca hardcode €; ERP/BP/Sponsorship ficam EUR
type: feature
---

## Regra
- Em MP CRM e MP Audience, a moeda **apresentada** segue sempre o AD ACCOUNT
  (`ad_account_currency` / `meta_*.currency`). NUNCA hardcode "EUR" nem "€" em
  novos ecrãs.
- Sem conversão FX: só formatação. Os números (cents, ROAS, CPC, CPM) ficam como
  vêm da Meta API — só o símbolo/locale muda.
- ERP, Business Plan e Sponsorship Pipeline ficam fixos em EUR (regra de
  negócio — `goal_revenue_eur`, `total_budget_eur`, etc.).

## Helper canónico
`src/lib/currency.ts` exporta `formatMoney(value, currency, opts?)`:
- `Intl.NumberFormat` com `style:'currency'`.
- Locale auto-derivado: `BRL→pt-BR`, `USD→en-US`, default `pt-PT` (override via `opts.locale`).
- `opts.fromCents:true` divide por 100 (para `*_cents` da Meta).
- Fallback "EUR" se `currency` vier vazia — preserva output legacy.

Use sempre `formatMoney`; `formatInCurrency` (typed CurrencyCode) fica para
contextos ERP onde só EUR/BRL/USD existem.

## Estado por fase
- **Fase 0 (DONE)** — `formatMoney` em `src/lib/currency.ts`.
- **Fase 1 (DONE)** — ecrãs triviais (moeda já no contexto):
  - `src/pages/crm/Campaigns.tsx` (formatCurrency → formatMoney; labels Verba/Limite/budget/impact)
  - `src/pages/crm/CampaignView.tsx` (`eur()` → formatMoney; cap label)
  - `src/components/crm/EditAdsetBudgetDialog.tsx` (toast cap; "Valor atual")
  - `src/pages/crm/AudiencePrint.tsx` (`formatEur` aceita currency; CampaignAnalysis usa `m.currency`; Audit deriva de `context.currency`)
  - `src/pages/crm/AdAccounts.tsx`, `src/pages/crm/Connections.tsx` — já dinâmicos
- **Fase 2 (PENDENTE)** — derivação via hook (campanha/estratégia → ad account):
  Strategies*, StrategyView, StrategyRedesign, StrategyPrint, StrategyNew*,
  Insights, Audit.
- **Fase 3 (PENDENTE)** — DB: adicionar `currency text` em
  `crm.meta_campaign_strategies` (snapshot ao salvar). `role_budget_limits`
  fica em EUR (limite interno).
- **Fase 4 (PENDENTE)** — edge functions: limpar sufixos `*_eur` em payloads
  CRM (ou documentá-los como neutros).
- **Fase 5 (PENDENTE)** — locale `pt-PT`→`pt-BR` para datas/números puros em
  empresas BR (cosmético).

## Validação Fase 1
- EUR: sem regressão (mesmo output `€ 1.234,56`).
- BRL: símbolo `R$` e locale `pt-BR` (`R$ 1.234,56`).
- Onde a moeda não está acessível no payload (ex.: alguns blocos do
  AudiencePrint Audit), o fallback EUR mantém-se até a Fase 4 expor `currency`.
