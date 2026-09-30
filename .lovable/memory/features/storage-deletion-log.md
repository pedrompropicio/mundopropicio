---
name: Remoção de ficheiros contabilísticos (#265)
description: 7 buckets sem DELETE directo; tudo via edge storage-delete / _shared/storage-trash.ts, registo em storage_deletion_log e move para _trash/<data>/
type: feature
---
- Buckets: transaction-documents, camarim-documents, card-documents, closing-cost-documents, standalone-invoices, supplier-documents, ticket-office-settlements.
- Cliente: `src/lib/storage-delete.ts` (deleteStorageObject/s, lança em falha); `removeFromCompanyBucket` e `removeTransactionDocumentObjects` usam-no por dentro. Nunca chamar `.remove()` nestes buckets.
- Servidor: `trashStorageObject(admin, …)` em ads-invoice-apply, ingest-transaction-document, ingest-standalone-invoice.
- Ordem: linha primeiro (com .select), ficheiro depois. Registo antes do move; move falhado desfaz o registo.
- Permissão: RPC `can_delete_storage_object(bucket, name)` (regras das antigas políticas). Apagar linha de transaction_documents = admin/manager.
- Pendente: cron de limpeza de `_trash` aos 30 dias.
