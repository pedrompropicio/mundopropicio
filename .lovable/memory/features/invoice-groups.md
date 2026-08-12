---
name: Invoice groups (fatura única → N itens do BP)
description: Elo entre deteção por ATCUD/nº fatura e o grupo formal invoice_group_id — agrupar manual, auto-agrupar, aviso de grupo parcial na Lista de Pagamento
type: feature
---

# Fatura única → N transações → grupo → transferência única

## Porquê
Uma fatura de fornecedor cobre várias rubricas do BP ⇒ criamos **1 transação por rubrica**
(cada uma com a sua `category_id` e, se aplicável, a sua taxa de IVA). Ao pagar, o banco
recebe **uma única transferência** pelo total c/IVA da fatura.

## Duas camadas (antes desligadas — o bug)
1. **Deteção (visual, runtime)**: `TransactionRow.tsx` procura irmãs com o MESMO
   `invoice_ref` + MESMO `supplier_id` e mostra o badge `📎 <ref> (N) — <total c/IVA>`.
   Não escreve nada na BD.
2. **Grupo formal**: `transactions.invoice_group_id` (UUID). É a chave canónica usada
   pela Lista de Pagamento, SEPA e pelas propagações multi-IVA
   (ver `mem://features/invoice-group-multi-iva.md`).

Até 2026-08 o `invoice_group_id` só nascia nos fluxos de split (multi-IVA / extra do sócio).
Faturas inseridas linha a linha mostravam o badge mas ficavam `invoice_group_id = NULL`
⇒ a Lista de Pagamento não as juntava (caso real: 5 tx da LILIAM SALES PEREIRA MIRANDA,
`ATCUD: J6V26KF9-692`, base 2.371,60 € / c/IVA 2.917,07 €).

## Como fecha o elo
`src/lib/invoice-group.ts`
- `normalizeInvoiceRef`, `isGroupableInvoiceRef` — **regra conservadora**: precisa de ≥4
  chars, ≥1 dígito e **nunca** agrupa proformas (`PROFORMA`, `PRO-FORMA`, `PRÓ-FORMA`),
  que não são documento definitivo.
- `fetchInvoiceSiblings(supplierId, invoiceRef)` — irmãs do MESMO fornecedor.
- `ensureInvoiceGroup(...)` — cria/reutiliza o UUID e escreve nas N transações.
  **Nunca agrupa fornecedores diferentes**; se já existirem 2+ grupos distintos na mesma
  fatura, considera ambíguo e não mexe.
- `autoGroupInvoiceForTransaction(txId)` — auto-agrupamento a partir de uma transação.

Superfícies:
- **Ação manual** `src/components/InvoiceGroupAction.tsx` — botão "Agrupar fatura" com
  diálogo de confirmação (lista das N + soma das bases + total c/IVA para conferir contra
  o documento). Aparece na **listagem** (`TransactionRow.tsx`, ao lado do badge, só quando
  há N>1 sem grupo) e no **detalhe** (`TransactionEditModal.tsx`, sob o campo Nº Fatura).
- **Auto-agrupar** ao criar (`TransactionFormModal.tsx`, `onSuccess`) e ao guardar
  (`TransactionEditModal.tsx`, após o update) — toast "Agrupada à fatura X (n itens)".

## Lista de Pagamento
`groupPaymentItems` (`src/lib/export-payment-list.ts`) passa a usar
`grp::<invoice_group_id>` como chave; o par `supplier_id::invoice_ref` fica só como
**fallback legado**. Cada grupo rende um único "📎 Fatura Agrupada — <total> a transferir"
(mesmo bloco alimenta WhatsApp, Excel/PDF e SEPA).

**Grupo parcial (avisa, não bloqueia)**: `PaymentListsTab.tsx` conta os itens reais do
grupo na BD (query `["invoice-group-counts", …]`) e, se a lista só tiver M de N, mostra
faixa âmbar "⚠️ Fatura X tem N itens; só M nesta lista.".

## Backfill 2026-08
UPDATE único agrupou todos os casos inequívocos (mesmo fornecedor + mesmo nº com dígitos,
excluindo proformas), incluindo as 5 da Liliam (grupo `99f43967-…`) e o maior caso,
`FA 5A2603/526` com 13 itens. Para re-auditar:

```sql
SELECT supplier_id, invoice_ref, count(*) FROM public.transactions
WHERE invoice_group_id IS NULL AND supplier_id IS NOT NULL
  AND invoice_ref IS NOT NULL AND btrim(invoice_ref) <> ''
GROUP BY 1,2 HAVING count(*) > 1;
```
Linhas devolvidas devem ser só proformas / referências genéricas.

## Badge de progresso de liquidação (2026-08)
`src/hooks/useInvoiceGroupProgress.ts` — UMA query agregada
`.in("invoice_group_id", ids)` (id, status, paid_amount, amount, iva_rate) devolve por
grupo `{ total, paidCount, openWithIva }`. Necessária porque os pickers só listam
pendentes: o estado consolidado da fatura tem de vir da BD.

Regra de liquidado (a mesma do módulo de listas): `status='paid'` **ou**
`paid_amount >= total c/IVA − 0,05`. `manually_marked_paid` já liquida a transação
(ver payment-lists), pelo que não é preciso duplicar a regra.

`InvoiceGroupProgressBadge` (em `PaymentListsTab.tsx`):
- 0 pagos → badge neutro "N itens" (comportamento anterior).
- Parcial → âmbar "X/N pagos" + "em aberto: Y €" (soma c/IVA dos não liquidados).
- Tudo pago → verde "N/N pagos" (só visível no detalhe; pickers só mostram pendentes).

Aplicado em: picker da Nova Lista, picker "Adicionar transações" e cabeçalho do grupo
no detalhe da lista. É informação adicional — não altera seleção do grupo, soft-remove
nem o aviso âmbar de grupo parcial.

## Aprovação e ficheiro Santander (2026-08-12)

**ApproveModal** (`PaymentListsTab.tsx`) usa o mesmo padrão dos pickers: `approveRows`
agrupa os `payment_list_items` por `transactions.invoice_group_id` e rende UM
`InvoiceGroupHeaderRow` com **uma** checkbox. Aprovação de fatura agrupada é **atómica**
(`toggleGroupItems`: todos entram ou todos saem) — não há seleção parcial dentro do grupo;
cortar um item faz-se na fase de edição da lista (aviso âmbar de grupo parcial).
Expandir o cartão só MOSTRA os itens (`↳`, sem checkbox, linha não clicável).
Os 3 cards (Total / A aprovar / Não aprovado), o contador "X de Y" e o soft-remove com
`NOT_APPROVED_REASON_PREFIX` continuam a operar sobre **transações reais**.

**Ficheiro SEPA Santander**: até aqui `sepaCandidates` gerava 1 linha por transação.
Agora agrupa por `invoice_group_id` → **UMA** transferência por fatura:
- montante = soma dos valores **em aberto** (c/IVA − retenção) dos itens ativos do grupo;
- descritivo = `Fatura <ref> - <fornecedor>`;
- IBAN: se divergir entre itens do grupo, a linha é **excluída** com motivo
  `iban_mismatch` ("IBAN divergente entre itens da fatura") em vez de gerar ficheiro errado;
- `SepaCandidate.groupTransactionIds` guarda os ids reais ⇒ `payment_list_sepa_exports.transaction_ids`
  recebe todos e a **replicação do comprovativo** continua a chegar a todas as transações do grupo.

Isto é só na **geração do ficheiro**. A liquidação continua transação a transação
(`handleBulkPayment` / `toggleManualMark`) — inalterada.
