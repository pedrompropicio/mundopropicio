---
name: A&B attachments
description: Anexos no separador A&B do evento (event_ab_attachments + bucket privado event-ab-attachments), réplica exacta do mecanismo dos anexos de linhas do BP; só armazenamento, fora de cálculos
type: feature
---

# Anexos do separador A&B

Secção colapsável "Anexos" no fundo do separador A&B (`EventABAttachmentsSection.tsx`), para os documentos de fecho do operador de bares (PDF/XLSX/CSV/imagens).

- Tabela `public.event_ab_attachments` — espelho de `event_forecast_attachments`, com `event_id` em vez de `forecast_id`. `storage_path` UNIQUE, `company_id` default `current_company_id()`, cascade em `events`.
- Bucket privado `event-ab-attachments`, path `{company_id}/{event_id}/{uuid}_{file}`; limite de 25 MB validado no cliente (o bucket não tem `file_size_limit` porque DDL a `storage.buckets` é rejeitado pelo tooling).
- Trigger `eaba_enforce_max_attachments` — máx. **20 anexos por evento**.
- RLS igual à do BP: SELECT a qualquer membro da empresa; INSERT/DELETE só admin/manager/editor; sem UPDATE. Mesmas 3 policies em `storage.objects` com isolamento pelo 1.º segmento do path.
- Abertura por signed URL de 5 min via `signedCompanyUrl` (nunca URL pública).
- **Não entra em nenhum cálculo**: `event-ab-calc.ts`, hooks de cenários, `event_ab_config`/`event_ab_zones` intactos.
