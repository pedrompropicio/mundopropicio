# ESTADO — BP, Verbas & Rateio

Atualizado: 2026-08-29 · Issues: `a-seguir` #29, #30, #59, #60, #68 · achado A1 por abrir

## Em que pé está
O BP é a fonte do fecho (D-BP1, 21/08): custo = previsto + excedido por rubrica L3, onde excedido = `máx(realizado − previsto, 0)`. O excedido **não é categoria de custo — é métrica de desactualização do BP e deve tender para zero**. As comparações planeado-vs-realizado fazem-se entre versões seladas do BP, nunca BP-vs-transações (numa co-produção, realizado zero numa rubrica de sócio é o normal, não poupança). A funcionalidade de **verbas** está desenhada mas não construída.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
**Responder às duas perguntas do rateio do master, antes de construir verbas:** (1) a transação do master é rateada virtualmente para os filhos, como a linha de BP é? (2) o excedido por rubrica vê a fatia do master?

## Bloqueios
- **Taxonomia do plano de contas com L3 duplicadas** — Aluguer de Recinto `4.3.01` vs Locação de Espaço `2.6.05`; Transporte `2.2.03` vs `4.5.02`; mais 7 pares. Se a L3 é a unidade de controlo de verba, uma verba de sala não controla nada enquanto isto não estiver resolvido. **Precede as verbas.**

## Factos que não se reinvestigam

**Regra L2/L3:** o BP planeia verba ao nível **L2**. TX em L3 diferente do mesmo L2 é **uso legítimo**, não violação. TX órfãs são normais e aceitam qualquer L3.

**Gate de L3 — já cumprido na prática (medido 29/08).** Plano de contas MP: 128 L3 de despesa sob 24 L2; 19 L3 de receita sob 5 L2. Único L2 sem filhos: `10.3 Transferências Internas`. BP: **das 705 linhas vivas (4.554.002,42 €), todas as 705 estão a L3**. Transações: 782 a L3, 10 a L2 — todas em `10.3` e sem evento. **O gate validaria uma realidade que já existe**; única regra necessária é excluir o ramo `10`.

**Formalidade — 5 estados, todos em uso:** 408 `estimado`, 88 `negociacao`, 529 `fechado`, 24 `pago_parcial`, 20 `pago_total`.

**Regra de verba enunciada (29/08, por transformar em Issue):** transação que ultrapassa a verba ou não avança, ou **ajusta o BP com confirmação explícita do aprovador** — nunca em silêncio. Com log de quem elevou, quanto e a partir de que transação.

**A1 — achado por abrir (P1).** `event-cost-basis.ts::computeOutsideBpExcess` monta o baseline como `Σ previsto por category_id`, **cego ao ordenador e ao `can_pay`**. Só as linhas de ordenador **pagador** deviam sair do baseline; as de ordenador não-pagador e as da MP têm de lá estar. `ordering-partner.ts` já tem `buildInheritedOrdererMap` e `effectiveTransactionOrderer` — os dois helpers não se conhecem. Testado em Camarins, Transporte e Cenografia: ainda não mordeu.

**A3 — assimetria do overhead (P2).** Linhas `is_overhead` saem do baseline mas as transações não são filtradas do lado do realizado.

**Tipos de evento:** `simple` (30, dos quais 20 filhos de turnê), `multi_day` (6 masters), `festival` (2 + 1 com `format='residencia'`). **A turnê não é um tipo, é uma relação** — o master é `multi_day`, as cidades são `simple` com `parent_event_id`.

## Onde ler mais
- `.lovable/memory/features/bp-vs-real-and-tx-generation-rule.md`, `bp-formalidade.md`, `event-cost-basis.md`
- `.lovable/memory/constraints/master-split-implementation-guardrails.md`
