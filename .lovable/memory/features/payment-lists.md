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

## Liquidação: lista → transação (2026-08, bug corrigido)
Existem **dois** caminhos de liquidação numa lista aprovada, e AMBOS têm de liquidar
a transação. Sem exceções por tipo (reembolsos incluídos):

1. **Em massa ("Liquidar (N)")** — `handleBulkPayment`: `transactions.paid_amount` = total
   c/IVA, `status='paid'`, `payment_date = payment_lists.payment_date` (fallback hoje).
   Propaga a filhos de rateio real (`!event_id && split_mode`), nunca a parcelas.
2. **Manual por item ("marcar como pago")** — `toggleManualMark`: gravava SÓ
   `payment_list_items.manually_marked_paid` e **não tocava na transação** → bug real
   (R-015/R-016 na lista "Pagamentos 29/07/2026": item marcado, tx ficou `approved`
   com `payment_date` NULL, notas presas em "Aguarda Pagamento"). Agora aplica a mesma
   regra do caminho em massa + entrada em `transaction_audit_log`.
   Idempotente: tx já `paid` não é reescrita; **desmarcar o flag NÃO regride** a tx.

Ambos invalidam: `payment-list-items`, `payment-lists`, `transactions`,
`reimbursement-notes`, `approved-payment-list-reminder` + `refreshBadgeFromDB()`.

### Ciclo completo do reembolso
nota aprovada → tx de pagamento entra na lista → lista aprovada → Liquidar **ou**
marcar pago no item → `transactions.status='paid'` + `payment_date` → **trigger na BD**
propaga e a nota passa a **Paga**. A propagação tx→nota é da BD — não replicar no cliente.


## RLS (sem migração necessária)
`payment_list_items`: INSERT/UPDATE já permitidos a `admin`/`manager`/`editor`;
DELETE só admin/manager — por isso a remoção é **soft**, nunca DELETE.
`company_id` tem default `current_company_id()`.

## Totais (2026-08)
Detalhe da lista mostra 3 cards c/IVA calculados no cliente a partir dos itens já
carregados: **Total da lista**, o card do meio conforme o estado da LISTA, e
**Liquidado** (tx `paid`, `manually_marked_paid` ou pago ≥ total −0,05).

Semântica do **Total da lista** = composição ORIGINAL submetida à aprovação:
entram os itens ativos **+** os soft-removidos PELA APROVAÇÃO
(`removed_reason` com prefixo `NOT_APPROVED_REASON_PREFIX`). Itens removidos
manualmente na composição (outros motivos) ficam SEMPRE fora. Garante a identidade
**Total = Aprovado + Liquidado + Não aprovado** ao cêntimo em listas aprovadas; em
`draft`/`pending_approval` não existem itens cortados pela aprovação ⇒ total = ativos.
A coluna **Valor** da listagem usa a mesma regra (query `["payment-lists","totals"]`
lê também `removed_reason`).

Semântica do card do meio — `transactions.status='approved'` é a aprovação do fluxo
de TRANSAÇÕES (todas entram na lista já assim) e NÃO deve ser usada aqui. Vale
`payment_lists.status`:
- `draft`/`pending_approval`/`rejected`/`revision` → **"Aguardando aprovação"** (azul)
  com o valor ativo não liquidado; "Aprovado" seria 0.
- `approved`/`partially_approved` → **"Aprovado"** (âmbar) com o valor ativo não liquidado.

### Cards ao vivo no ApproveModal (2026-08)
O modal de aprovação mostra 3 cards no topo recalculados por `useMemo` sobre os itens
já carregados (sem query nova), a cada clique nas checkboxes: **Total da lista** (todos
os itens em aprovação), **A aprovar** (âmbar, selecionados) e **Não aprovado**
(vermelho, desmarcados = o que será cortado ao confirmar). Aprovação total ⇒ 0.


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

## Comprovativo de pagamento em lote (SEPA) — 2026-08

`payment_list_sepa_exports` guarda cada exportação SEPA (file_name, msg_id,
total, n_transactions, `transaction_ids[]`) no momento do download do XML.
`payment_list_documents` guarda os comprovativos da lista; o ficheiro fica **uma
única vez** em `transaction-documents/<company_id>/payment-lists/<list_id>/`.
As réplicas em `transaction_documents` têm **`is_accounting = false`** (o comprovativo
do banco não é documento fiscal e não mascara o relatório de Pendências Documentais),
mas continuam visíveis nos anexos da transação e na Exportação Contábil (query por
`file_url LIKE '%/payment-lists/%'`, deduplicada, prefixo `comprovativos_`, fora das
contagens fiscais). `payment_list_documents.sepa_export_id` liga o comprovativo ao lote
SEPA; a UI lista as exportações com badge "com/sem comprovativo".
Ao anexar, replica-se em `transaction_documents` uma linha por transação da
exportação escolhida (default a mais recente; fallback = itens ativos), todas com
o mesmo `file_url`. Remover apaga réplicas + registo + ficheiro.
Ver `docs/features/pagamentos-export-sepa-santander.md`.

## Elegibilidade bancária na ENTRADA (2026-08-12)

Regra: uma transação só entra numa lista de pagamento se tiver **dados bancários
resolvíveis**. Resolução ÚNICA em `src/lib/payment-iban.ts`:

- `resolvePaymentIban(tx)`: `transactions.iban_override` → **conta de destino (carga de cartão)**
  → `suppliers.iban` → `iban_2` → `iban_3`.
  (Nos **reembolsos** o `iban_override` já vem da nota — `reimbursement_notes.payment_iban`
  ou IBAN do fornecedor — logo continuam elegíveis como hoje.)

### Cargas de cartão pré-pago (2026-08)
Uma carga é transferência interna real (cat. 10.3, sem fornecedor) e **é elegível**:
o beneficiário é a CONTA DE DESTINO. Modelo:
`transactions.id → card_session_loads.out_transaction_id → card_sessions.card_account_id
→ financial_accounts(name, iban)`.
`enrichCardLoadDestinations()` (`src/lib/card-load-destination.ts`) anexa
`tx.card_load_destination` nas 3 queries (picker Nova Lista, detalhe, ApproveModal);
`resolvePaymentCreditorName()` usa o nome da conta no ficheiro SEPA (sem sufixo de
evento — a carga não tem evento). Sem IBAN no cadastro da conta → badge específico
**"Conta de destino sem IBAN"** (`noIbanBadgeProps`). O trigger
`enforce_payment_list_item_bankable` replica o mesmo LEFT JOIN em SQL.
- `checkPaymentBankability(tx)`: OK se há IBAN **ou** se há `payment_entity`/`payment_reference`
  (pagamentos ao Estado/serviços por Entidade+Referência — pagos no homebanking, fora do SEPA).
- `isBankable(tx)` é usado nos pickers, no ApproveModal e no detalhe; `resolvePaymentIban`
  é o mesmo helper que alimenta `sepaCandidates` ⇒ zero divergência lista ↔ ficheiro.

Superfícies:
1. **Pickers** (Nova Lista e "Adicionar transações"): item inelegível fica **visível mas
   desativado** (checkbox disabled, linha esbatida, badge `NoIbanBadge` "Sem IBAN",
   tooltip `NO_IBAN_TOOLTIP`), contador no topo da secção. `toggleAll` só seleciona
   elegíveis. **Grupo de fatura**: se UM item do grupo não for elegível, o cartão inteiro
   fica desativado (aprovação/seleção de fatura é atómica).
2. **Guard de dados**: trigger `trg_payment_list_items_bankable` (BEFORE INSERT em
   `payment_list_items`, fn `enforce_payment_list_item_bankable`) replica a regra e rejeita
   com "Transação sem IBAN resolvível não pode entrar em lista de pagamento".
   Só valida **INSERT** — soft-remove e updates ficam livres.
3. **Casos herdados** (ex.: "Bombeiros" na lista 11/08 já aprovada): dados intactos.
   Badge "Sem IBAN" no item no detalhe + banner vermelho no **ApproveModal** listando
   "N item(ns) sem dados bancários — ficam fora do ficheiro Santander" com nomes.
   No `SepaExportModal` continuam na secção "Excluídos" (agora com a descrição além do
   beneficiário). Nunca exclusão silenciosa.
