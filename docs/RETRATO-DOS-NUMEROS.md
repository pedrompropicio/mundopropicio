# Retrato dos números (09/10/2026)

Regra geral: o resultado de um evento com sócios calcula-se UMA vez, por
`computeEventSettlementTotals` (supabase/functions/_shared/settlement/event-settlement-inputs.ts)
+ `computeContractBasisResult` (src/lib/event-contract-result.ts), na base de
`events.partner_calc_basis` e no critério gravado `events.cost_expense_source` /
`cost_include_overhead`. Overhead: `overheadLinesFor` (uma vez). Cachê:
`cacheImpactOnTopOfCost` (uma vez). Extras do sócio: `src/lib/partner-extras.ts`.

| Ecrã | Número | Função | Base | Reconcilia com |
|---|---|---|---|---|
| Capa — Receitas | receita no perímetro e IVA do card | useEventFinancialCardData | vista do card | — |
| Capa — Custos | custo no perímetro e IVA do card (+ rateio Master, cachê se não estiver no BP) | useEventFinancialCardData | vista do card | — |
| Capa — Lucro | resultado do contrato | useEventContractResult → computeContractBasisResult | contrato | = Encontro de Contas (aviso se as vistas diferirem) |
| Fecho do Evento | resultado e acerto por sócio | EventFecho | contrato por sócio (expense_includes_iva herda) | = Encontro de Contas |
| Encontro de Contas | resultado s/IVA e c/IVA, parte por sócio | PartnerSettlementTab | contrato por sócio | = Lucro da capa; C1 Σ partes + residual = resultado |
| Apuramentos | fechamentos filhos | computeEventSettlementTotals | parent_share_basis | Encontro (perímetro da raiz) |
| Portal do Sócio | prestação de contas | partner-statement (statement-service) | contrato por sócio | = Encontro |
| PDFs do sócio | mesmos números do gerador | statement-service / partner-statement-doc | contrato por sócio | = Portal |
| Resumo de Acerto | quota, extras, pago | partner-settlement-report | contrato | Encontro (extras pela fonte única) |
| DRE / DRE Brasil | resultado por evento (Vista Sócio com overhead e extras) | buildDRE / buildDREBrasil | s/IVA (DRE), despesas c/IVA (Brasil) | não é o fecho: base contabilística |
| P&L (Business Plan) | previsto vs realizado | ReportPL | s/IVA | BP |
| BI de Vendas | bilheteira | ticket_sales | bruto/líquido por lote | card Receitas, bilheteira |

Excluídos de todo o resultado: transitórias, `exclude_from_result` (excepto o ramo
overhead — pendência D-ERP211), `pending`, linhas de fechamentos filhos fora do perímetro da raiz.
