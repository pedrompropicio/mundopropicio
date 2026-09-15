---
name: Invoice groups (fatura única → N itens do BP)
description: Elo entre deteção por ATCUD/nº fatura e o grupo formal invoice_group_id — agrupar manual, auto-agrupar conservador, desagrupar, auditoria OCR e painel Admin
type: feature
---

# Fatura única → N transações → grupo → transferência única

## Porquê
Uma fatura de fornecedor cobre várias rubricas do BP ⇒ criamos **1 transação por rubrica**
(cada uma com a sua `category_id` e, se aplicável, a sua taxa de IVA). Ao pagar, o banco
recebe **uma única transferência** pelo total c/IVA da fatura.

## Duas camadas
1. **Deteção (visual, runtime)**: `TransactionRow.tsx` procura irmãs com o MESMO
   `invoice_ref` + MESMO `supplier_id` e mostra o badge `📎 <ref> (N) — <total c/IVA>`.
   Não escreve nada na BD.
2. **Grupo formal**: `transactions.invoice_group_id` (UUID). É a chave canónica usada
   pela Lista de Pagamento, SEPA e pelas propagações multi-IVA
   (ver `mem://features/invoice-group-multi-iva.md`).

## Regra de agrupamento (endurecida 2026-09, incidente BP Estoril; apertada 2026-09-14)
`src/lib/invoice-group.ts`
- `normalizeInvoiceRef`, `isGroupableInvoiceRef` — ≥4 chars, ≥1 dígito, nunca proformas.
- `fetchInvoiceSiblings(supplierId, invoiceRef)` — irmãs do MESMO fornecedor.
- `checkInvoiceDocumentsConsistency(ids)` → `shared` | `no_documents` | `conflict`,
  comparando os `transaction_documents.file_url`.
- `ensureInvoiceGroup(supplier, ref, { force? })` — **só agrupa automaticamente quando
  as linhas PARTILHAM o mesmo ficheiro (`shared`)**. `no_documents` e `conflict` devolvem
  `needsConfirm: true` + `reason` e **não escrevem nada** — ausência de papel não é prova
  (incidente das portagens Via Verde na nota R-030/2026, 2026-09-14).
  `force: true` só depois de confirmação humana.
- `autoGroupInvoiceForTransaction(txId)` — devolve `{ suggestion: true, reason }` nesses casos.
- `revalidateInvoiceGroupAfterDocument(txId)` — chamado depois de anexar documento a uma
  linha de um grupo: se as irmãs têm documentos diferentes pede o veredicto do OCR à edge
  function `audit-invoice-groups` em âmbito de um só grupo (`group_id`) e devolve
  `kind: "conflict"`; `InvoiceGroupRevalidateDialog` avisa e oferece desagrupar.
- `clearInvoiceGroupForTransaction(txId)` — **desagrupa** uma linha; se o grupo ficar com
  uma única linha, limpa também essa (grupo de 1 não faz sentido).
- `fetchInvoiceGroupSiblingDetails(txId)` — descrição, data e valor das irmãs, para o
  aviso de eliminação.

Superfícies:
- **Diálogo de sugestão** `src/components/InvoiceGroupSuggestDialog.tsx` — "É mesmo a mesma
  fatura?" com "Sim, agrupar" / "Não, são faturas diferentes". Usado por
  `TransactionFormModal.tsx` (ao criar) e `TransactionEditModal.tsx` (ao guardar).
- **Ação manual** `src/components/InvoiceGroupAction.tsx` — botão "Agrupar fatura" com
  lista das N + soma das bases + total c/IVA. Corre `checkInvoiceDocumentsConsistency`
  ao abrir; em `conflict` mostra "As linhas têm documentos anexos diferentes — podem ser
  faturas diferentes" e exige **segunda confirmação** ("Agrupar mesmo assim") antes de
  forçar.
- **Desagrupar**: botão "Desagrupar fatura" no `TransactionEditModal.tsx`, com confirmação.
- **OCR manda sobre o campo**: se o número lido no documento divergir do `invoice_ref`
  escrito à mão, o formulário **substitui** e avisa por toast.
- **Guarda de duplicados** (`checkDuplicatesAndSubmit`): além da verificação por descrição,
  há uma consulta **filtrada na BD** por `supplier_id` + `invoice_ref`; só avisa quando o
  **valor também coincide** (< 0,01 €). Nº igual com valor diferente é a fatura repartida
  por várias linhas de BP — não avisa (senão 15 linhas dariam 14 avisos).
- **Eliminação**: `Transactions.tsx` lista nominalmente as irmãs do grupo (descrição, data,
  valor) antes de confirmar.

## Lista de Pagamento
`groupPaymentItems` (`src/lib/export-payment-list.ts`) usa `grp::<invoice_group_id>` como
chave; `supplier_id::invoice_ref` fica só como **fallback legado**. Cada grupo rende um
único "📎 Fatura Agrupada — <total> a transferir" (WhatsApp, Excel/PDF e SEPA).

**Grupo parcial (avisa, não bloqueia)**: `PaymentListsTab.tsx` conta os itens reais do
grupo na BD e mostra faixa âmbar "⚠️ Fatura X tem N itens; só M nesta lista.".

## Auditoria OCR dos grupos existentes (2026-09)
- Tabela `public.invoice_group_audit` (`run_at`, `transaction_id`, `invoice_group_id`,
  `file_url`, `ref_atual`, `numero_lido`, `document_type`, `confidence`, `veredicto`,
  `aplicado`, `company_id`), com RLS e grants.
- Edge function `audit-invoice-groups` (`verify_jwt = true`, só `admin`/`platform_admin`):
  - `dry-run` **incremental** (`max_groups`, default 3) porque o OCR é lento: devolve
    `run_at` e `remaining`; o painel repete com o mesmo `run_at` até `remaining = 0`.
  - Grupo em que todas as linhas partilham ficheiro → `ok` sem sequer ler.
  - Cache de OCR por `file_url` (cada ficheiro lido uma vez).
  - Número canónico = mais frequente entre documentos `invoice`/`receipt` com confiança
    diferente de `low`. Divergente → `desagrupar`; sem documento/número/tipo utilizável →
    `rever`.
  - `apply` **só desagrupa** (`invoice_group_id = null`, `invoice_ref = numero_lido`);
    **nunca junta**. Exige o `run_at` no body — sem ele recusa, para não apanhar uma
    corrida antiga por engano.
- Painel `src/pages/admin/InvoiceGroupAudit.tsx`, rota `/admin/auditoria-grupos-fatura`,
  cartão no Admin. Envia sempre o `run_at` mostrado no ecrã ao aplicar.

## Backfill 2026-08 (histórico)
UPDATE único agrupou os casos inequívocos (mesmo fornecedor + mesmo nº com dígitos,
excluindo proformas). Re-auditar com:

```sql
SELECT supplier_id, invoice_ref, count(*) FROM public.transactions
WHERE invoice_group_id IS NULL AND supplier_id IS NOT NULL
  AND invoice_ref IS NOT NULL AND btrim(invoice_ref) <> ''
GROUP BY 1,2 HAVING count(*) > 1;
```

## Badge de progresso de liquidação
`src/hooks/useInvoiceGroupProgress.ts` — UMA query agregada por grupo devolve
`{ total, paidCount, openWithIva }`. Liquidado = `status='paid'` **ou**
`paid_amount >= total c/IVA − 0,05`. `InvoiceGroupProgressBadge` mostra neutro / âmbar
parcial / verde completo nos pickers e no detalhe da lista.

## Aprovação e ficheiro Santander
`ApproveModal` agrupa por `invoice_group_id` e a aprovação da fatura é **atómica**
(todos os itens entram ou saem). O ficheiro SEPA gera **uma** transferência por fatura
(soma dos valores em aberto); IBAN divergente entre itens exclui a linha com motivo
`iban_mismatch`. `SepaCandidate.groupTransactionIds` garante que o comprovativo é
replicado a todas as transações do grupo. A liquidação continua transação a transação.

## Propagação de campos partilhados (update-transaction) — fechada em TRÊS (2026-09-14)
`invoiceSharedFields` em `supabase/functions/update-transaction/index.ts` é exactamente:
`supplier_id`, `date`, `due_date` (as datas saem quando existe `installment_group_id`).

Critério — três naturezas de campo numa linha de fatura:
1. **Do DOCUMENTO** — fornecedor, data, vencimento. Só isto propaga.
2. **Da LINHA** — valor, `iva_rate`, descrição, `specification`, `category_id`, `event_id`,
   `is_transitory`, `exclude_from_result`, `invoice_ref`. Distingue uma linha da outra;
   nunca propaga (incidente R-030/2026: a especificação reescrevia as irmãs).
3. **Do PAGAMENTO** — `account_id`, `payment_method`, `payment_entity`,
   `payment_reference`. Pagamento tem máquina própria (`transaction_payments`) e o
   `account_id` é a conta de onde o dinheiro saiu — reescrevê-lo numa irmã já paga
   corrompe o saldo bancário. A UI limpa o `payment_reference` em transferência.

Sem custo de preenchimento: o "Dividir por IVA" faz spread do formulário inteiro, logo
cada irmã NASCE com rubrica, evento, conta, vencimento e método.

### Retenção IRS declarada no split por IVA
`TransactionFormModal.tsx` (caminho `pendingIvaSplit`) reparte
`declared_withholding_amount` proporcionalmente à base de cada linha (`roundCents`), com o
resto do arredondamento na última linha para somar exactamente o declarado.
`declared_withholding_rate` fica igual em todas (é taxa).

## Anexar por API e partilha do documento pelo grupo (2026-09-15, #180)
Edge function `ingest-transaction-document` (`verify_jwt = true`, **só service_role**,
molde do `portal-media-import`) — porta de entrada sem browser para anexar um documento
descarregado de um URL do Google Drive (`drive.google.com` / `*.googleusercontent.com`;
links `/file/d/<id>/view` e `?id=<id>` são normalizados para `uc?export=download`).

Body: `{ origem, nome, doc_type='pdf', is_accounting=true, partner_visible=true, alvo }`.
`alvo` é **exactamente uma** de três formas:
- `{ transaction_id }` → essa linha; se tiver `invoice_group_id`, **todas as irmãs**.
- `{ invoice_group_id }` → todas as linhas do grupo.
- `{ supplier_id, invoice_ref }` → igualdade **exacta** do `invoice_ref` (sem
  normalização tolerante). Se nenhuma tiver grupo e houver >1 linha, atribui um
  `invoice_group_id` novo a todas — **a chamada é a confirmação humana**, logo aplica-se
  também a proformas. Se algumas já têm grupo e outras não → **409** com as duas listas;
  a função não decide por elas.

Zero transações → 404. Transações de empresas diferentes → 422.

Escrita: **UM** objeto no bucket `transaction-documents` em
`<company_id>/<primeira transaction_id>/<timestamp>.<ext>` e **N** linhas em
`transaction_documents` com o MESMO `file_url` (`uploaded_by = 'ingest-api'`,
`company_id` explícito porque `set_company_id_on_insert` aborta sem utilizador).
Recusa `text/html` (página de aviso do Drive), >20 MB e tipos fora de pdf/jpeg/png.

Idempotência: se já existir linha com o mesmo `name` e o mesmo **tamanho de ficheiro**
(lido do storage) em qualquer das N transações, reutiliza esse `file_url` e cria só as
linhas em falta. Se o upload passar e o insert falhar, o objeto é apagado — nunca fica
ficheiro órfão. Resposta 200: `{ file_url, transaction_ids, invoice_group_id, created, reused }`.

Não altera o upload do ecrã, o `update-transaction` nem o
`revalidateInvoiceGroupAfterDocument` (a revalidação continua a ser da UI).

## Âmbito de um grupo na edge function de auditoria
`audit-invoice-groups` aceita `group_id` no body: dry-run só desse grupo (devolve
`group_veredicto`: `ok` | `desagrupar` | `rever`) e apply limitado a esse grupo. A auditoria
global continua a exigir admin/platform_admin; o âmbito de um grupo abre a manager/editor,
validando que todas as linhas do grupo são de uma empresa do próprio utilizador.
