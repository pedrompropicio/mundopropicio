---
name: Receitas do Master repartidas pelas cidades (#339)
description: Regra equal/fixed_pct/ticket_share na receita do BP Master; quota só no resultado e fecho da cidade, caixa no Master; Portal sem previsto avisa antes de todas realizadas
type: feature
---

## Modelo aprovado pelo Pedro — 23/10/2026 (D-ERP301)
- Regra na linha de BP de receita do Master: `event_forecasts.revenue_split_mode` (`equal|fixed_pct|ticket_share`) + `revenue_split_params`, migração 0238. Transações ligadas à linha seguem a regra.
- Sem regra, a receita fica só no Master; receitas existentes da Tour M&M e Raphael Ghanem 2.0 inalteradas. A raiz conta a linha uma vez.
- `ticket_share` usa a mesma base para todas as cidades: previsto corrente da bilheteira até a última cidade se realizar, depois real.
- Caixa, saldos, conciliação e receitas em poder do sócio ficam sempre no Master. Só o resultado leva a quota; esta entra no resultado e no fecho com os sócios da cidade, preservando a marcação de fechamento.
- Antes de todas as cidades realizadas, o ERP reparte `ticket_share` pelo previsto; o Portal/documento do sócio não reparte e mostra aviso porque o servidor não tem o previsto. Depois de realizadas, os dois coincidem. Limitação aceite pelo Pedro.
- DRE/DRE Brasil preservam o ÷N antigo de TODAS as transações do Master na vista da cidade quando não há regra, sem mudar números de eventos concluídos.

## Ficheiros e testes
- Função pura única `expandMasterRevenueToSplits`: `supabase/functions/_shared/settlement/master-revenue-proration.ts`; reexportação `src/lib/master-revenue-proration.ts`.
- Leitor único ERP + edge: `supabase/functions/_shared/settlement/master-revenue-load.ts`.
- Contexto e leitura: `src/lib/master-revenue-split-context.ts`, `src/hooks/useMasterRevenueSplit.ts`.
- Ecrã: `MasterRevenueSplitEditor`, `MasterRevenueViaMasterPanel`.
- Testes: `master-revenue-proration.test.ts`, `master-revenue-city-settlement.test.ts` (paridade ERP/statement-service e regressão das fixtures Live sem regra).