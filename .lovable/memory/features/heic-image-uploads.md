---
name: HEIC image uploads
description: Fotos HEIC/HEIF do iPhone convertidas para JPEG no cliente via helper src/lib/image-upload.ts antes de upload/IA (camarim, anexos de transações, créditos, bilheteira, cartões, operação, CRM)
type: feature
---

Fotos de iPhone em HEIC/HEIF não são renderizáveis no browser nem aceitas pela IA (Gemini via gateway). Regra: converter no cliente ANTES de upload/OCR.

- Helper único: `src/lib/image-upload.ts`
  - `isHeicFile(file)` — deteta por MIME (`image/heic|heif[-sequence]`) OU extensão `.heic/.heif` (o browser dá MIME vazio muitas vezes).
  - `normalizeImageFile(file)` — HEIC/HEIF → JPEG q≈0.85 via `heic2any` (import dinâmico/lazy); outros formatos passam intactos (sem recompressão). Erro → lança `Error("Não foi possível converter a foto (HEIC). Tenta exportar como JPEG.")` e o caller mostra toast.
  - `HEIC_ACCEPT` — string a juntar ao `accept` dos inputs.
- Camarim (`CamarimItemModal`): accept inclui HEIC; conversão acontece antes de preview/OCR/upload (estado "A converter foto…"); a IA e o anexo recebem sempre JPEG.
- Mesmo padrão aplicado em: TransactionDocumentsModal, TransactionFormModal (ler fatura IA + anexar), SplitByIvaModal, SupplierCreditsPanel, TicketOfficeSettlementModal, cards/CardTeamItemModal, operacao/MediaCapture, crm-admin ImageUploader/MultiImageUploader.
- NÃO aplicar a uploads não-imagem (XLSX/CSV/PDF puros).
