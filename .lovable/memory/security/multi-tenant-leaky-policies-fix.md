---
name: Multi-tenant leaky SELECT policies fix (Live 2026-04-30)
description: 54 policies SELECT legacy `auth.uid() IS NOT NULL` em Live coexistiam com `company_isolation_*` e furavam isolamento (PERMISSIVE OR-combinadas); removidas via scripts/fix-multi-tenant-leaky-policies-live.txt
type: constraint
---

## Sintoma reportado
Utilizador autenticado como `pedroneto@mundopropicio.com` (active_company = Mundo Propício) via no Eventos o "Coala Festival Portugal 2026", que pertence à empresa `Coala Festival Portugal`. Só "organizava" depois de entrar num evento e voltar (refetch/filtro client-side por company_id).

## Causa
54 tabelas em Live tinham 2 policies SELECT PERMISSIVE coexistentes:
1. Legacy: `(auth.uid() IS NOT NULL)` — qualquer autenticado vê tudo
2. Nova: `company_id = current_company_id()` — isolamento por tenant

Como PERMISSIVE policies são combinadas por **OR**, a legacy ganhava sempre e qualquer user via dados de qualquer empresa. Em Test estas policies já tinham sido limpas; em Live ficaram da migração antiga (BATCH-8 não as removeu).

## Fix aplicado
Script `scripts/fix-multi-tenant-leaky-policies-live.txt` (BEGIN + 54 DROP POLICY IF EXISTS + verificação + COMMIT). Aplicado em Live a 2026-04-30. Verificação pós-fix devolveu 0 linhas.

## Regra para futuro
Sempre que criar policies `company_isolation_*` numa tabela, verificar que **não existe nenhuma policy SELECT PERMISSIVE com expressão genérica** (`auth.uid() IS NOT NULL`, `true`, `is_authenticated()`) na mesma tabela — caso contrário o isolamento é furado silenciosamente.

Query de auditoria:
```sql
SELECT c.relname, p.polname, pg_get_expr(p.polqual, p.polrelid)
FROM pg_policy p
JOIN pg_class c ON c.oid=p.polrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND p.polcmd IN ('r','*')
  AND p.polpermissive=true
  AND pg_get_expr(p.polqual, p.polrelid) IN ('(auth.uid() IS NOT NULL)', 'true');
```

Deve devolver 0 linhas em Test e em Live.

## 2026-05-09 update

4 policies adicionais (`bp_versions`, `bp_version_audit_log`, `supplier_credits` x2 incluindo um DELETE) foram dropadas via hotfix SQL direto em volta anterior, mas regrediram durante a migration do rate-limit (schema sync recriou-as a partir de migrations versionadas antigas). Agora committadas formalmente em `supabase/migrations/20260509152542_*_drop_leaky_auth_uid_policies.sql` (idempotente, `IF EXISTS`). Audit RLS legacy: 57 → 54 (estável). Lição: hotfix em Live tem de virar migration na mesma volta, senão regride.

## 2026-09-13 — #158: legacy a zero, padrão fechado

Migration `20260913132000_*` eliminou as **51** políticas PERMISSIVE legacy
`auth.uid() IS NOT NULL` que ainda existiam (50 SELECT + 1 INSERT em
`event_forecast_formalidade_log`), substituindo-as por
`<tabela>_select_privileged_roles` / `_insert_privileged_roles` com
`public.has_staff_role(auth.uid())`.

`has_staff_role(uuid)` — STABLE, SECURITY DEFINER, `search_path public` — é agora
o predicado único de staff: um EXISTS em `user_roles` com admin, platform_admin,
manager, editor, viewer, accountant, producer, field_producer, content_manager,
marketing_manager, com o escopo de empresa de `has_role`. **Nunca** inclui `user`
nem `partner`.

Duas leituras que o sócio precisa passaram a estar escritas de forma estanque:
`account_categories_select_partner` (nomes das rubricas do BP no Portal) e
`role_permissions_select_own_roles` (o AuthContext lê as permissões dos papéis do
próprio utilizador — sem isto qualquer não-staff perde todas as permissões).

Regra: a query de auditoria deste ficheiro tem de devolver **0** linhas. Antes de
dropar uma política legacy, inventariar as tabelas lidas pelo Portal do Sócio e
garantir política de sócio para cada uma; RPCs SECURITY DEFINER não contam.

Consequência: o papel `user` não dá acesso a dados. `producaotec@mundopropicio.com`
(empresa Coala Festival Portugal) ficou sem acesso até receber papel de staff —
pendência do Pedro, é DML.
