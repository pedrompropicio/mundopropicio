---
name: Standalone invoices (Scanner de Faturas Avulsas)
description: Faturas no NIF da empresa pagas com recursos próprios da diretoria — só documento + metadados em standalone_invoices; NUNCA cria transação, BP, lista de pagamento ou movimento de conta
type: feature
---

Contexto: a diretoria da Mundo Propício tem despesas avulsas faturadas ao NIF da
empresa mas pagas com dinheiro próprio. Não há saída de caixa da empresa — o
registo existe apenas para efeitos contabilísticos.

## Regra absoluta
NUNCA cria/toca `transactions`, `event_forecasts`, `payment_lists`,
`financial_accounts` nem reembolsos. É só documento + metadados.

## Modelo
- Tabela `public.standalone_invoices`: storage_path, file_name, supplier_name,
  supplier_nif, invoice_date, total_amount, iva_amount, notes, status
  ('new'|'processed'), created_by, processed_at/by, company_id.
- Bucket privado `standalone-invoices`, isolado por empresa (prefixo
  `${companyId}/` via `src/lib/storage.ts` → ISOLATED_BUCKETS).
- RLS (2026-08-13), sempre com isolamento de empresa:
  - INSERT (upload): admin/platform_admin + **manager** + **editor** (tabela e bucket).
  - SELECT: admin/platform_admin, accountant, manager, editor.
  - UPDATE: admin/platform_admin, accountant OU `created_by = auth.uid()`.
  - DELETE: só admin/platform_admin.
- Regras de UI: "Marcar processada / Reabrir" só admin + contabilista;
  editar metadados (fornecedor/NIF/data/total/IVA/nota) só admin ou quem capturou.

## Captura (mobile-first)
- Rota `/scanner-faturas` (`src/pages/StandaloneInvoiceScanner.tsx`), atalho na
  sidebar "Scanner Faturas" para admin, manager e editor.
- "Tirar foto" (input `capture=environment`) + "Escolher ficheiro"
  (HEIC/JPG/PNG/PDF) → `normalizeImageFile` + `prepareFileForInvoiceOcr`.
- OCR via edge fn `extract-camarim-receipt` (prompt inclui `supplier_nif` =
  NIF do EMITENTE). Todos os campos são OPCIONAIS: grava-se com o que o OCR
  apanhou; vazio → null. Depois de gravar: "Escanear outra".

## Visão de conferência (reutilizada)
Componente único `AccountantStandaloneInvoicesTab.tsx`, usado em dois sítios:
aba "Faturas Avulsas" em `AccountantHome` (contabilista) e aba "Conferência"
dentro de `/scanner-faturas` (admin/manager/editor). Nunca duplicar.
Agrupamento por mês usa `invoice_date` (fallback `created_at`), mês mais
recente primeiro.

## Detalhe da lista
→
`AccountantStandaloneInvoicesTab.tsx`: agrupada por mês (invoice_date com
fallback created_at), badge nova/processada, "Marcar processada" reversível,
abrir documento via signed URL 1h e "Exportar mês" (ZIP das imagens + XLSX
resumo: nº, data, fornecedor, NIF, total, IVA, nota, estado, ficheiro).
