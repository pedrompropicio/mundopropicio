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

## Cobertura adicional (2026-08-07)

- `normalizeImageFile` tem agora **fallback**: se o `heic2any` falhar (variantes
  HEIC do iPhone que não lê), tenta `createImageBitmap` + canvas → JPEG (Safari/iOS
  descodifica HEIC nativamente). Se ambos falharem, o erro lançado inclui a
  mensagem REAL da falha para aparecer no toast e permitir diagnóstico.
- `CamarimItemAttachmentButton` deixou de ser só "abrir": com `sessionId` mostra
  também botão **Anexar** (upload em item de camarim JÁ EXISTENTE) → `HEIC_ACCEPT`,
  `normalizeImageFile` antes do upload para `camarim-documents`, insert em
  `camarim_item_documents`, `has_document=true` e toast de erro explícito.
  Usado em `CamarimSessionDetail` (2 listas) e `CamarimEquipa`.
- Também cobertos: logo da empresa (`admin/Companies.tsx`), criativos CRM
  (`crm/CreativeNew.tsx`, `crm/CampaignDesignStudio.tsx`).
- Restantes inputs sem helper são importadores XLSX/PDF (não-imagem).
