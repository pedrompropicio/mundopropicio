---
name: Payment lists edit before approval
description: Listas de Pagamento — estados, quem aprova, e edição de itens (incluir/alterar/remover) em listas ainda não aprovadas com registo em revision_notes
type: feature
---

# Listas de Pagamento (`payment_lists` + `payment_list_items`)

## Estados
`draft` → `pending_approval` → `approved` | `partially_approved` | `rejected` | `revision`

- Aprovação (total/parcial) só por **admin**, via `ApproveModal`. Parcial faz DELETE
  dos itens não selecionados e marca `partially_approved`.
- `revision` guarda os comentários do aprovador em `revision_notes`.

## Edição de itens (2026-08)
Regra: uma lista **ainda não aprovada** pode ser editada pelo autor.

- **Estados editáveis**: `draft`, `pending_approval`, `rejected`, `revision`.
  `approved` e `partially_approved` continuam **read-only** (só liquidação/export).
- **Quem**: `created_by === user.email` (criador) **ou** admin. Mais ninguém vê os controlos.
  Flag no código: `canEditItems` em `ViewPaymentList`.
- **Incluir**: botão "Adicionar transações" abre `AddTransactionsToList`, que reutiliza
  `useEligibleTransactionsForList()` — o MESMO critério da criação: `status='approved'`,
  `type='expense'`, reembolsos excluídos, filhos de rateio escondidos excluídos.
  Adicionalmente exclui as transações já presentes nesta lista.
- **Remover**: soft remove reutilizando `removed_at` / `removed_by` / `removed_reason`
  (motivo curto opcional via prompt). O item continua visível marcado "Removida da lista"
  para auditoria e é ignorado nos totais/liquidação. Reversível por "Restaurar".
- **Alterar**: ação "Editar transação" abre o `TransactionEditModal` normal (permissões,
  validações e taxas de IVA por país do evento normais). Ao fechar faz refetch da lista.

## Rasto de alterações após envio
Se a lista está `pending_approval` e é alterada, o estado **mantém-se** `pending_approval`,
mas `appendPaymentListRevisionNote()` appenda uma linha a `revision_notes`:

```
06/08 17:40 pedro@…: +2 transações adicionadas
06/08 17:41 pedro@…: −1 transação removida
```

O detalhe da lista mostra `revision_notes` num painel âmbar (multi-linha) para o aprovador
ver que a lista mudou desde o envio. Em `rejected`/`revision` o detalhe tem também
"Reenviar para aprovação" (preserva o histórico de notas).

## RLS (sem migração necessária)
`payment_list_items`: INSERT/UPDATE já permitidos a `admin`/`manager`/`editor`;
DELETE só admin/manager — por isso a remoção é **soft**, nunca DELETE.
`company_id` tem default `current_company_id()`.
