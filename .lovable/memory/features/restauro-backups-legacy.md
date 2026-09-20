---
name: Restauro de backups legacy (v2) e target_company_id
description: Backups pré multi-tenant não trazem company_id; o restauro exige target_company_id explícito e estampa as linhas antes da carga (#96)
type: feature
---

# Backups legacy no restauro (#96, 20/09/2026)

Backups `backupScope === "legacy"` (v2, ficheiro solto `backup-*.json`, sem `meta.scope`) foram
gerados antes do multi-tenant: as linhas não têm `company_id`. Sob service_role o insert entra sem
`company_id`, `current_company_id()` é NULL e o NOT NULL rejeita.

Caminho 1 (sem mexer em dados):

- `target_company_id` (uuid) passa a ser **obrigatório** no body quando o backup é legacy.
  Em falta → 400 `"backup legacy exige target_company_id"` (constante
  `LEGACY_TARGET_COMPANY_ERROR` em `supabase/functions/_shared/restore-legacy-company.ts`).
- Antes da carga nas sombras, cada linha sem `company_id` recebe o alvo — só nas tabelas que têm
  a coluna (`tableHasCompanyId`, `select company_id limit 0`, sem ler dados).
- A resposta devolve `legacy_company_stamped` (linhas por tabela) e `target_company_id`.

Consumidores: `database-restore`, `selective-restore` (e `surgical-restore`, que reencaminha).
A guarda antiga mantém-se: legacy só por `service_role` ou `platform_admin`.

UI: `src/pages/DatabaseBackups.tsx` e `src/components/SelectiveRestoreModal.tsx` enviam
`target_company_id = empresa activa` (os backups legacy aparecem na lista a platform_admin).
