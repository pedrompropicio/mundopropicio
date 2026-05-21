---
name: BP forecast notes and attachments
description: Sistema dual em linhas do BP — observações (event_forecasts.notes) + uploads reais (event_forecast_attachments + bucket) que coexistem com os links externos legacy (attachment_refs gerido pelo sync Coala/import PL)
type: feature
---

# Observações + Anexos em linhas do BP

Cada linha de `event_forecasts` (receita ou despesa) tem três áreas geridas no modal `BPNotesAttachmentsModal`, acessível pelo botão 📎 ao lado da rubrica:

## 1. Observações — `event_forecasts.notes` (text)
Notas internas livres. Visíveis em readonly para Viewer; editáveis por admin/manager/editor. Renderizadas em caption por baixo da rubrica na grelha do BP.

## 2. Documentos — `event_forecast_attachments` (NOVA tabela)
Uploads reais via Supabase Storage:
- Bucket privado: **event-forecast-attachments**, isolado por `company_id` (1º segmento do path obrigatoriamente igual a `current_company_id()`).
- Path: `{company_id}/{forecast_id}/{uuid}_{filename}`.
- Limites: máx. **25 MB por ficheiro**, máx. **10 anexos por linha BP** (enforced por trigger `efa_enforce_max_attachments` → `RAISE EXCEPTION 'Cada linha do BP suporta no máximo 10 anexos.'`).
- Qualquer MIME aceite (liberal).
- Cascade: `ON DELETE CASCADE` sobre `forecast_id` — remover a linha BP apaga os registos. Limpeza dos blobs do bucket é best-effort no cliente (remove storage antes/depois do delete da row).

## 3. Links externos — `event_forecasts.attachment_refs` (jsonb legacy)
URLs Drive/Dropbox geridos historicamente pelo sync Coala e pelo import PL XLSX. Continuam a funcionar tal e qual — `BPNotesAttachmentsModal` apenas expõe a edição manual sem alterar o pipeline existente. Ver memory [bp-attachment-links](mem://features/bp-attachment-links).

## Permissões (RLS)
- **SELECT** (`event_forecast_attachments` + storage): qualquer membro da empresa, incluindo Viewer.
- **INSERT/DELETE**: admin/manager/editor (mesmo critério em tabela e em `storage.objects`).
- **UPDATE**: bloqueado (sem policy) — metadados não são editáveis depois de criados.
- Platform admin bypass em todas as policies.

## Indicadores na grelha do BP
Botão compacto à direita da rubrica em cada `ForecastRow`:
- 📝 (StickyNote) quando `notes` preenchido.
- 📎 com badge numérico = `count(uploads) + count(links externos)`.
- Tooltip detalha: "X documento(s) + Y link(s)".
- Escondido em linhas read-only/prorated/overhead-via-master.

## Versionamento e cenários
- `event_forecasts.notes` é uma coluna — quando `create_bp_snapshot` serializa `to_jsonb(f.*)` para `bp_versions.snapshot_payload`, as notes vão junto. Restaurar/promover esse snapshot traz as notes de volta. É aceitável: cada estado activo tem as suas notes congeladas com o snapshot.
- `event_forecast_attachments` é uma **tabela separada sem qualquer vínculo a `version_id`** — uploads **não** são clonados quando se cria snapshot ou se promove cenário. Cada estado activo acumula os seus próprios uploads desde a sua data de existência.
- `attachment_refs` continua a viajar dentro de `snapshot_payload` (comportamento legado preservado).

## Por que os três sistemas coexistem
- `attachment_refs` foi desenhado para o pipeline automático do XLSX/sync Coala e tem matching multi-camada. Migrar para a nova tabela exigiria mexer no `import-pl-xlsx`, `OrphanAttachmentsResolver`, sync Coala — risco alto sem ganho funcional imediato.
- `event_forecast_attachments` cobre o gap real: **uploads humanos pela UI** (PDFs de contratos, faturas, briefings) que nunca tiveram lugar antes.
- Coexistir mantém o sync Coala intacto e dá aos utilizadores um caminho claro para uploads reais.
