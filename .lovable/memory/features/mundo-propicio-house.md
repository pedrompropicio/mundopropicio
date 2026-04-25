---
name: Mundo Propício como sócia automática
description: A Mundo Propício (empresa de entretenimento, realizadora e gestora de eventos e turnês de artistas internacionais) é injetada automaticamente nos relatórios de fecho/DRE com % = 100 − Σ(sócios externos), sem precisar de cadastro em event_partners
type: feature
---

# Mundo Propício (Empresa Gestora)

**Conceito**: a Mundo Propício é uma **empresa de entretenimento** que realiza e gere eventos e turnês de artistas internacionais. É a **sócia principal** de todos os eventos no sistema. Por defeito é sócia de 100%; quando se cadastram sócios externos (sócios secundários) em `event_partners`, a sua quota passa a ser `100 − Σ(secundários)`.

**NÃO usar terminologia de "casa", "sala", "venue", "retém" ou "absorve"** — a Mundo Propício não é um espaço físico nem uma casa de espetáculos; é a empresa produtora/gestora. É a sócia principal do projeto, ponto.

## Implementação
- `src/lib/house-partner.ts`: helper `computeHousePercentage`, constantes `HOUSE_PARTNER_ID` e `HOUSE_PARTNER_NAME` (nome do ficheiro mantido por compatibilidade histórica — não reflete a natureza do negócio)
- A Mundo Propício NÃO é cadastrada em `event_partners` — é uma linha virtual injetada na UI/PDF/relatórios
- Sentinela de id: `__house_mundo_propicio__` (mantido por compatibilidade)
- Não acumula `partner_paid_expenses` nem `partner_advance_expenses` (a empresa paga tudo)

## Onde aparece
- `PartnerSettlementTab` (encontro de contas no evento) — card próprio com ícone `UserCheck` (igual aos outros sócios, sem badge especial)
- `ReportPartnerSettlement` (visão consolidada cross-events) — linha por evento
- `ReportDRE` / `ReportDREBrasil` — renderizada como sócio na "Distribuição de Resultados" com `isDistribution: true` (mesma fonte/corpo/cor amber dos restantes), label `Mundo Propício (X%)`

## PDFs
- `export-dre.ts`: linha "Mundo Propício (X%)" formatada igual aos outros sócios (italic, fontSize 8, fundo azul claro). NÃO usa caixa "RESULTADO MP GESTÃO EVENTOS" destacada.
- Mantém-se "MP Gestão Eventos" nos rodapés institucionais de PDFs (cabeçalho da empresa).

## PDF de Fecho enriquecido
8 secções: Resumo Financeiro, Quebra por Cidade, Bilheteira detalhada, Fecho de Bilheteiras, Despesas por Categoria, BP × Real, Distribuição aos Sócios (com Mundo Propício), Detalhe por Sócio.
