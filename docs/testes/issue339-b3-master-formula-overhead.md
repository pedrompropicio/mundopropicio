# #339 B3 — Master e fórmulas no Overhead

23/10/2026. R1 autorizado pelo Pedro. Sem DDL, DML, Publish, deploy ou conversão de linhas existentes.

## Entrega
- Master: soma de computeBpFormula por cidade, cada uma pelo seu estado; limites no total e chão do realizado preservado; concluídos/selados sem recálculo.
- Composição por cidade guardada em formula_params.master_city_bases; leitores ERP/documento usam as mesmas fatias; ordem canónica da composição, resto na última cidade.
- Despesa/overhead com fórmula proporcional à base; sem fórmula permanece no caminho legado ÷N. Receita mantém revenue_split_mode, cachê mantém ticket_sales, caixa não recebe fatias.
- BP e Overhead usam BpFormulaPanel; zona mostra cidade; valor de fórmula só de leitura com confirmação ao fixar à mão.
- Família conta originais uma vez; cidade isolada conserva a fatia recebida.

## Provas
Antes: 2282 PASS (corrida anterior à implementação).
Depois: `bunx vitest run --maxWorkers=4`: 251 ficheiros PASS, 2 skipped; 2313 PASS, 6 skipped, 11 todo. 31 testes novos.
Corrida sem limitar workers teve timeout de beforeAll em newgang-crm-profile-fields; repetição integral com 4 workers passou, sem mudar testes Newgang.
Última corrida dos quatro testes B3: 31 PASS.
Verificação automática: build OK, sem erros de tipos. tsgo NÃO executado manualmente: o ambiente exige verificação automática; não afirmar comando tsgo executado.
Sem teste de escrita real no ecrã (DML proibido); gravação do mesmo editor validada em sandbox com cliente sintético, BP e Overhead: patches iguais para os dois tipos.
SELECT Live 23/10: SM 22 despesas / 115173,21; 7 overheads / 25800,00; Anitta 190 / 1666885,82 e 3 overheads / 32500,00; M&M 0 / 0,00; Ghanem 4 / 1296,57. Nenhuma fórmula nas despesas do Master. Fixture com 216 linhas reais, testes herméticos sem consultas reais.

## Deploy separado
Só partner-statement afectada pelo grafo _shared/settlement. Não reimplantada neste B3; precisa de R2 próprio. CI remoto por confirmar. Issue não fechada, estado e DECISIONS intocados, reserva B3 libertada no QUADRO.

## Questões/decisões em aberto
Nenhuma decisão de negócio nova. CI remoto, Publish e deploy partner-statement continuam separados; verificação de escrita real depende da janela autorizada do Pedro.

## Ficheiros
- `.lovable/memory/features/bp-linhas-com-formula.md`
- `AGENTS.md`
- `docs/QUADRO.md`
- `roadmap.md`
- `src/components/BpFormulaPanel.tsx`
- `src/components/EventClosingCosts.tsx`
- `src/components/EventFecho.tsx`
- `src/components/EventForecast.tsx`
- `src/components/PartnerDREDialog.tsx`
- `src/components/PartnerSettlementTab.tsx`
- `src/components/ReportDRE.tsx`
- `src/components/ReportDREBrasil.tsx`
- `src/components/ReportPartnerSettlement.tsx`
- `src/components/ResultsAnalysis.tsx`
- `src/hooks/useEventContractResult.ts`
- `src/hooks/useEventFinancialCardData.ts`
- `src/hooks/useEventSettlementEngine.ts`
- `src/hooks/useSyncFormulaForecasts.ts`
- `src/lib/__tests__/fixtures/master-formula-live-2026-10-23.json`
- `src/lib/__tests__/master-formula-b3.test.ts`
- `src/lib/invalidate-event-financials.ts`
- `src/lib/master-formula-load.ts`
- `src/lib/master-formula.ts`
- `src/lib/report-event-cost.ts`
- `src/test/bp-formula-master-sync-b3.test.ts`
- `src/test/bp-formula-overhead-b3.test.tsx`
- `src/test/master-formula-load-b3.test.ts`
- `supabase/functions/_shared/settlement/bp-formula.ts`
- `supabase/functions/_shared/settlement/master-adopted-expense-proration.ts`
- `supabase/functions/_shared/settlement/master-formula-load.ts`
- `supabase/functions/_shared/settlement/master-formula.ts`
- `supabase/functions/_shared/settlement/overhead-proration.ts`
- `supabase/functions/_shared/settlement/statement-service.ts`
