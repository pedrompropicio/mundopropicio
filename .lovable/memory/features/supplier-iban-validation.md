---
name: Supplier IBAN validation
description: Bloqueio duro de IBAN duplicado cross-supplier dentro da mesma company_id + validação estrutural MOD-97 + página /admin/iban-duplicados
type: feature
---

# Validação de IBAN em fornecedores

## Regras
- IBAN é opcional (NIF também). Não bloqueia se vazio.
- Bloqueio DURO no submit do `SupplierFormModal` se algum dos 3 IBANs (iban, iban_2, iban_3):
  1. Não passa checksum MOD-97 (via `ibantools.isValidIBAN`).
  2. Já existe noutro fornecedor da MESMA `company_id` (em qualquer dos 3 slots).
- Cross-company é permitido (isolamento por tenant). Edição mantém próprio IBAN OK (RPC exclui `p_supplier_id`).
- Normalização sempre: `upper(replace(iban, ' ', ''))`. Aplicada também no INSERT/UPDATE.

## RPC
`public.check_supplier_iban_duplicate(p_iban text, p_supplier_id uuid DEFAULT NULL) RETURNS jsonb`
- SECURITY INVOKER, STABLE, `search_path = public`.
- Compara nos 3 slots (iban/iban_2/iban_3) dentro de `current_company_id()`.
- Retorna `{exists:false}` ou `{exists:true, supplier_id, supplier_name, nif}`.

## Decisão de schema
NÃO foi criado UNIQUE constraint na tabela `suppliers` porque já existem duplicados legados em Live (quebraria a migration). Bloqueio é garantido em runtime (RPC + UI). Auditoria retroativa expõe os legados para correção manual.

## Página de auditoria
`/admin/iban-duplicados` (admin/platform_admin/manager). Lista grupos de IBAN normalizado partilhados por >1 fornecedor na empresa ativa, com nome + NIF e botão "Abrir fornecedor" que abre o `SupplierFormModal`. Card no `AdminPanel.tsx`.

## Fora do escopo
- Outras tabelas com IBAN (`financial_accounts`, etc.) — não validadas cross-supplier nesta fase.
- NIF não passa a obrigatório.
