---
name: Event revenue basis (SSoT)
description: Função única da receita do evento em 3 bases (real / previsto corrente / previsto + excedido) com decomposição por bucket
type: feature
---

`src/lib/event-revenue-basis.ts` (+ hook `src/hooks/useEventRevenueBasis.ts`) é a ÚNICA
fonte da receita de um evento ou Master+Splits — DR-2026-09-06-D24.

- `real` — `ticket_sales` linha a linha (D11) + TX `income` pelo filtro canónico do
  Fecho (`isValidFechoTransaction`). Anti-duplicação por PREFIXO `1.1.01`
  (`isBilheteiraCategoryCode`) quando há `ticket_sales`. **Sem `partially_paid`.**
- `currentForecast` — bilheteira `computeLiveTicketForecast` (D21 ad.2), A&B cenário
  forecast (injectado pelo hook), patrocínios `computeSponsorshipSynthetic` (D22),
  outras receitas = BP income da versão activa não coberto por sintéticas.
  `null` por componente sem base.
  **#220:** o descarte das classes com módulo é CONDICIONAL — a sintética
  substitui a linha de BP e nunca soma; sem sintética (bilheteira sem forecast do
  Simulador e sem `ticket_sales`; A&B sem cenário), as linhas de BP dessa classe
  alimentam o componente, com os mesmos filtros do loop e IVA linha a linha.
  **#225:** a mesma regra fechada para o terceiro bucket — patrocínios sem
  verbas nem cards (`sponsorship` EMPTY) alimentam o bucket via linhas 1.2.x
  aprovadas (`bpPatrocinio`); a sintética substitui, nunca soma.
- `committed` — por componente `max(real, currentForecast ?? real)` (espelha o custo).

Realizado devolve `{net, gross}` por bucket (Bilheteira / A&B / Patrocínio / Outros);
o previsto é sempre s/IVA. Consumidores: `useEventFinancialCardData`, `EventFecho`,
`EventDetail`, `computeTicketSynthetic`. Nunca recriar cálculo local de receita.

## Perímetro da raiz (g3, #146)

Antes de somar, a receita passa por `keepRootPerimeter` (`src/lib/settlement-perimeter.ts`):
transações e linhas de BP marcadas com um fechamento que NÃO é a raiz do evento
são exclusivas desse fechamento e ficam FORA da receita, custo e lucro do evento
(card, Resumo, Fecho, DRE de evento, Portal do Sócio). As raízes vêm de
`useEventRootSettlements`. **DRE Empresarial e DRE Brasil são vistas de empresa e
mantêm essas linhas.**

**(g3+) Lucro nunca usa receita prevista.** `useEventFinancialCardData` devolve
`realValue` (receita real do perímetro da raiz na base de IVA do card) e o
`EventFinancialCard` propaga esse valor ao card Lucro/margem, mesmo em "Previsto +
excedido"; nota discreta "real: X" quando divergem. Garante Lucro do evento =
resultado do fechamento raiz no Encontro de Contas.

## Depois do evento, as sintéticas são o real (#227, D-ERP114)

`RevenueBasisRows.eventRealized` (helper puro `isEventRealized` em
`src/lib/event-realized.ts`: `status='completed'` OU última data — própria ou do
sub-evento mais tardio — já passada, por dia e em data local) anula
`ticketForecast` e `abForecastNet` ANTES de decidir as sintéticas. Efeito: com
`ticket_sales`, bilheteira fica no real (`committed = max(real, real)`); sem
`ticket_sales`, o BP alimenta como em #220/#225. Patrocínios não mudam (D22).
`computeEventRevenueBasis` calcula a flag (`fetchEventRealized`) quando não lhe é
dada e, quando realizado, nem corre `computeLiveTicketForecast`.
`computeTicketSynthetic` e a linha A&B de `useBPIncomeSynthetic` seguem a mesma
regra no previsto CORRENTE; o previsto ORIGINAL não muda. A grelha
`events-list-financials.ts` não precisa da flag (nunca corre simulador/cenários).
