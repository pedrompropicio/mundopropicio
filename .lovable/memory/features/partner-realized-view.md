---
name: Partner Realizados do Evento
description: RPC get_partner_bp_realized expõe realizado por rubrica L3 a qualquer sócio com acesso ao evento; permissão view_partner_realized controla apenas a vista comparativa e a linha "Realizado (%)" no card Despesas
type: feature
---

## Dois níveis de acesso (decisão do Pedro, 2026-07-15)

- **`canSeeAdjusted` — QUALQUER sócio com acesso ao BP** (não requer permissão).
  Vê o "BP ajustado à realidade": colunas Rubrica | Valor | Previsto | Formalidade sempre presentes; rubricas L3 ultrapassadas têm Valor=realizado destacado a âmbar + Previsto original ao lado; excessos propagam a subtotais L2/L1/TOTAL/card Despesas/Resultado; nota "inclui N rubrica(s) ajustada(s)" no card.
- **`canSeeComparative` — permissão `view_partner_realized`**.
  Ativa em cima do anterior: seletor "BP | BP × Realizado" na aba BP, vista comparativa L1/L2/L3 (Previsto | Realizado | Diferença) e linha "Previsto c/IVA · Realizado X € (Y%)" no card Despesas. Também usa `mode="comparison"` + `pseudoTransactions` nos exports.

## Permissão `view_partner_realized`
- Grupo Geral, em `ALL_PERMISSIONS`.
- **Sem default** em `role_permissions` — ativada só por override no `UserPermissionsModal`.
- Já **NÃO** é exigida pela RPC; é usada apenas no frontend para a vista comparativa e a linha de % no card.

## RPC `public.get_partner_bp_realized(p_event_id uuid)`
- SECURITY DEFINER, STABLE, `search_path=public`, grant a `authenticated`.
- Autoriza: `auth.uid()` presente **+** `partner_event_access` (direto ou via `parent_event_id`). **Não verifica** `has_permission('view_partner_realized')` (mudança 2026-07-15) — o gate ficou só no frontend.
- Cálculo espelha ReportPL staff em modo comparação: UNION entre transações vinculadas diretamente ao forecast (`event_forecasts.transaction_id`) e transações que casam por `category_id` no mesmo evento (memoria core `bp-installments`). Agrega por L3.
- Devolve JSONB array `{l3_category_id, l3_code, l3_name, l2_code, l2_name, l1_code, l1_name, real_base, real_iva, real_total}`. Overhead entra nos totais mas nunca aparece flagged.
- **Não devolve** transaction_id, supplier, description, data — apenas agregados por L3.

## UI (`src/pages/PartnerEventDetail.tsx`)
- Query `partner_bp_realized` corre para qualquer sócio (`enabled: canSeeAdjusted`).
- Aba BP: grelha fixa Rubrica | Valor | Previsto | Formalidade. Coluna Previsto preenchida só em rubricas L3 ajustadas (e na linha BP única correspondente); subtotais e TOTAL têm sempre Previsto vazio.
- Seletor "BP | BP × Realizado" e vista comparativa: só com `canSeeComparative`.
- Linha TOTAL da vista comparativa bate ao cêntimo com o card Despesas.

## Exportação Excel/PDF
- Com `canSeeComparative`: `mode="comparison"` + shim `pseudoTransactions` (1 linha por L3 com base+iva reconstruído a partir da RPC). Alimenta as colunas Real s/IVA e Variação sem revelar transações reais.
- Sem `canSeeComparative`: `mode="forecast"`, sem pseudoTransactions.
