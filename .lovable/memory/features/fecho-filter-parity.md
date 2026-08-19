---
name: Fecho do Evento ↔ Fecho com Parceiros (paridade de filtros)
description: As duas vistas de fecho usam EXATAMENTE o mesmo universo de transações para evitar divergência de números. Filtros canónicos.
type: constraint
---

# Filtros canónicos de transações em qualquer vista de Fecho

Sempre que uma vista mostre "resultado do evento" comparável ao acerto com sócios, a query de transações TEM que aplicar exatamente (helper canónico: `src/lib/fecho-filters.ts` → `isValidFechoTransaction`):

```ts
.in("event_id", allEventIds)
.in("status", ["approved", "paid"])
// + filtro client-side:
.filter(t => !t.is_transitory && !t.exclude_from_result
             && t.reversed_at == null && t.is_hidden !== true)
```

## Why
- `pending` / `draft` / `refused` ainda não são realidade contabilística
- `is_transitory = true` → cauções, devoluções, extras de sócio em trânsito (não impactam DRE)
- `exclude_from_result = true` → linhas marcadas explicitamente para fora do resultado
- `reversed_at IS NOT NULL` → transação estornada (ex.: `reversal_kind='cash_refund'`); o dinheiro voltou
- `is_hidden = true` → linhas mascaradas na UI, mantidas só para fiscal

Este é o MESMO universo do RPC `get_partner_bp_realized` (portal do sócio). Divergir = staff e sócio verem números diferentes (bug real: Anitta EDA 2026, 4 "Diárias/Per Diem" estornadas = 3.273,33 € a inflacionar a despesa; despesa passou de 565.265,73 para 561.992,40).

## Receita: bilheteira NUNCA é somada duas vezes
A receita do Fecho é **aditiva**: `ticket_sales + Σ(transações de receita)`. Mas quando o evento
tem `ticket_sales`, as transações de receita da rubrica **`1.1.01 Bilheteira`** (e descendentes)
são o MESMO dinheiro registado no ERP → têm de ser **excluídas do somatório**.
- Exclusão sempre por **rubrica** (`account_categories.code`), nunca por heurística na descrição.
- Helper: `isTicketingRevenueTx()` em `src/lib/fecho-filters.ts`.
- Bug real (Coala PT 2026): `ticket_sales` 1.264.120,00 c/IVA e 2 transações 1.1.01 de
  1.192.566,04 base (= 1.264.120,00 ÷ 1,06). Somar às cegas duplicava 1,19 M€.
- Valores de referência (ao cêntimo): Anitta EDA 2026 → 2.409.292,64 s/IVA;
  Coala PT 2026 → 1.690.563,50 s/IVA.

## Componentes que devem partilhar este filtro
- `src/components/PartnerSettlementTab.tsx` (referência — Fecho com Parceiros)
- `src/components/EventFecho.tsx` (Fecho do Evento — alinhado em 2026-04)
- Qualquer DRE / Acerto / Síntese futura

## Antipattern detectado (Mágicos Henry&Klaus, abril 2026)
EventFecho mostrava resultado 81 458,06 € enquanto PartnerSettlementTab mostrava ~129 712 €. Causa: 7 despesas pending (48 254,24 €) entravam só no EventFecho. Resolução: alinhar query.

## Quebra por Cidade no PDF tem que incluir linha "Master / Geral"
Em turnês, a tabela "2. Quebra por Cidade" do PDF tem que incluir uma linha extra para
transações lançadas diretamente no Master (`event_id === eventId` da turnê). Caso contrário,
a soma das cidades fica menor que o "1. Resumo Financeiro" — o utilizador vai notar.
Implementação em `PartnerSettlementTab.tsx → cityBreakdown`: além dos sub-eventos, agregar
`validTx.filter(t => t.event_id === eventId)` numa linha "Master / Geral" (só renderiza se
houver receita ou despesa). A linha aparece junto às cidades e o TOTAL bate com o resumo.

## Numeração das secções do PDF Fecho com Parceiros (abril 2026)
Página 1: 1) Resumo, 2) Quebra por Cidade, 3) Distribuição. Página 2: 4) Detalhes por Sócio.
Página 3+: 5) Bilheteira – Totais Vendidos, 6) Fecho de Bilheteiras / Recintos, 7) Despesas
por Categoria. Mover "Detalhes por Sócio" para página dedicada deixa o resumo da página 1
limpo e dá espaço aos extras/pagas/transitórias de cada sócio.
