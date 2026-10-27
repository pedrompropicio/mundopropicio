# P4b — permissão view_financial_position (0283) — provas 27/10/2026

HEAD no arranque: cf577532db5a90d7900e68a25068e1c69949c894

## Migração
- drizzle/migrations/0283_p4b_financial_position_permission.sql = supabase/manual/0283_p4b_financial_position_permission.sql (cmp idêntico; sha256 61269535ee9d1a9ef077ae74513cb8fdfe28525234cafa088a6db6d7003876b6).
- Rollback comentado no fim e em supabase/manual/rollback_0283_p4b_financial_position_permission_comentado.sql.
- Catálogo: código (`ALL_PERMISSIONS`, src/contexts/AuthContext.tsx), uma linha nova.

## Diff do corpo vs 0282 (único)
```diff
-CREATE FUNCTION public.get_financial_position_base(...)
+CREATE OR REPLACE FUNCTION public.get_financial_position_base(...)
-  IF NOT v_pa AND NOT EXISTS (
-    SELECT 1 FROM public.user_roles ur
-    WHERE ur.user_id = v_uid AND ur.company_id = p_company_id
-      AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
-  ) THEN
+  IF NOT v_pa AND NOT public.has_permission(v_uid, 'view_financial_position') THEN
```

## Live (só leitura)
- md5 agregado das 827 funções public, sem get_financial_position_base: antes 0550d2cbf14b91e4a38efbf67e5797ce, depois 0550d2cbf14b91e4a38efbf67e5797ce (igual).
- has_function_privilege: anon false, authenticated true.
- role_permissions com view_financial_position: só admin.
- pg_get_functiondef: contém view_financial_position; já não contém o gate por user_roles.

## PGlite (src/test/p4b-financial-position-permission.test.ts, 11/11; com P4 23/23)
has_permission copiado de Live. Casos: catálogo com rótulo exato; semente só admin e idempotente; platform_admin passa; admin com semente passa; manager sem concessão recusado; manager com granted=true na empresa atual passa; manager com granted=true noutra empresa recusado (company_id = current_company_id()); admin com granted=false recusado; viewer recusado; empresa alheia → company_forbidden; anon sem EXECUTE.
Suite completa: 294 ficheiros ok; 1 falha intermitente em newgang-crm-profile-fields.test.ts que passa isolada (não relacionada).

## Por fazer pelo Pedro
Prova Live com o utilizador de teste (sem e com concessão). Não alterei user_permissions de ninguém. Sem Publish.
