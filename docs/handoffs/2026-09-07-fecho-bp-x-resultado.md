# HANDOFF — Fecho da mesa de desenho `bp-x-resultado`

Data: 2026-09-07 · Arquivo morto — o estado vivo está em `docs/estado/estado-bp-verbas-e-rateio.md` e `docs/estado/estado-vinculo-bp-transacoes.md`.

## Contexto
A mesa `bp-x-resultado` (02/09 → 07/09) desenhou e construiu o BP de receita, as fundações de governação do BP (permissões, baseline, elevação de verba, vínculo) e o SSoT da receita. Encerrada a 07/09 com o Publish da D24.

## As seis decisões do charter e onde ficou cada uma

1. **Órfã de BP impedida com remédio no ecrã** — D1/D8/D14. Travado no servidor (trigger `enforce_transaction_approval_permission` em INSERT approved/paid e UPDATE→approved), com `LinkBpLineDialog` como remédio em todos os caminhos de escrita (directa, cartão, camarim, reembolso, cachê fixo). Estado: `estado-vinculo-bp-transacoes.md`.
2. **Elevação de verba do aprovador, sem limiar** — D2/D7. Permissão booleana `raise_budget`; RPC `raise_forecast_budget`; `RaiseBudgetDialog`; integrado em `approve-transaction` e `close-camarim-session`. Não há tabela de limites nem segundo aprovador. Estado: `estado-vinculo-bp-transacoes.md`.
3. **Versões congeladas voluntárias** — D5. Nenhuma versão gerada automaticamente além dos snapshots de lifecycle já existentes. Estado: `estado-bp-verbas-e-rateio.md`.
4. **`working_draft` fica** — D23. Sandbox editável de cenário; spec actualizada. 1 inerte na Live (Coala PT 2026 v51). Estado: `estado-bp-verbas-e-rateio.md`; decisão: DR-2026-09-06-D23.
5. **BP de receita = agregação das fontes em linhas sintéticas com três colunas** — D9/D10/D20/D21/D22. Sub-separadores Despesas | Receitas; sintéticas 1.1.01 / 1.1.03 / 1.2.01 com previsto original, previsto corrente e real; duas cargas de bilheteira (D20); fórmula fechada do original (adenda D21); verbas por segmento e encerramento de captação (D22). Estado: `estado-bp-verbas-e-rateio.md`.
6. **Card em Previsto + excedido = max(real, previsto corrente) por componente** — D24. SSoT `src/lib/event-revenue-basis.ts` com três bases (real / currentForecast / committed); todos os consumidores migrados; verificado ao cêntimo na Ivete (501.415,16 €) e na Anitta (2.527.352,94 €). Decisão: DR-2026-09-06-D24; memória: `.lovable/memory/features/event-revenue-basis.md`.

## Ficheiros centrais
- `src/lib/event-revenue-basis.ts`, `src/hooks/useEventRevenueBasis.ts`
- `src/lib/bp-income-synthetic.ts`, `src/lib/bp-sponsorship-synthetic.ts`, `src/lib/event-simulator-forecast-live.ts`
- `src/lib/bp-tx-matching.ts`, `src/lib/bp-line-required.ts`, `src/lib/bp-budget-excess.ts`
- `src/components/LinkBpLineDialog.tsx`, `src/components/RaiseBudgetDialog.tsx`
- `src/hooks/useEventFinancialCardData.ts`, `src/components/EventFecho.tsx`, `src/pages/EventDetail.tsx`
- `supabase/functions/approve-transaction/`, `close-camarim-session/`, `close-card-session/`
- `docs/DECISIONS.md` — D1–D24 e adendas

## Issues abertas que herdam o trabalho
- **#104** — D4: curva de evolução do previsto por L1/L2/L3 sobre `forecast_audit_log` + `system_audit_log` (próximo passo concreto da frente).
- **#114** — D2 e D1 no trigger como última linha de defesa (herdada pela frente `vinculo-bp-transacoes`).
- **#120** — `useDeleteSponsor` apaga card sem desvincular BP/TX; `getDefaultIncomeAccountId` nunca é chamado.
- **#108** — Anitta EDA 2026: 7 linhas com taxa de IVA divergente (decisão do Pedro).
- **#102** — AMBEV / Ivete: 10.976,95 € fechados sem BP nem transação.
- **#106** — `working_draft`: decidido (D23, fica) — fechar quando confirmado.
- 3 cards meio-ligados da Anitta (Durex 15.000 €, Matudis 6.000 €, Durex aluguer 813,01 €): correcção manual pós-fecho, padrão SQL do Casino — sem issue própria, registado no estado da frente vínculo.
