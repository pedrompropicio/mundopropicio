# ESTADO — Vínculo BP ↔ Transações

Atualizado: 2026-09-02 · cobertura do vínculo explícito subiu de 42% para 80,6% do valor

## Em que pé está
O vínculo canónico é `transactions.forecast_id` (N transações : 1 linha). A 02/09 foram escritas **168 FK** em rubricas com uma linha única — onde o matching já era determinístico e a escrita não muda número nenhum.

**Cobertura actual:** 338 de 606 transações de despesa ligadas a evento (55,8%), **1.498.707,22 € de 1.858.714,76 € (80,6% do valor)**. Antes: 165 TX e 1.102.179,73 €.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
D8 — obrigar a linha no INSERT, lendo o modo do evento.

## Bloqueios
Nenhum.

## Factos que não se reinvestigam

**O universo real da decisão são 227 transações, 337.834,08 €** — as que estão em rubricas com VÁRIAS linhas de BP, onde há escolha humana a fazer e o `scoreDescriptionMatch` ainda decide. Metade do valor está em três rubricas: OOH 135.640,00 € (6 TX), Per Diems 81.203,06 € (69 TX), Cenografia 51.320,04 € (3 TX).

**A FK ganha sempre ao matching.** Confirmado no código: uma TX com forecast_id é reclamada pela sua linha mesmo com score zero (entra por directTx) e é excluída de todas as outras linhas da rubrica. Escrever a FK tira o algoritmo do caminho.

**Rubrica com uma linha nunca usou tokens.** A regra 2 do matching (categoria com uma linha reclama todas as TX da categoria) é determinística. Por isso o backfill das 168 foi arrumação, não correção.

**Medir o vínculo tem de subir ao master no rateio.** Uma filha de rateio herda o forecast_id do pai. Métricas que não fazem coalesce com o parent_transaction_id subestimam a cobertura.

**Onde as transações nascem (8 caminhos, medido a 02/09):** directa/modal 467 TX · rateio filha 136 · reembolso 74 · cartão 58 · grupo de fatura 47 · parcelamento 23 · settlement 14 · camarim 5. Três nunca escrevem linha. Dos 53 masters de rateio, só 12 têm linha (89.830,30 € de 148.812,19 €). É por isso que a regra do D8 vive no servidor e não nos formulários.

**A2 — achado por abrir (P2).** `allowedEventIds` inclui null em findMatchingTransactionsForForecast: uma TX com event_id nulo é elegível para o matching de qualquer evento.

**12 transações têm FK para linha de outro evento e 2 para outra rubrica** — todas alteradas a 28/08, são mães de rateio (event_id nulo) ligadas a linhas de eventos, o que é normal no desenho. As 2 de rubrica divergente ficam como observação, não foram tocadas.

## Onde ler mais
- `src/lib/bp-tx-matching.ts`, `src/lib/ordering-partner.ts`, `src/lib/paying-partner.ts`
- `docs/DECISIONS.md` — DR-2026-09-02-D1 e D8
