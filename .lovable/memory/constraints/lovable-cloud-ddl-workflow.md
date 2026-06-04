# Lovable Cloud — DDL Workflow

> Constraint operacional baseada em incidentes reais. Ler antes de qualquer alteração ao schema da base de dados.

## Princípio absoluto

**Nunca aplicar DDL directamente em Live via SQL Editor.** Mesmo que pareça mais rápido. Mesmo que seja "só um ALTER TABLE". Mesmo que seja idempotente.

DDL fora de migration tracked = bomba-relógio. O próximo Publish destrói o trabalho.

## Por que: o que o Publish realmente faz

Ao carregar Publish, o Lovable Cloud:

1. Compara o schema actual de Live com o schema actual de Test.
2. Gera automaticamente uma migration `<ts>_publish_migration_from_pg_dump.sql` com o diff.
3. Aplica essa migration em Live.

Se Live tem objectos (tabelas, colunas, views) que Test NÃO tem, o diff classifica-os como "extra" e gera `DROP TABLE`, `DROP COLUMN`, `DROP VIEW` para "alinhar".

Resultado: tudo o que foi criado em Live fora de uma migration tracked desaparece silenciosamente no próximo Publish.

## Histórico

- **28/05/2026** — Sprint 1 portal MP aplicado via SQL Editor em Live (14 colunas, 6 tabelas, 3 views, RLS, backfill).
- **03/06/2026 madrugada** — Publish de outra alteração gerou `pg_dump diff`. Live foi alinhado a Test (que nunca teve o schema portal). Todas as 14 colunas, 6 tabelas e 3 views foram DROPPED. Edge functions começaram a devolver `Could not find the table 'public.lead_capture'`.
- **04/06/2026** — Recovery via migration tracked aplicada pelo agente Lovable em Test, depois Publish propagou correctamente.

## Workflow correcto

### Para qualquer alteração ao schema (CREATE TABLE, ALTER TABLE, CREATE VIEW, CREATE POLICY, GRANT, CREATE FUNCTION):

1. **Autor (Claude Code ou agente Lovable)** escreve ficheiro em `supabase/migrations/<timestamp>_<descriptive_name>.sql`.
2. Se autor foi Claude Code: push para GitHub main. Depois pedir ao **agente Lovable** para puxar main e aplicar a migration em Test via tool `supabase--migration`.
3. **Pedro** carrega Publish no dashboard Lovable. O Publish detecta o diff Test↔Live e propaga.

### O que o Publish NÃO faz

**O Publish propaga DDL (schema), não DML (dados).** UPDATEs / INSERTs / DELETEs dentro do mesmo ficheiro de migration correm em Test no `agent apply`, mas o Publish para Live só envia o diff estrutural — os dados não chegam.

Backfills têm de ser aplicados em Live separadamente:
- Via SQL Editor em Live (aceitável para DML em rows específicas por UUID), ou
- Via pedido específico ao agente Lovable depois do Publish ("aplica este UPDATE em Live").

## SQL Editor em Live — quando é aceitável

Apenas para operações que **não criam objectos novos**:

- `SELECT` para inspecção
- `GRANT` / `REVOKE` em objectos existentes
- `NOTIFY pgrst, 'reload schema'`
- `UPDATE` / `INSERT` / `DELETE` em rows de tabelas existentes (correcção de dados, backfill pontual)
- `CREATE INDEX CONCURRENTLY` em situação de emergência (mas idealmente vai a migration na sessão seguinte)

Nunca:
- `CREATE TABLE`
- `ALTER TABLE ... ADD/DROP COLUMN`
- `CREATE VIEW` / `CREATE OR REPLACE VIEW`
- `CREATE POLICY` / `ALTER POLICY`
- `CREATE FUNCTION` / `ALTER FUNCTION`
- `CREATE EXTENSION`

## Scanner de segurança pré-Publish

Antes de propagar, o Lovable Cloud corre um scanner. Pode bloquear o Publish com:

- **Errors vermelhos** — geralmente vulnerabilidades pré-existentes do ERP (ex.: tabelas com IBAN/SWIFT acessíveis a roles que não deviam ver). Não são causados pelo trabalho actual.
- **Warnings laranja** — Security Definer Views (intencionais para views públicas com `security_invoker=false`), `WITH CHECK (true)` em policies de proxy anon (intencionais para captura de leads), `auth.uid() IS NOT NULL` em policies legacy.

**Como agir:**
- Ler cada finding antes de qualquer fix.
- "**Ignore issue**" em itens já conhecidos e documentados como tech debt é aceitável temporariamente.
- **NUNCA carregar "Try to fix all (free)"**. O fix automático pode reescrever policies funcionais do ERP e provocar regressões piores que o problema original.
- Findings legítimos novos = abrir tech debt explícita, resolver via migration dedicada.

## Sinais de alerta

Se viste algum destes, parar e investigar antes de continuar:

- Edge functions começam a devolver `Could not find the table '<schema>.<table>' in the schema cache` para uma tabela que sabes que existia → schema foi DROPPED, não é erro de cache.
- Query `SELECT count(*) FROM information_schema.tables WHERE table_name = '<tabela>'` devolve 0 quando devia devolver 1.
- Tabela `supabase_migrations.schema_migrations` tem uma entrada recente com nome `<ts>_publish_migration_from_pg_dump` → o Publish gerou diff automático; ler o conteúdo para ver o que mudou.
- Dashboard Lovable mostra "Publish detectado drift" para alterações que não foram feitas via agente → drift veio de SQL Editor manual.

## Validação após Publish

```sql
-- Counts esperados vs realidade
SELECT
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='<tabela>'
     AND column_name IN ('<col1>','<col2>',...)) AS cols_existem,
  (SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public'
     AND table_name IN ('<tab1>','<tab2>',...)) AS tabelas_existem,
  (SELECT count(*) FROM information_schema.views
   WHERE table_schema='public'
     AND table_name IN ('<vw1>','<vw2>',...)) AS views_existem;
```

Se algum count vier abaixo do esperado, o Publish reverteu algo — investigar `supabase_migrations.schema_migrations` para identificar a entrada `pg_dump`.
