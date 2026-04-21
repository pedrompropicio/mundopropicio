---
name: Mundo Propício como sócia automática
description: A casa (Mundo Propício) é injetada automaticamente nos relatórios de fecho/DRE com % = 100 − Σ(sócios externos), sem precisar de cadastro em event_partners
type: feature
---

# Mundo Propício (Casa)

**Conceito**: a empresa usuária da plataforma (Mundo Propício / MP Gestão Eventos) é por defeito sócia de 100% de todos os eventos. Quando se cadastram sócios externos em `event_partners`, a quota da casa passa a ser `100 − Σ(externos)`.

## Implementação
- `src/lib/house-partner.ts`: helper `computeHousePercentage`, constantes `HOUSE_PARTNER_ID` e `HOUSE_PARTNER_NAME`
- A casa NÃO é cadastrada em `event_partners` — é uma linha virtual injetada na UI/PDF/relatórios
- Sentinela de id: `__house_mundo_propicio__`
- Não acumula `partner_paid_expenses` nem `partner_advance_expenses` (a casa paga tudo)

## Onde aparece
- `PartnerSettlementTab` (encontro de contas no evento) — card próprio com badge "Casa" e ícone `Building2`
- `ReportPartnerSettlement` (visão consolidada cross-events) — linha por evento
- `ReportDRE` / `ReportDREBrasil` — linha "RESULTADO MUNDO PROPÍCIO" no rodapé do bloco de distribuição

## Renames aplicados (terminologia)
"MP Gestão Eventos" → "Mundo Propício" nos contextos de cálculo de participação:
- ReportDRE / ReportDREBrasil ("RESULTADO MUNDO PROPÍCIO")
- EventPartnersTab ("Mundo Propício retém X% do resultado")
- EventForecast (selector de filtro: "Empresa (Mundo Propício)")
- help-manual.ts

Mantém-se "MP Gestão Eventos" nos rodapés institucionais de PDFs (cabeçalho da empresa).

## PDF de Fecho enriquecido
8 secções: Resumo Financeiro, Quebra por Cidade, Bilheteira detalhada, Fecho de Bilheteiras, Despesas por Categoria, BP × Real, Distribuição aos Sócios (com casa), Detalhe por Sócio.
