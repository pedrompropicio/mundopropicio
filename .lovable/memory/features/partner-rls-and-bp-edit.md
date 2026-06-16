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

## Escrita BP — Via 1 (edição direta + audit)
- **Fase 2a**: policy `event_forecasts_update_partner` (UPDATE) — exige acesso ativo + `can_edit_bp = true` + `company_id` consistente no WITH CHECK
- **Fase 2b**: policies `event_forecasts_insert_partner` (INSERT) e `event_forecasts_delete_partner` (DELETE) — mesmo predicado + força `type='expense'`, `is_overhead=false`, `exclude_from_result=false`, `master_forecast_id IS NULL`, `is_retroactive_override=false`
- RPCs `batch_update_event_forecasts` e `batch_insert_event_forecasts` — ambas aceitam admin/manager/platform_admin **OU** partner com `can_edit_bp` para o evento ou seu Master/Split. Mantêm todos os locks. `batch_insert` força `type='expense'` para partners.
- DELETE na grelha vai direto via `supabase.from('event_forecasts').delete()` (BPGridEditor) — coberto pela policy + cascade-check de transações pagas (bloqueia se houver).

## UI partner (Fase 2b)
- Aba **BP** no `PartnerEventDetail` com toggle **Agrupada ↔ Grelha** (só visível com `edit_approved_bp` + `can_edit_bp`)
- Grelha = `<BPGridEditor>` (mesmo componente do staff) com paste de Excel, INSERT/DELETE em massa, snapshot auto antes de save, virtualizado
- Locks aplicam ao partner: overhead, master_forecast_id, retroativo, !canEditBP
- `BPPartnerEditDialog.tsx` removido (substituído pela grelha)

## Audit BP
- Trigger `audit_event_forecasts_changes AFTER INSERT/UPDATE/DELETE` → `log_table_change()` → `system_audit_log` com `entity_type='event_forecasts'`, `changed_by=auth.uid()`, old/new jsonb. Captura **todos** os perfis (admin/manager/editor/parceiro).

## UI partner
- `BPPartnerEditDialog.tsx` — listagem editável de linhas do BP (description/amount/iva_rate/formalidade); save via RPC; linhas bloqueadas (overhead/master/retroactivo) ficam read-only com badge
- Botão "Editar BP" aparece em `PartnerEventDetail` apenas quando `can_edit_bp=true` para o evento ativo (não no Master view de turnês)

## Não tocar (Fase 2b ou outra)
- Criar/apagar linhas BP por partner (modelo de propostas pendente)
- INSERT/DELETE em `event_forecasts` para role partner
- Limpeza das 54 policies legacy `auth.uid() IS NOT NULL`
