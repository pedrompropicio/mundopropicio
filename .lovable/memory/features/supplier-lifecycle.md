---
name: Supplier lifecycle (desativar / reativar / eliminar)
description: Desativar é a ação normal no ecrã de Fornecedores; eliminar passa pelo Lixo e é bloqueado se houver movimento; filtro Ativos/Inativos/Todos
type: feature
---

# Ciclo de vida de fornecedores

Helpers únicos em `src/lib/supplier-lifecycle.ts` (usados por `Suppliers.tsx` e `SupplierFormModal.tsx`).

## Desativar (ação normal)
- `is_active = false` + linha datada nas notas: `[YYYY-MM-DD] Desativado por <email>.`
- Só admin / platform_admin / manager (mesmo critério da reativação no `SupplierFormModal`).
- Fornecedor inativo sai dos seletores (`suppliers-active`); histórico intacto.

## Reativar
- Botão no ecrã de Fornecedores e no `SupplierFormModal` (via IBAN duplicado inativo). Mesma função `reactivateSupplier`.

## Eliminar
- NUNCA `.delete()` cru. `fetchSupplierUsage` conta movimento em transactions, quotations, recurring_transactions, operacao_etapa_suppliers, event_settlement_participants e event_third_party_operations (`held_by_supplier_id`).
- Com movimento: eliminação recusada em texto legível, com o botão "Desativar" na própria mensagem. O erro de FK nunca chega ao utilizador.
- Sem movimento: diálogo lista as contagens reais da cascata (supplier_documents, event_partners, supplier_credits, coala_supplier_category_map), grava em `trash` (entity_type `supplier`, cascata em `related_data`) e só depois apaga. Restauro pelo Lixo durante 30 dias.

## Filtro
Ecrã de Fornecedores: Ativos (por defeito) / Inativos / Todos + badge "Inativo" na linha e no cartão.

## Fornecedor parecido ao criar (D-ERP199)
`SupplierFormModal` (só criação) chama `check_supplier_similar` depois das validações de IBAN. Candidatos: Usar / Acrescentar IBAN (1.º slot livre, audit update_bank_details) / Criar mesmo assim. NIF igual a ativo bloqueia criar. Espelho TS da normalização em `src/lib/supplier-similarity.ts` (testes).
