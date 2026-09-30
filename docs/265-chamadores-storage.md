# #265 — chamadores de remoção nos 7 buckets contabilísticos (inventário 30/09/2026)

Antes -> hoje (todos passam por storage-delete / trashStorageObject).

Cliente
- src/lib/transaction-document-storage.ts:46 (transaction-documents) — usado por CardSessionDetail.tsx:382, BPAttachmentModal.tsx:161, TransactionDocumentsModal.tsx:182 e :255, PaymentListReceipts.tsx:197
- src/pages/CamarimSessionDetail.tsx:238 (camarim-documents) — reordenado: sessão primeiro
- src/components/camarim/CamarimItemModal.tsx:182 (camarim-documents) — reordenado: item primeiro
- src/components/camarim/CamarimItemModal.tsx:535 (camarim-documents) — limpeza de upload
- src/components/camarim/CamarimItemAttachmentButton.tsx:81 (camarim-documents) — limpeza de upload
- src/lib/card-item-documents.ts:66 (card-documents) — limpeza de upload
- src/lib/card-item-documents.ts:82 (card-documents) — document_path actualizado antes do ficheiro
- src/components/cards/CardTeamItemModal.tsx:316 (card-documents) — reordenado: item primeiro
- src/components/EventClosingCosts.tsx:219 (closing-cost-documents) — era por pasta; agora caminhos exactos, linha primeiro
- src/lib/storage.ts:127 removeFromCompanyBucket (standalone-invoices) — usado por StandaloneInvoiceScanner.tsx:326 e AccountantStandaloneInvoicesTab.tsx:233

Edge functions
- supabase/functions/ads-invoice-apply/index.ts:830 (transaction-documents)
- supabase/functions/ingest-transaction-document/index.ts:394 (transaction-documents)
- supabase/functions/ingest-standalone-invoice/index.ts:205 (standalone-invoices)

Sem chamadores: supplier-documents, ticket-office-settlements.
Fora de âmbito (outros buckets): crm-meta-creatives-retention, database-backup, DatabaseBackups, CreativeView, CampaignDesignStudio, EventForecast, CacheExtrasPanel, PartnerExtrasPanel, EventImplementations, AudioRecorder, BPNotesAttachmentsModal, EntityDocumentsSection, EventABAttachmentsSection, BankLineDocumentsDialog.
