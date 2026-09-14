# Diagnóstico: /transacoes sem transações — ligação ambígua a fornecedores

## Causa encontrada (reproduzida no preview, com sessão autenticada)

O pedido da lista devolve **HTTP 300** (não 200 nem 4xx). Corpo tal e qual:

```json
{"code":"PGRST201","details":[{"cardinality":"many-to-one","embedding":"transactions with suppliers","relationship":"transactions_held_by_supplier_id_fkey using transactions(held_by_supplier_id) and suppliers(id)"},{"cardinality":"many-to-one","embedding":"transactions with suppliers","relationship":"transactions_supplier_id_fkey using transactions(supplier_id) and suppliers(id)"}],"hint":"Try changing 'suppliers' to one of the following: 'suppliers!transactions_held_by_supplier_id_fkey', 'suppliers!transactions_supplier_id_fkey'. Find the desired relationship in the 'details' key.","message":"Could not embed because more than one relationship was found for 'transactions' and 'suppliers'"}
```

Origem: a migração `20260913051421_...` (trabalho g5, "receitas em poder do sócio") acrescentou
`transactions.held_by_supplier_id` com chave estrangeira para `suppliers`. Passaram a existir
DUAS ligações entre `transactions` e `suppliers`, e qualquer consulta que peça
`suppliers(name)` a partir de `transactions` sem indicar qual delas é recusada. Não é
permissão, não é papel, não é a chave, não é RLS — é a forma da consulta.

## Respostas ponto por ponto

1. Estado HTTP: **300**, corpo acima (o mesmo em todos os blocos do `.range()`).
2. Sem excepção JavaScript relevante; só avisos de `forwardRef` do React, pré-existentes.
   A lista fica vazia porque o pedido nunca devolve linhas (erro tratado pela query).
3. O **primeiro bloco já falha** com 300 — nenhum bloco devolve linhas.
4. `/contas` e `/bilheteiras` carregam bem na mesma sessão (contas: 19 activas, saldo
   552.269,17 €). É específico das consultas que embutem fornecedores em transações,
   não é global à aplicação.
5. `src/integrations/supabase/client.ts` usa `VITE_SUPABASE_PUBLISHABLE_KEY` do `.env`:
   formato legacy JWT, **três segmentos**. Continua a ser aceite — todos os outros
   pedidos devolveram 200/201 com ela. Não é a causa.
6. Dos 13 commits de ontem, nenhum tocou em `Transactions.tsx`, `TransactionRow.tsx`,
   `supabase-paging.ts`, `client.ts`, `AuthContext.tsx` nem em políticas de `transactions`.
   O que rompeu foi a migração da manhã de 13/09 que criou a segunda chave estrangeira.

## Correcção proposta (só após aprovação)

1. Desambiguar o embed em todas as consultas sobre `transactions`:
   `suppliers(name)` passa a `suppliers!transactions_supplier_id_fkey(name)`
   (mantendo o mesmo nome de propriedade no resultado, com alias
   `suppliers:suppliers!transactions_supplier_id_fkey(...)` onde o código lê `row.suppliers`).
   Começar por `src/pages/Transactions.tsx` e depois varrer os restantes ecrãs e
   relatórios que leem transações (bancária, aging, exportação contabilística,
   pendências, listas de pagamento, fecho, conciliação, camarim, auditoria de bilheteira),
   incluindo os casos aninhados `transactions(... suppliers(...) ...)`.
2. Varredura final com `rg` para garantir que não sobra nenhum embed ambíguo
   de `suppliers` a partir de `transactions`.
3. Verificação: `bunx tsgo`, testes, e reabrir `/transacoes` autenticado no preview
   confirmando 200 e as 1.081 linhas (156 em aberto / 925 liquidadas).

Sem DDL, sem DML, sem Publish.
