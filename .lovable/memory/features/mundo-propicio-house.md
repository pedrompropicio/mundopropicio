---
name: Mundo Propício como sócia automática
description: A Mundo Propício (empresa realizadora/gestora dos eventos) é injetada automaticamente nos relatórios de fecho/DRE com % = 100 − Σ(sócios externos), sem precisar de cadastro em event_partners
type: feature
---

# Mundo Propício (Empresa Gestora)

**Conceito**: a Mundo Propício é a empresa realizadora/gestora de todos os eventos da plataforma. Por defeito é sócia de 100% de cada evento. Quando se cadastram sócios externos em `event_partners`, a sua quota passa a ser `100 − Σ(externos)`. NÃO é uma "casa/sala/venue" — é a empresa que gere o negócio.

## Implementação
- `src/lib/house-partner.ts`: helper `computeHousePercentage`, constantes `HOUSE_PARTNER_ID` e `HOUSE_PARTNER_NAME`
- A Mundo Propício NÃO é cadastrada em `event_partners` — é uma linha virtual injetada na UI/PDF/relatórios
- Sentinela de id: `__house_mundo_propicio__`
- Não acumula `partner_paid_expenses` nem `partner_advance_expenses` (a empresa paga tudo)

## Onde aparece
- `PartnerSettlementTab` (encontro de contas no evento) — card próprio com ícone `UserCheck` (igual aos outros sócios, sem badge "Casa")
- `ReportPartnerSettlement` (visão consolidada cross-events) — linha por evento
- `ReportDRE` / `ReportDREBrasil` — renderizada como sócio na "Distribuição de Resultados" com `isDistribution: true` (mesma fonte/corpo/cor amber dos restantes), label `Mundo Propício (X%)`

## PDFs
- `export-dre.ts`: linha "Mundo Propício (X%)" formatada igual aos outros sócios (italic, fontSize 8, fundo azul claro). NÃO usa caixa "RESULTADO MP GESTÃO EVENTOS" destacada.
- Mantém-se "MP Gestão Eventos" nos rodapés institucionais de PDFs (cabeçalho da empresa).

## PDF de Fecho enriquecido
8 secções: Resumo Financeiro, Quebra por Cidade, Bilheteira detalhada, Fecho de Bilheteiras, Despesas por Categoria, BP × Real, Distribuição aos Sócios (com Mundo Propício), Detalhe por Sócio.
