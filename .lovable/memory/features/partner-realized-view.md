---
name: Partner Realizados do Evento
description: Permissão custom view_partner_realized + RPC get_partner_bp_realized expõem realizado por rubrica L3 no portal do sócio sem enviar transações individuais
type: feature
---

## Permissão
- `view_partner_realized` (grupo Geral, ao lado de `view_bp`) em `ALL_PERMISSIONS`.
- **Sem default** em `role_permissions` — ativada só por override no `UserPermissionsModal`.

## RPC `public.get_partner_bp_realized(p_event_id uuid)`
- SECURITY DEFINER, STABLE, `search_path=public`, grant a `authenticated`.
- Valida `auth.uid()`, acesso via `partner_event_access` (direto ou via `parent_event_id`), e `has_permission(uid, 'view_partner_realized')`.
- Cálculo espelha ReportPL staff em modo comparação: UNION entre transações vinculadas diretamente ao forecast (`event_forecasts.transaction_id`) e transações que casam por `category_id` no mesmo evento (memoria core `bp-installments`). Agrega por L3.
- Devolve JSONB array `{l3_category_id, l3_code, l3_name, l2_code, l2_name, l1_code, l1_name, real_base, real_iva, real_total}`. Overhead entra nos totais mas nunca aparece flagged.
- **Não devolve** transaction_id, supplier, description, data, nada individual.

## UI (`src/pages/PartnerEventDetail.tsx`)
- Query `partner_bp_realized` só corre com a permissão ligada.
- Com permissão, a aba BP tem seletor "BP | BP × Realizado":
  - **Vista "BP"**: previsão + formalidade, hierarquia completa L1 > L2 > L3 > lançamentos.
  - **Vista "BP × Realizado"**: hierarquia L1 > L2 > L3 com colunas Previsto | Realizado | Diferença (c/IVA, verde/vermelho). Usa os agregados por L3 da RPC. Não mostra lançamentos individuais nem coluna Formalidade.
- Linha TOTAL da vista comparação bate ao cêntimo com o card Despesas (`bpTotalExpense` vs `bpTotalRealizedExpense`).

## Exportação Excel/PDF
- Com permissão: `mode="comparison"` + shim `pseudoTransactions` (1 linha por L3 com base+iva reconstruído a partir da RPC). Alimenta as colunas Real s/IVA e Variação do exportPLToExcel/PDF sem revelar transações reais.
- Sem permissão: idêntico ao modo forecast atual.
