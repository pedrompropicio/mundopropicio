# Lovable Cloud — DDL Workflow

> Constraint operacional baseada em incidentes reais. Ler antes de qualquer alteração ao schema da base de dados.

## Princípio absoluto

**Todo o DDL passa pelo agente Lovable, como migration tracked. Nunca a martelar SQL à mão no SQL Editor.**

Desde a decisão D2 (base única Live, Test eliminado) o agente aplica DDL diretamente em Live. Isso não abre a porta ao SQL Editor: o que protege o schema é o DDL ficar registado como migration e ser reproduzível, não o ambiente onde corre. Objeto criado à mão fica fora do histórico e ninguém consegue explicar de onde veio.

## Por que: o que o Publish fazia (mundo anterior à D2)

> Nota: esta secção descreve o mundo anterior à decisão D2 (base única Live, Test eliminado). Conserva-se porque explica o porquê da regra.

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

1. **O autor pede ao agente Lovable a alteração**, descrita em linguagem natural.
2. **O agente escreve a migration** em `supabase/migrations/<timestamp>_<nome>.sql` e aplica-a em Live.
3. **Confirmação por query de validação** (ver secção "Validação" abaixo).

O Publish propaga código, edge functions e frontend — **não objectos SQL**. Não há passo de propagação Test→Live: só existe Live (D2).

### O que o Publish NÃO faz

**O Publish propaga código, edge functions e frontend. Não propaga DML (dados) nem crons.**

Um UPDATE/INSERT/DELETE dentro de um ficheiro de migration corre quando o agente aplica a migration em Live — e mais nada o volta a correr. Nenhum Publish o repete noutro sítio, porque não há outro sítio.

Alterações a crons (`pg_cron`) seguem a mesma regra: aplicam-se em Live pelo agente e o Publish não as toca.


## SQL Editor em Live — quando é aceitável

Apenas para operações que **não criam objectos novos**:

- `SELECT` para inspecção
- `GRANT` / `REVOKE` em objectos existentes
- `NOTIFY pgrst, 'reload schema'`
- `UPDATE` / `INSERT` / `DELETE` em rows de tabelas existentes (correcção de dados, backfill pontual)
- `CREATE INDEX CONCURRENTLY` em situação de emergência (mas idealmente vai a migration na sessão seguinte)
- `DROP POLICY` e `ALTER POLICY` quando o `query_database` os rejeita (erro 499). É o caminho previsto no `docs/estado/estado-plataforma-e-infra.md` para o trabalho de isolamento multi-tenant. A alteração é de política, não cria objectos, e fica registada no estado da frente.

Nunca:
- `CREATE TABLE`
- `ALTER TABLE ... ADD/DROP COLUMN`
- `CREATE VIEW` / `CREATE OR REPLACE VIEW`
- `CREATE POLICY` (continua a ser trabalho do agente, via migration)
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
