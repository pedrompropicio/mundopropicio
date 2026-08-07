---
name: Payment lists edit before approval
description: Listas de Pagamento — estados, quem aprova, e edição de itens (incluir/alterar/remover) em listas ainda não aprovadas com registo em revision_notes
type: feature
---

# Listas de Pagamento (`payment_lists` + `payment_list_items`)

## Estados
`draft` → `pending_approval` → `approved` | `partially_approved` | `rejected` | `revision`

- Aprovação (total/parcial) só por **admin**, via `ApproveModal`. Parcial faz soft-remove
  dos itens não selecionados (removed_reason "Não aprovado na aprovação de …") e marca `partially_approved`.
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
- **Alterar**: ação "Editar transação" **só para admin** (abre o `TransactionEditModal` normal,
  com as regras habituais de campos bloqueados pós-aprovação/liquidação — sem bypass).
  O editor/criador não-admin **compõe** a lista (incluir/excluir/restaurar) mas nunca edita
  a transação em si, porque transações aprovadas têm campos (ex.: valor) bloqueados para ele.
  Ao fechar faz refetch da lista.


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

## Totais (2026-08)
Detalhe da lista mostra 3 cards c/IVA calculados no cliente a partir dos itens já
carregados (ignora `removed_at`): **Total da lista**, o card do meio conforme o
estado da LISTA, e **Liquidado** (tx `paid`, `manually_marked_paid` ou pago ≥ total −0,05).

Semântica do card do meio — `transactions.status='approved'` é a aprovação do fluxo
de TRANSAÇÕES (todas entram na lista já assim) e NÃO deve ser usada aqui. Vale
`payment_lists.status`:
- `draft`/`pending_approval`/`rejected`/`revision` → **"Aguardando aprovação"** (azul)
  com o valor ativo não liquidado; "Aprovado" seria 0.
- `approved`/`partially_approved` → **"Aprovado"** (âmbar) com o valor ativo não liquidado.

### Aprovação parcial = soft-remove (2026-08, substitui o DELETE anterior)
`ApproveModal` NÃO apaga os itens não selecionados: faz **soft-remove** com
`removed_at=now`, `removed_by=aprovador` e
`removed_reason = "Não aprovado na aprovação de DD/MM/AAAA"`
(constante `NOT_APPROVED_REASON_PREFIX`). A lista fica `partially_approved`.
Consequências:
- Itens ativos numa lista aprovada = exatamente os aprovados (totais inalterados).
- No detalhe aparecem riscados/esbatidos com o motivo; **sem botão "Restaurar"** em
  `approved`/`partially_approved` (composição read-only) — relançar noutra lista.
- 4º card **"Não aprovado"** (vermelho) só em listas aprovadas e quando > 0: soma dos
  itens cujo `removed_reason` começa pelo prefixo acima.
- `ApproveModal` só carrega itens com `removed_at IS NULL`.
- Elegibilidade: `useEligibleTransactionsForList()` não filtra por pertença a listas, e
  as transações não aprovadas continuam `status='approved'` ⇒ voltam a aparecer no picker.


Listagem tem coluna **Valor** (total da lista, não muda com o estado) alimentada por uma
única query agregada `["payment-lists","totals"]` (prefixo partilhado ⇒ invalida com
`["payment-lists"]`).
