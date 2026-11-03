# Janela Claude — #498 P3a / P2h

Preparação apenas: **nenhum SQL foi executado por E2b**. Cada aplicação segue o PROC-promocao e a autorização R2 da janela. Ordem: **cidades INERTE → 0302 → 0303 → 0304 → Publish**. Usar uma única cópia de cada migração (Drizzle e manual são espelhos).

Antes de Publish, resolver em R2 separado o domínio da edge `update-transaction`: continua a recusar `pix`/`boleto`. A leitura BR de fornecedores depende ainda da RPC bancária/ACL: o histórico local limita SELECT às colunas antigas e a 0302 não concede as novas. A UI recusa editar slots inacessíveis. A edge não contém regra FX explícita; o CHECK de `transactions` e restantes writers/RPCs de P2d/e/f continuam a exigir auditoria. Esta entrega não declara BRL operacional de ponta a ponta. O domínio instalado PT continua exposto em `PAYMENT_METHODS`; a capacidade BR e o tipo completo estão preparados separadamente, sem falsificar a paridade com a edge atual.

Após **cidades** (`supabase/manual/issue498-cidades-br.INERTE.sql`), guardar os IDs de RETURNING. Esperar 30 identidades alvo (27 capitais + 3 praças); 29 inserções com só Fortaleza/CE pré-existente, 5 com o seed antigo completo, 0 na repetição. Não apagar Fortaleza pré-existente no rollback.

```sql
SELECT name, state FROM public.cities WHERE country = 'Brasil' ORDER BY state, name;
SELECT translate(lower(normalize(name, NFC)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') AS nome, state, count(*)
FROM public.cities WHERE country = 'Brasil' GROUP BY 1, 2 HAVING count(*) > 1;
-- Esperado para Fortaleza/CE: 1 (sem UPDATE da linha anterior).
SELECT count(*) FROM public.cities WHERE country = 'Brasil' AND state = 'CE' AND lower(name) = 'fortaleza';
```

Após **0302** (ficheiro já preparado por #403b), verificar colunas, ACL e comentário; a UI desta entrega só lê o identificador fiscal e só envia slots BR quando as colunas existem. No slot da 0302 usa `bank_name` (banco), `routing_number` (agência), `account_number` (conta), com os atributos opcionais `account_digit`, `account_kind` (`corrente|poupanca`) e `pix_key`; metadados e outros tipos de conta existentes são preservados.

```sql
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'suppliers'
AND column_name IN ('foreign_bank_accounts','tax_id_foreign','tax_id_type');
-- O histórico local revoga SELECT na tabela e concede só colunas cadastrais
-- (20260819174233 e 20260820110300); 0302 não concede as colunas novas.
-- Se false, manter os campos indisponíveis e preparar extensão da RPC bancária/ACL
-- em R2 separado, sem GRANT SELECT na tabela (reabriria IBANs protegidos).
SELECT has_column_privilege('authenticated', 'public.suppliers', 'foreign_bank_accounts', 'SELECT') AS br_read,
       has_column_privilege('authenticated', 'public.suppliers', 'tax_id_foreign', 'SELECT') AS tax_read;
SELECT col_description('public.suppliers'::regclass, attnum)
FROM pg_attribute WHERE attrelid = 'public.suppliers'::regclass AND attname = 'foreign_bank_accounts';
```

Após **0303**, conferir os dois domínios com sete valores, boleto NOT VALID e `bank_details_br` jsonb nullable. A guarda adicional `payment_reference IS NOT NULL` impede que o CHECK aceite boleto sem linha por resultado SQL UNKNOWN; não valida dados antigos nem faz backfill.

```sql
SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid IN ('public.transactions'::regclass,'public.transaction_payments'::regclass)
AND conname IN ('transactions_payment_method_check','transaction_payments_payment_method_check','transactions_boleto_requires_linha');
SELECT data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'financial_accounts' AND column_name = 'bank_details_br';
SELECT col_description('public.financial_accounts'::regclass, attnum)
FROM pg_attribute WHERE attrelid = 'public.financial_accounts'::regclass AND attname = 'bank_details_br';
```

Após **0304**, o CHECK antigo deixa de existir e o trigger BEFORE INSERT/UPDATE resolve a moeda pelo pai; empresa divergente/ausente ou moeda indisponível recusa a escrita. Nativo BRL/BRL e EUR/EUR dispensa FX; BRL/EUR e EUR/BRL exigem ambos os campos. Não executar sondas de escrita sem autorização própria. Rollbacks comentados nos ficheiros; a reposição validada pode recusar novos dados BRL, sem os modificar.

```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'public.transaction_payments'::regclass
AND conname = 'transaction_payments_fx_required'; -- 0 linhas
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid = 'public.transaction_payments'::regclass AND tgname = 'zz_issue498_payment_native_fx';
SELECT pg_get_functiondef('public.issue498_validate_payment_native_fx()'::regprocedure);
SELECT prosecdef, has_function_privilege('anon', oid, 'EXECUTE') AS anon_exec,
has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_exec
FROM pg_proc WHERE oid = 'public.issue498_validate_payment_native_fx()'::regprocedure;
-- Esperado: false / false / false (a função invoker é chamada pelo trigger).
SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'standalone_invoices_fx_required'; -- comparar à captura anterior, inalterado
```

Após **Publish**, conferir `/version.json` com o SHA completo e homologar BR (Brasil primeiro, Fortaleza · CE, Pix/Boleto/TED/Débito automático, boleto 46 recusa e 47/48 aceita) e PT (mesmos grupos, rótulos, IBAN/SWIFT e DOM). A aplicação e a homologação Live ficam fora desta execução.
