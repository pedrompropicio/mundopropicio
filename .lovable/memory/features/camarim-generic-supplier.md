---
name: Camarim — fornecedor genérico "Diversos — Camarim"
description: Aprovação de item de camarim já não exige fornecedor associado; usa genérico por empresa criado on-demand
type: feature
---

## Decisão (Pedro, 2026-08-07)
Não sujar o cadastro de fornecedores com pequenos estabelecimentos de baixo valor usados
uma vez num evento (lanchonete, posto de combustível, farmácia…). A validação
"Fornecedor é obrigatório para aprovar um item de camarim" foi **removida**.

## Como funciona
- Trigger `validate_camarim_item_approval` (BEFORE INSERT/UPDATE em `camarim_items`),
  quando `status='approved'` e `supplier_id IS NULL`, preenche `supplier_id` com o
  genérico da empresa via `get_or_create_generic_camarim_supplier(company_id)`
  (SECURITY DEFINER).
- O genérico chama-se exatamente **"Diversos — Camarim"**, `category='Camarim'`,
  lookup idempotente por `company_id + lower(btrim(name))` (existe unique index
  `suppliers_company_name_unique`) → nunca duplica em aprovações sucessivas.
  Criado **on-demand**, sem seed por migração.
- Continuam obrigatórios para aprovar: `document_number` e `document_date`
  (salvo `approved_without_document=true` com justificação).
- A integração/fecho (`close-camarim-session`) **não** valida fornecedor; os
  `blockingIssues` da UI só cobrem fundos/caixa.

## Nada se perde
- O item mantém `supplier_name_raw` (nome real lido do talão).
- A transação consolidada nasce com `supplier_id=null` (consolidação por grupo) e leva
  os estabelecimentos na `specification` na linha `Fornecedores: …`.
- UI: nota discreta sob o campo "Estabelecimento / fornecedor" no `CamarimItemModal`.
