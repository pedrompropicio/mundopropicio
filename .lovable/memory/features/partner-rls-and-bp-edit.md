---
name: Partner RLS isolation + BP editing
description: Isolamento RLS do role partner por evento (Master→Splits), flag can_edit_bp, edição condicional de valores do BP e audit genérico
type: feature
---

# Fase 2a — Blindagem RLS partner + edição condicional BP + audit

Aplicado em Test em 2026-06-16. Pendente Publish para Live.

## Isolamento (policies SELECT PERMISSIVE aditivas, prefixo `*_select_partner`)
- `events` — `user_has_event_access(uid, id) OR user_has_event_access(uid, parent_event_id)` (Master→Splits)
- `event_sessions`, `event_ticket_zones`, `event_forecasts` — direto por `event_id`
- `event_ticket_lots`, `ticket_sales` — via `zone_id → event_ticket_zones.event_id`
- `transactions` — direto por `event_id`
- `transaction_documents` — via `transaction_id → transactions.event_id`
- `event_partners` — `event_id` + `supplier_id = user_supplier_id(uid)` (só vê a sua linha)
- `event_partner_extras`, `partner_paid_expenses`, `partner_advance_expenses` — `event_id` + JOIN `event_partners.partner_id` com `supplier_id` do user

Policies legacy `auth.uid() IS NOT NULL` **mantidas intactas** (tech debt separado). Admin/manager/editor inalterados — só novas PERMISSIVE.

## Flag `can_edit_bp`
- Coluna `partner_event_access.can_edit_bp boolean NOT NULL DEFAULT false`
- UI: toggle em `PartnerAccessManager` (ícone Pencil/PencilOff)
- Default OFF → portal continua read-only até admin/manager ativar

## Escrita BP (Fase 2a: só UPDATE de VALORES)
- Policy `event_forecasts_update_partner` (UPDATE) — exige acesso ativo + `can_edit_bp = true` + `company_id` consistente no WITH CHECK
- INSERT/DELETE para partner **não abertos** (Fase 2b via propostas)
- RPC `batch_update_event_forecasts` extendida: aceita admin/manager/platform_admin **OU** partner com `can_edit_bp` para o evento ou seu Master/Split. Mantém todos os locks (overhead/exclude_from_result/master_forecast_id/is_retroactive_override/version_id/scope/company).

## Audit BP
- Trigger `audit_event_forecasts_changes AFTER INSERT/UPDATE/DELETE` → `log_table_change()` → `system_audit_log` com `entity_type='event_forecasts'`, `changed_by=auth.uid()`, old/new jsonb. Captura **todos** os perfis (admin/manager/editor/parceiro).

## UI partner
- `BPPartnerEditDialog.tsx` — listagem editável de linhas do BP (description/amount/iva_rate/formalidade); save via RPC; linhas bloqueadas (overhead/master/retroactivo) ficam read-only com badge
- Botão "Editar BP" aparece em `PartnerEventDetail` apenas quando `can_edit_bp=true` para o evento ativo (não no Master view de turnês)

## Não tocar (Fase 2b ou outra)
- Criar/apagar linhas BP por partner (modelo de propostas pendente)
- INSERT/DELETE em `event_forecasts` para role partner
- Limpeza das 54 policies legacy `auth.uid() IS NOT NULL`
