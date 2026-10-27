# P4b — 0283: acesso configurável à posição financeira (R2)

HEAD no arranque: cf577532db5a90d7900e68a25068e1c69949c894

## Lido no arranque (plano)
- supabase/manual/0282_p4_financial_position_base.sql (gate linhas 21-38, ACL no fim)
- src/contexts/AuthContext.tsx (`ALL_PERMISSIONS`, linhas 70-95)
- supabase/migrations/20260518205115_*.sql (padrão de semente role_permissions de view_simulator)
- docs/DECISIONS.md (D-ERP320 na linha 6357)
- Live (SELECT): `has_permission(uuid,text)` e colunas de `role_permissions` / `user_permissions`; `role_permissions` com `view_financial_position` = 0 linhas.
- Por ler na execução (passo 1, antes de qualquer escrita): docs/INDEX.md, QUADRO ("Em execução agora" + ERP), estado do ERP, Issues MP-ERP abertas, memória event-stages.md, docs/testes/p4-posicao-base-20261027.md. Se algo contradisser este plano, paro.

Nota: em modo plano só posso escrever este ficheiro. A reserva no QUADRO é o primeiro passo depois da aprovação.

## Factos que fixam o desenho
1. O catálogo de permissões é **código**: `ALL_PERMISSIONS` em `src/contexts/AuthContext.tsx`, usado pelo ecrã de gestão por papel e por utilizador. Não há tabela de catálogo. Alteração de código: uma linha, com teste.
2. `has_permission(_user_id, _permission)` em Live:
   - lê primeiro `user_permissions.granted` com `company_id = current_company_id()`, e esse valor **ganha** (override true/false);
   - senão devolve `is_platform_admin(uid)` OU papel em `user_roles` (empresa atual) com `role_permissions`.
   Daqui: platform_admin passa sempre que não tiver override false; admin com override false é recusado.
3. `role_permissions(id, role app_role, permission text, created_at)`; semente idempotente por `WHERE NOT EXISTS`.

## Alteração de código (única)
`src/contexts/AuthContext.tsx`, em `ALL_PERMISSIONS`, a seguir a `view_balances`:
```ts
{ key: "view_financial_position", label: "Ver posição financeira", group: "Geral" },
```
Teste novo `src/test/p4b-financial-position-permission.test.ts`: a chave existe uma vez, com o rótulo exato «Ver posição financeira». Se `permission-snapshot-311.json` falhar por causa da nova chave, atualizo o snapshot só com essa chave e digo-o.

## SQL final da migração 0283
Ficheiros idênticos: `drizzle/migrations/0283_p4b_financial_position_permission.sql` (via ferramenta de migração) e `supabase/manual/0283_p4b_financial_position_permission.sql`; rollback também em `supabase/manual/rollback_0283_p4b_financial_position_permission_comentado.sql`.

```sql
-- P4b (D-ERP321): access to get_financial_position_base becomes configurable via
-- permission 'view_financial_position'. Seed: role admin only. platform_admin via is_platform_admin.
-- Only the access gate changes; the rest of the body is byte-identical to 0282.

INSERT INTO public.role_permissions (role, permission)
SELECT 'admin'::public.app_role, 'view_financial_position'
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions
  WHERE role = 'admin'::public.app_role AND permission = 'view_financial_position'
);

CREATE OR REPLACE FUNCTION public.get_financial_position_base(p_company_id uuid, p_year integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_ref date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_pa boolean;
  v_admin boolean;
  v_view boolean;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_pa := public.is_platform_admin(v_uid);
  IF p_company_id IS NULL
     OR (p_company_id IS DISTINCT FROM public.current_company_id() AND NOT v_pa) THEN
    RAISE EXCEPTION 'company_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT v_pa AND NOT public.has_permission(v_uid, 'view_financial_position') THEN
    RAISE EXCEPTION 'financial_position_permission_denied' USING ERRCODE = '42501';
  END IF;
  -- Balance visibility identical to ticket_office_balances.
  v_admin := v_pa OR public.has_role(v_uid, 'admin'::public.app_role);
  v_view := public.has_permission(v_uid, 'view_balances');

  -- [RESTO DO CORPO: cópia byte-a-byte da 0282, desde "WITH RECURSIVE tree AS (" até "END\n$fn$;"]
$fn$;

-- ACL unchanged (CREATE OR REPLACE keeps it; restated for safety).
REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_financial_position_base(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_position_base(uuid, integer) TO service_role;

-- ROLLBACK (comentado; não executar sem autorização):
-- 1) Reaplicar o CREATE OR REPLACE da 0282 inteiro (gate antigo por user_roles admin/manager).
-- 2) DELETE FROM public.role_permissions
--      WHERE role = 'admin'::public.app_role AND permission = 'view_financial_position';
-- 3) Overrides em user_permissions com esta chave, se o Pedro os criar, ficam (inertes) ou apagam-se à parte.
```
O ficheiro real terá o corpo completo (sem o marcador), gerado a partir da 0282 por substituição só do bloco do gate.

Diff esperado do corpo vs 0282 (único):
```diff
-  IF NOT v_pa AND NOT EXISTS (
-    SELECT 1 FROM public.user_roles ur
-    WHERE ur.user_id = v_uid AND ur.company_id = p_company_id
-      AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
-  ) THEN
+  IF NOT v_pa AND NOT public.has_permission(v_uid, 'view_financial_position') THEN
```

Saldos: a nova permissão dá acesso à posição; caixa/cartões/retido com saldo só a admin, platform_admin ou `view_balances` (com `balance_visible_to_all` por conta), como na 0282. Um manager com `view_financial_position` e sem `view_balances` vê a posição com saldos a NULL e `balances_visible=false`.

Efeito imediato: managers que hoje acedem perdem o acesso (decisão do Pedro: só admin por defeito).

## Verificação (só depois de aprovado)
a) md5 agregado de todas as funções `public` exceto `get_financial_position_base`, antes/depois — igual. Diff textual de `pg_get_functiondef` novo vs 0282 limitado ao bloco acima.
b) PGlite (`src/test/p4b-financial-position-permission.pglite.test.ts`, mesmo arnês do P4), stubs fiéis de `has_permission`/`current_company_id`/`is_platform_admin` copiados de Live:
   - platform_admin passa;
   - admin com semente passa;
   - manager sem concessão → `financial_position_permission_denied`;
   - manager com `user_permissions granted=true` (empresa atual) passa;
   - admin com `user_permissions granted=false` → recusado (override);
   - viewer sem concessão → recusado;
   - não platform_admin com company_id alheio → `company_forbidden`;
   - anon sem EXECUTE (`has_function_privilege` false).
c) Cobertura de `company_id = current_company_id()`: caso extra — manager com `granted=true` registado noutra empresa → recusado.
d) Live (só leitura): `has_function_privilege` anon false / authenticated true / PUBLIC false; `role_permissions` com esta chave = 1 linha (admin). Sem testes com utilizadores e sem tocar `user_permissions`: a prova Live é do Pedro.
e) Suites P4 + P1/P1b voltam a passar.

## Fecho R0
docs/testes/p4b-permissao-posicao-20261027.md (provas), D-ERP321 em docs/DECISIONS.md, estado do ERP reescrito, QUADRO (R2 concluído, reserva libertada), memória features/financial-position-base.md atualizada (gate por permissão), AGENTS.md: substituir a regra do P4 só se mencionar o gate por papel. Sem edge, sem UI além da linha do catálogo, sem Publish.

## Perguntas
19. Managers perdem o acesso no momento da aplicação. A (recomendada): aceitar; o Pedro concede por utilizador quando quiser. B: semear também manager (contraria a decisão).
20. platform_admin com override `granted=false` na empresa ativa: o gate deixa-o passar (v_pa curto-circuita). A (recomendada): manter, como pedido. B: respeitar o override também para platform_admin.
