# MP Operação — Patch 2A.3: Staff de Campo

## Conceito

Categoria intermediária entre "user pleno da plataforma" e "anónimo": **field_staff**. Login real (acede pelo telemóvel), mas só vê `/operacao/*` no sidebar.

Reusa a tabela `profiles` com novo discriminador `profile_type`:
- `user` (default) — admins, managers, equipa core
- `field_staff` — produtores/auxiliares temporários

## Fluxo de onboarding (WhatsApp)

1. Admin/manager abre `/operacao/staff` → "+ Novo"
2. Insere nome + telefone (+351 …) + email (opcional)
3. Frontend chama edge function **`create-staff`** que:
   - Cria `auth.users` (phone-only, password aleatória descartável, NÃO confirmado)
   - Upserta `profiles` com `profile_type='field_staff'`, `company_id`
   - Cria invite em `operacao_staff_invites` (token UUID, expira em 14d)
   - Envia WhatsApp via Twilio com link `/operacao/accept-invite?token=…`
4. Staff abre o link no telefone
5. `/operacao/accept-invite` chama edge function **`accept-staff-invite`** (pública):
   - Valida token + expiração
   - Reseta password do user, confirma phone/email
   - Cria role `field_producer` em `user_roles` para a `company_id` do invite
   - Faz `signInWithPassword` interno e devolve `access_token` + `refresh_token`
   - Marca invite `accepted`
6. Frontend faz `supabase.auth.setSession(...)` → navega para `/operacao/equipa`

## Constraint relevante

`profiles.id` é FK direta de `auth.users(id)` — **não há `user_id` separado**. Implicação: o `auth.users` é criado imediatamente no cadastro (não no aceite). Diferença vs proposta original do patch, que assumia profile sem user_id. Funcionalmente equivalente, mais alinhado com schema.

## Sidebar gating

Hook `useIsFieldStaffOnly()` em `src/hooks/useIsFieldStaffOnly.ts`:
- Retorna `true` se `profile_type='field_staff'` E roles = `['field_producer']` (ou vazias)
- `AppSidebar` filtra para mostrar só itens cujo `to` começa por `/operacao` quando `fieldStaffOnly === true`

Promover um field_staff a admin/manager (manual via DB) automaticamente devolve a sidebar completa, porque deixa de ser "puro".

## Reenvio de convite

Edge function `send-staff-invite` recebe `{profile_id}`:
- Reusa invite `pending` ainda válido (incrementa `send_count`, atualiza `sent_at`)
- Cria novo se não existir nenhum válido
- Reenvia WhatsApp

## Archive

`profiles.archived_at` é soft-delete leve. Não apaga `auth.users` nem invalida histórico. Lista UI esconde por defeito.

## Permissão

`manage_operacao_staff` — atribuída a `admin` e `manager` em `role_permissions`.

## RLS

`operacao_staff_invites`:
- SELECT/INSERT/UPDATE/DELETE: `has_permission(auth.uid(),'manage_operacao_staff') OR is_platform_admin()`
- RESTRICTIVE company isolation: `company_id = current_company_id()`
- Audit via `log_table_change()`

## Files

- Migration: `supabase/migrations/<timestamp>_*.sql`
- Edge: `create-staff`, `send-staff-invite`, `accept-staff-invite`
- UI: `src/pages/operacao/StaffList.tsx`, `AcceptInvite.tsx`, `src/components/operacao/NewStaffDialog.tsx`
- Hook: `src/hooks/useIsFieldStaffOnly.ts`
- Indicador `HardHat` em `EtapaAssigneeSheet` e `FrenteTeamSheet`

## Secrets requeridos

- `LOVABLE_API_KEY` (já existe, gateway Twilio)
- `TWILIO_API_KEY` (já existe)
- `TWILIO_WHATSAPP_FROM` — opcional (default `+14155238886`, sandbox Twilio)
- `APP_URL` — opcional (default `https://mpgestaoeventos.com`)
