# ESTADO — Vínculo BP ↔ Transações

Atualizado: 2026-08-29 · Issues: `a-seguir` #29 · achados A2, A5 por abrir

## Em que pé está
O vínculo canónico é **`transactions.forecast_id`** (N transações : 1 linha de BP), implementado a 28/08 com escrita dupla para a âncora legada `event_forecasts.transaction_id`. A 27/08 o modal manual passou a guardar `selectedForecastId` e a escrever a FK no insert. **Os totais do fecho nunca dependeram de nenhuma destas chaves** — DRE, P&L, fecho e acerto de sócios agregam por **rubrica**, via `bp-tx-matching.ts`.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
**Medir o rácio de transição:** por evento, quantos euros do fecho estão presos a vínculo **explícito** (`forecast_id` preenchido) e quantos a **inferência** (`scoreDescriptionMatch`).

## Bloqueios
Nenhum.

## Factos que não se reinvestigam

**Dois regimes coexistem sem fim declarado:** o explícito e o inferido por tokens de descrição, que é o fallback silencioso do legado. Na Anitta, só **21 das 261** transações de despesa têm ordenador próprio; as outras 240 herdam-no por matching, incluindo **179.741,57 €** em rubricas mistas.

**Continuam a nascer transações sem linha escolhida** depois de 27/08: 25/08 → 1 em 23; 26/08 → 3 em 6; 27/08 → 3 em 11; 28/08 → **4 em 14**. Por decidir: é opcional por desenho, ou o ponto 4 não chegou a esse caminho?

**A2 — achado por abrir (P2).** Em `findMatchingTransactionsForForecast`, `allowedEventIds` inclui `null`. Uma transação com `event_id` nulo é elegível para o matching de **qualquer evento em simultâneo**, podendo contar em dois fechos. Sobe a P1 quando existir terceira empresa.

**Fragilidade documentada:** `scoreDescriptionMatch` é winner-takes-all por tokens; convenção de nomes a funcionar como chave estrangeira. 169 grupos expostos. Já mordeu: 12 transações de per diem na linha errada de 79.693,33 €.

## Onde ler mais
- `docs/handoffs/` — vinculo-bp-transacoes-n-para-1-2026-08-28 (secções 6 e 7)
- `src/lib/bp-tx-matching.ts`, `src/lib/ordering-partner.ts`, `src/lib/event-cost-basis.ts`
