---
name: BP x Transações — rateio Master simétrico
description: O relatório 'BP x Transações (Despesas)' compara o planeado (Business Plan) com o real (Transações) por evento numa estrutura agrupada por categoria L2. Em sub-eventos com toggle "Incluir rateios Master" ON, o Previsto E o Realizado recebem rateio do Master de forma simétrica.
type: feature
---

Relatório `/relatorios/bp-transacoes` (`ReportBPTransactions.tsx`).

## Toggle "Incluir rateios Master" (sub-eventos de turnê)

Quando o evento selecionado é um sub-evento e o toggle está ON, ambos os lados (Previsto e Realizado) recebem a contribuição do Master de forma simétrica:

### Previsto
- BP local do sub-evento (excluindo linhas com `master_forecast_id`, que já são fatias importadas)
- + Fatia virtual do BP Master rateada ÷N sub-eventos

### Realizado
- (a) TX locais lançadas direto no sub-evento (sem `parent_transaction_id`)
- (b) **Fatias reais** que o sistema de rateio multi-evento já criou no sub-evento via `parent_transaction_id` — mantém-se como estão (o split pode não ser ÷N: pode ser proporcional ou manual)
- (c) TX lançadas direto no Master (`event_id = parentEventId`, sem parent) rateadas virtualmente ÷N

### Toggle OFF
- Previsto: só BP local
- Realizado: só (a) — descartam-se fatias de rateio e TX do Master

## Por que esta lógica (decisão Mágicos Henry&Klaus, 2026-04)

Antes da correção, o Realizado descartava todas as TX com `parent_transaction_id` esperando substituí-las por um rateio ÷N das TX Master. Mas:
- TX Master multi-evento têm `event_id = NULL` (não casavam com `event_id = parentEventId`) → ficavam de fora
- As fatias filhas eram descartadas → realizado faltava ~30k€ nos sub-eventos
- O Previsto rateava o BP Master mas o Realizado não acompanhava → variação enorme e enganosa

Solução: confiar nas fatias reais (`parent_transaction_id`) que o sistema de rateio já criou com o split correto, e ratear ÷N apenas TX lançadas diretamente no Master.
