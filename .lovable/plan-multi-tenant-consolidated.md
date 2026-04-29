# Plano consolidado — Multi-tenant Test (substitui as 11 migrations fragmentadas de 29/04)

## Estado real (verificado em Test, 29/04 03:30 UTC)
- `tables_with_company_id` = **0**
- `public.companies` = **não existe**
- Última migration aplicada: `20260428210604`
- 11 ficheiros de migration multi-tenant criados mas **nenhum executado**
- Total: ~1061 linhas SQL fragmentadas em 11 timestamps consecutivos

## Por que consolidar
1. **Atomicidade**: as 11 migrations têm dependências circulares (ex: Fase 1 cria `companies` mas Fase 2A cria FKs para ela; Fase 5 popula dados). Aplicar fora de ordem ou parar a meio deixa DB inconsistente.
2. **Idempotência reforçada**: cada bloco usa `IF NOT EXISTS` / `DROP POLICY IF EXISTS`, mas valida primeiro precondições.
3. **Rollback claro**: se falhar, reverte tudo numa transação (não há "metade aplicado").
4. **Auditoria mais fácil**: 1 ficheiro = 1 evento na timeline de migrations.

## Ordem consolidada (única transação)

| # | Bloco | Origem (migration) | Linhas |
|---|-------|--------------------|--------|
| 0 | **Pré-flight**: assert `companies` não existe; assert role `app_role` existe | — | ~10 |
| 1 | Adicionar valor `'platform_admin'` ao enum `app_role` (commit isolado, exigência PostgreSQL) | 021839 | 1 |
| 2 | **Fase 1**: criar `companies`, `company_invitations`, adicionar `company_id` a `profiles`/`user_roles`/`user_permissions`, funções `current_company_id()` / `is_platform_admin()`, RLS de companies, trigger `handle_new_user`, branding storage policies, INSERT da Mundo Propício seed | 021930 | 204 |
| 3 | **Fase 2A**: 14 tabelas eventos/BP — column + FK + index + RLS RESTRICTIVE | 022451 | 229 |
| 4 | **Fase 2B**: 7 tabelas bilhética | 022902 | 99 |
| 5 | **Fase 2C**: 13 tabelas cache artistas + camarim | 023113 | 95 |
| 6 | **Fase 2D**: 8 tabelas financeiro core | 023352 | 76 |
| 7 | **Fase 2E**: 10 tabelas suporte financeiro | 023624 | 71 |
| 8 | **Fase 2F**: 15 tabelas sistema/comercial/comunicações/catálogos | 023935 | 83 |
| 9 | **Fase 3**: completar `company_invitations` (status, accepted_at, etc.) | 024355 | 7 |
| 10 | **Fase 4**: storage RESTRICTIVE — 1º segmento do path = company_id | 025150 | 127 |
| 11 | **Fase 6**: criar empresa "Demo 2" | 030704 | 14 |
| 12 | **Hardening**: remover `USING (true)` residuais → `auth.uid() IS NOT NULL` | 031336 | 56 |
| 13 | **Pós-flight**: verificações inline (counts), backfill `company_id = MP` em todas as linhas existentes | NOVO | ~30 |

**Total**: ~1100 linhas, 1 transação BEGIN/COMMIT.

## Decisões críticas tomadas no consolidado

1. **ENUM `platform_admin`**: PostgreSQL exige commit antes de usar valor novo de enum. Solução: bloco isolado numa pré-migration mínima (passo 1), depois bloco grande.
2. **Backfill obrigatório**: TODAS as linhas existentes recebem `company_id = '975254b9-...'` (Mundo Propício) antes de qualquer policy `WITH CHECK (company_id = current_company_id())` entrar em vigor — caso contrário o app actual quebra.
3. **`company_id` NOT NULL**: aplicado APENAS após o backfill, com `ALTER TABLE ... ALTER COLUMN company_id SET NOT NULL`.
4. **Demo 2 isolada**: criada SEM utilizadores nem dados — apenas o registo em `companies` para a suite RLS poder testar isolamento com counts reais (MP=N, D2=0).
5. **Seed Mundo Propício com ID fixo**: `975254b9-6b92-4cdd-a971-36e4a4f98525` (já assumido por toda a suite RLS e edge functions).

## Pós-aplicação (validação automática)
Após executar, corro:
1. `SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='company_id'` → esperado: 67+
2. `SELECT count(*) FROM public.companies` → esperado: 2
3. Suite RLS `scripts/multi-tenant-rls-isolation-test.txt` no SQL Editor.

## Rollback (se algo falhar)
A transação inteira faz ROLLBACK automático. Para limpar manualmente caso fique meio-aplicado:
```sql
DROP TABLE IF EXISTS public.company_invitations CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS company_id;
-- (etc para 66 tabelas)
```
Mas o BEGIN/COMMIT atómico torna isto desnecessário em condições normais.

## O que NÃO está neste plano (deliberadamente)
- ❌ Aplicar a Live (isso é Fase 7, plano separado em `.lovable/plan-fase-7-live.md`).
- ❌ Migrar dados de Live (não há dados em Test que precisem mover).
- ❌ Edge functions multi-tenant (já criadas em sessões anteriores, não tocar).
- ❌ Apagar os 11 ficheiros de migration originais (são histórico — ficam, mas o consolidado tem timestamp posterior e idempotência garantida pelas guards `IF NOT EXISTS`).

## Próximo passo
Confirmar e gerar o ficheiro de migration consolidado `20260429_consolidated_multi_tenant.sql` para aplicação atómica.
