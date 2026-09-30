---
name: Anexos de transação — ordem de eliminação (#265)
description: Objeto do bucket transaction-documents só sai depois da linha e quando nenhuma linha o referencia; helper único removeTransactionDocumentObjects; DELETE sempre com .select
type: feature
---

# Regra (30/09/2026, Issue #265)
- O objeto só sai do bucket `transaction-documents` DEPOIS de a linha sair da BD
  e quando nenhuma linha de `transaction_documents` o referencia (grupos de
  fatura e `ingest-transaction-document` partilham o mesmo file_url entre N linhas).
- Nunca apagar ficheiros antes do DELETE na BD.
- DELETE sempre com `.select("id")`: 0 linhas sem erro = RLS filtrou → lançar
  "Sem permissão…" e não tocar no storage.

## Implementação
- Cliente: `src/lib/transaction-document-storage.ts` →
  `removeTransactionDocumentObjects(fileUrls)`; ignora ref://, http(s),
  camarim://, card://, bank://; nunca lança; devolve { removed, kept, errors }.
- Usado em: CardSessionDetail (Excluir despesa), BPAttachmentModal,
  TransactionDocumentsModal (remover + limpeza de upload falhado),
  PaymentListReceipts.
- Servidor: `ads-invoice-apply` (reverter) e `ingest-transaction-document`
  (limpeza de insert falhado) verificam referências antes de remover.

## Causa do incidente
`deleteExpenseMut` apagava os objetos antes da transação; um editor (card_manage)
apagava do bucket, mas a RLS filtrava o DELETE em transactions (0 linhas, sem
erro) e o insert em system_audit_log falhava sem verificação → ficheiro perdido,
linha órfã, toast falso, zero rasto. RLS/policies de storage vão por SQL separado.

## 30/09/2026 — remoção só no servidor
- Edge `delete-transaction-document` (service_role; permissões via `_shared/caller-context.ts`, partilhado com resolve-attachment-url): modos `{documentId, includeShared?}`, `{fileUrl, scope:"payment_list", paymentListId}`, `{fileUrl, scope:"orphan"}`.
- Ordem: permissão pela empresa dona (admin/manager) → apaga linhas sem RLS → conta file_url em TODAS as empresas → só com zero move para `_trash` (trashStorageObject, #265). bank:/ref:/camarim:/card: nunca tocam no storage. Falha no storage = sucesso com aviso.
- Cliente: `deleteTransactionDocument` em `src/lib/transaction-document-storage.ts`. Rollback de insert no TransactionDocumentsModal só apaga as linhas.
- Guarda: `src/lib/__tests__/no-direct-transaction-document-remove.test.ts`.
