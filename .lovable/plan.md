# #339 passo B0 — Inventário dos leitores de receita (R0, só leitura)

Lido por pesquisa no código (rg) e consultas de leitura a Live em 23/10/2026. Onde está "por confirmar", a linha só foi localizada e não foi lida por inteiro.

## 1. Tabela de consumidores

| Ficheiro/função | Fonte da receita | Perímetro | Já trata Master nas cidades? | O que mudar | Risco dupla contagem |
|---|---|---|---|---|---|
| src/lib/event-revenue-basis.ts `computeEventRevenueBasis` / `computeRevenueBasisFromRows` + useEventRevenueBasis | ticket_sales (bilheteira) + sintéticas 1.1.01/1.1.03 + event_forecasts income (bucket "outros", exclui is_overhead/transitory/exclude) | evento (+filhos só para "realizado") | não | receber `masterRevenueSlices` e somá-las ao bucket da cidade; na raiz somar a linha do Master uma vez | alto — é a SSoT (D24); quem soma raiz = Master + cidades contaria duas vezes |
| _shared/settlement/settlement-revenue.ts `computeSettlementRevenue` | forecasts/tx income por bucket, exclui is_overhead (l.90) | evento | não | mesmo parâmetro de quotas, mesma regra | alto — cartões, fecho e Portal leem daqui |
| _shared/settlement/event-settlement-inputs.ts `computeEventSettlementTotals` / `collectSettlementExpenseDocLines` | revenue via settlement-revenue; custos via expandOverheadToSplits + expandMasterAdoptedExpensesToSplits | Master+cidades | só custos | acrescentar a expansão da receita ao lado das duas de custo | alto |
| _shared/settlement/statement-service.ts (Portal + PDF do sócio) | forecasts + tx; expansões de custo (l.574, 597) | Master+cidades | só custos | idem; reimplantar partner-statement | alto |
| src/components/PartnerSettlementTab.tsx | mesmo par de expansões (l.476, 483) | Master+cidades | só custos | passar a usar o helper partilhado | alto |
| src/components/EventFecho.tsx | expandOverheadToSplits | evento/Master | só custos | idem | médio |
| src/lib/partner-settlement-report.ts, PartnerDREDialog.tsx | overheads expandidos | Master+cidades | só custos | idem | médio |
| useEventFinancialCardData + src/lib/event-financial-card.ts (cartões da capa) | revenue-basis + forecasts | evento | só custos (computeMasterQuota) | consumir as quotas de receita do helper | alto — Resultado da cidade |
| src/components/EventForecast.tsx (BP cidade/Master, "via Master") | event_forecasts do evento; linhas virtuais de custo | evento | só custos (overheads) | mostrar linhas de receita "via Master" só de leitura, como os custos | médio — só visual, mas totais do BP somam |
| ReportDRE.tsx / ReportDREBrasil.tsx / export-dre.ts | tx income + overheads expandidos (l.430 / 371) | empresa e evento | só custos | vista por evento: quota; vista empresa: só a linha do Master | alto na vista por evento |
| ReportDREEmpresarial.tsx | tx income | empresa | não se aplica | não precisa (receita do Master conta uma vez) | baixo |
| ResultsAnalysis.tsx | forecasts + tx; overheads (l.212) | Master+cidades | só custos | acrescentar quotas de receita | alto |
| ReportProfitability.tsx | forecasts/tx income por evento (por confirmar) | evento | não | quota por cidade, ou mostrar Master à parte | médio |
| src/lib/events-list-financials.ts (lista de eventos) | forecasts com is_overhead (l.93) | evento | por confirmar | quota por cidade; linha do Master não repetida | médio |
| src/lib/real-cache-calc.ts | só ticket_sales (`computeTicketRevenueAndOccupancy`; sem 'income' no ficheiro) | cidade | não se aplica | **não muda** (decisão A1/6) | baixo |
| Portal do Sócio (PartnerEventDetail, usePartnerFinancialCardData, PartnerFinancialCards) | statement-service / cartões | Master+cidades | só custos | herdam do helper | alto se não herdarem |
| RPC get_partner_bp_realized | por confirmar (não aparece na pesquisa por 'income') | evento | por confirmar | ler corpo antes do B1 | por confirmar |
| RPC get_partner_settlement_summary, get_event_cash_position (Live) | transactions income por event_id | evento | não | caixa fica no Master (dinheiro real); só resultado leva quota | médio |
| RPC sync_shared_cost_mirror, sync_partner_aporte_mirror, create_settlement_transfer | espelhos/fecho | evento | não | verificar que não leem quotas virtuais | baixo |
| _run_invariant_checks_raw | inclui 'income' | empresa | n/a | invariante nova "soma quotas = linha Master" | baixo |
| export-event-bp-pdf.ts, export-bp-version-multi-comparison-pdf.ts, export-pl.ts | forecasts do evento | evento | não | linhas "via Master" no PDF da cidade | médio |
| TourSimulator.tsx | totais directos (l.170, 286) | Master+cidades | agrega sem expandir | não precisa | baixo |

## 2. Propostas

(a) **Sítio único:** função pura `expandMasterRevenueToSplits(masterLines, subEvents, rule, ticketBasis)` em `supabase/functions/_shared/settlement/master-revenue-proration.ts`, com reexportação em `src/lib/master-revenue-proration.ts`. É simétrica a overhead-proration e master-adopted-expense-proration. Devolve fatias por cidade e uma marca de origem (o id da linha do Master), para os somadores de raiz excluírem as fatias.

(b) **Lista mínima a ligar:** event-revenue-basis, settlement-revenue, event-settlement-inputs, statement-service, useEventFinancialCardData, EventForecast, ReportDRE/ReportDREBrasil, ResultsAnalysis. Os restantes leitores herdam por estes.

(c) **Live hoje, receita com event_id de um Master:**
- Tour M&M — Verão Europa 2026: 0 linhas de BP de receita; 5 transações de receita, 55.192,19 no total.
  - 4 comissões de 12.500,00, pagas.
  - 1 reembolso de alojamento de 5.192,19, aprovado.
  - Evento concluído.
- Raphael Ghanem — 2.0 (2026): 0 linhas de BP de receita; 1 transação de receita de 243,81 (devolução de camarim), paga. Evento concluído.
- Nenhuma destas transações é mãe ou filha de rateio. Os dois eventos estão concluídos, por isso a regra nova não pode tocar nos números deles.

## 3. Perguntas em aberto

1. Receitas que já existem no Master sem regra (os dois casos acima): ficam no Master como hoje (sem repartição) [recomendada] ou repartem-se?
2. Transações de receita no Master sem linha de BP: repartem-se pela mesma regra da linha, ou só as linhas de BP têm regra?
3. Proporcional à bilheteira: previsto = capacidade × preço do BP, ou bilhetes vendidos até à data? E quando muda para o real: no fim de cada cidade ou só no fecho do Master?
4. Caixa e conciliação ficam sempre no Master, e só o resultado leva quota: confirma?
5. A receita repartida entra na base de cálculo dos sócios (Portal) da cidade? Proposta: sim, como os custos do Master.
6. Ler o corpo de get_partner_bp_realized e de get_partner_settlement_summary antes do B1: autoriza mais esta leitura?
