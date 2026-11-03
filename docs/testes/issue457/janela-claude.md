# Janela Claude — #498 P3a / P2h

Preparação apenas: **nenhum SQL foi executado por E2b**. Cada aplicação segue o PROC-promocao e a autorização R2 da janela. Ordem: **cidades INERTE → 0302 → 0303 → 0304 → 0305 → deploy edge `update-transaction` → Publish**. Usar uma única cópia de cada migração (Drizzle e manual são espelhos).

O corretivo E2b prepara os sete meios na edge e a validação de boleto partilhada com o frontend; só o deploy autorizado os torna disponíveis no servidor. A 0305 estende a RPC bancária sem abrir os slots BR a todos os membros do tenant. **Lacuna R1 fora deste despacho:** `loadOptionalSupplierBrData`/`optionalBankColumns`, em `src/components/SupplierBankDetails.tsx`, ainda fazem SELECT direto de `foreign_bank_accounts`; precisam de passar pela RPC antes de declarar operacionais os slots BR na UI. A UI continua a recusar editar slots inacessíveis. A edge não contém regra FX explícita; o CHECK de `transactions` e restantes writers/RPCs de P2d/e/f continuam a exigir auditoria. Esta entrega não declara BRL operacional de ponta a ponta. A lista PT `PAYMENT_METHODS` mantém os cinco valores; a união com `BR_PAYMENT_METHODS` corresponde aos sete da edge, verificados em execução pelo teste `issue498-update-transaction-mirror`.

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
-- Antes da 0305, false é esperado para authenticated.
-- Após 0305, foreign_bank_accounts continua fechado no SELECT direto;
-- a leitura bancária faz-se por get_supplier_bank_details(uuid[]).
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

Para **0305**, usar `0305_issue498_supplier_columns_acl.sql` (migração e cópia manual byte-idênticas). A origem da limitação é `get_supplier_bank_details(uuid[])` e os GRANTs por coluna de `20260819174233_d18ca020-c68d-4cb5-8868-bc3ea9f550c4.sql`, repetidos em `20260820110300_8d3e952c-1cd0-4229-9ecc-f022a95904a8.sql` e reforçados em `20260820123647_3c8bae6d-6f1b-424d-afb9-182fabf93183.sql`.

Guardar antes/depois o owner e os privilégios efetivos da RPC, ACL das tabelas e políticas abaixo. Alargar `RETURNS TABLE` exige DROP/CREATE dentro da transação (CREATE OR REPLACE isolado recusa a mudança do retorno). O DROP é RESTRICT: qualquer dependência inesperada aborta a migração, sem CASCADE. O ficheiro captura e repõe owner, destinatários e grant options da RPC, incluindo papéis locais, retirando os novos grants por omissão. O rollback comentado contém a função anterior completa e usa a mesma preservação de ACL; não remove dados nem colunas. Se o catálogo diferir das referências do cabeçalho, parar antes da aplicação e rever na janela.

```sql
-- Captura antes/depois: os mesmos destinatários/privilégios/grant options e owner.
SELECT p.proowner::regrole AS owner, a.grantee::regrole, a.privilege_type, a.is_grantable
FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
WHERE p.oid = 'public.get_supplier_bank_details(uuid[])'::regprocedure
ORDER BY 1, 2, 3, 4;
SELECT r.rolname,
  has_function_privilege(r.oid, 'public.get_supplier_bank_details(uuid[])', 'EXECUTE') AS rpc_exec
FROM pg_roles r ORDER BY r.rolname; -- comparar todo o conjunto antes/depois
SELECT relname, relacl, relrowsecurity, relforcerowsecurity FROM pg_class
WHERE oid IN ('public.suppliers'::regclass, 'public.financial_accounts'::regclass);
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('suppliers', 'financial_accounts')
ORDER BY tablename, policyname; -- políticas e ACL de tabela inalteradas
```

Após **0305**, a RPC deve devolver os nove campos anteriores mais `foreign_bank_accounts jsonb`, `tax_id_foreign text`, `tax_id_type text`. Mantém `can_view_supplier_bank_data()`, `current_company_id()` e o filtro pelos IDs. Campos fiscais têm o mesmo SELECT cadastral do `nif`; a conta BR tem o mesmo acesso do `financial_accounts.iban`. Não conceder SELECT da tabela suppliers nem das suas colunas bancárias a authenticated/anon.

```sql
SELECT pg_get_function_result('public.get_supplier_bank_details(uuid[])'::regprocedure);
SELECT pg_get_functiondef('public.get_supplier_bank_details(uuid[])'::regprocedure);
SELECT r.rolname,
  has_column_privilege(r.oid, 'public.suppliers', 'iban', 'SELECT') AS iban,
  has_column_privilege(r.oid, 'public.suppliers', 'foreign_bank_accounts', 'SELECT') AS slots_br,
  has_column_privilege(r.oid, 'public.suppliers', 'nif', 'SELECT') AS nif,
  has_column_privilege(r.oid, 'public.suppliers', 'tax_id_foreign', 'SELECT') AS tax_id_foreign,
  has_column_privilege(r.oid, 'public.suppliers', 'tax_id_type', 'SELECT') AS tax_id_type,
  has_column_privilege(r.oid, 'public.financial_accounts', 'iban', 'SELECT') AS account_iban,
  has_column_privilege(r.oid, 'public.financial_accounts', 'bank_details_br', 'SELECT') AS account_br
FROM pg_roles r ORDER BY r.rolname;
-- authenticated: suppliers iban/slots_br=false, nif/tax_id_foreign/tax_id_type=true.
-- Nenhum papel novo com slots_br vs iban ou account_br vs account_iban.
-- anon continua sem leitura de suppliers; service_role conserva a leitura anterior.
SELECT r.rolname, has_function_privilege(r.oid,
  'public.get_supplier_bank_details(uuid[])', 'EXECUTE') AS rpc_exec
FROM pg_roles r WHERE rolname IN ('anon', 'authenticated', 'service_role');
-- anon=false; authenticated=true; restantes resultados iguais à captura anterior.
```

Com sessões autenticadas próprias na homologação, confirmar por POST `/rest/v1/rpc/get_supplier_bank_details` com `{"p_supplier_ids":["<UUID de fixture do próprio tenant>"]}`: admin/manager/editor/accountant recebem os campos novos; viewer recebe `[]`; um UUID de outro tenant devolve `[]` mesmo a um leitor autorizado. Conferir apenas fixtures autorizadas, sem publicar dados bancários no relatório. Confirmar leitura de `financial_accounts.bank_details_br` com a mesma sessão que já lê o IBAN dessa conta, incluindo conta restrita e outro tenant recusados. Estes ensaios de leitura ainda não foram executados por E2b. A leitura de slots pela UI aguarda o corretivo R1 referido acima.

Depois do **deploy de `update-transaction`**, guardar a identificação/versão e proveniência dos ficheiros publicados, incluindo `_shared/payment-methods.ts`. Não há uma query SQL que prove o código servido pela edge. Primeiro conferir por SELECT os pré-requisitos e escolher fixtures autorizadas da homologação:

```sql
SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.transactions'::regclass
AND conname IN ('transactions_payment_method_check', 'transactions_service_payment_requires_mb', 'transactions_boleto_requires_linha');
SELECT id, company_id, payment_method, payment_entity, payment_reference, status
FROM public.transactions WHERE id = '<UUID de fixture autorizado>'::uuid;
```

Só com autorização para as escritas de teste na homologação, chamar POST `/functions/v1/update-transaction` com JWT de um editor autorizado e corpo `{"transaction_id":"<UUID>","updates":{...}}`. Conferir HTTP e fazer SELECT da mesma fixture após cada caso; as recusas não podem alterar a linha nem acrescentar auditoria. Matriz: `payment_method=pix` sem referência → 200; boleto com `payment_reference` de 47 ou 48 dígitos → 200; 46/49 dígitos, null, letras, espaços ou quebra final → 400 e exatamente `Boleto exige linha digitável de 47 ou 48 dígitos`. Na edição parcial de um boleto, alterar só a referência inválida também recusa; mudar para boleto aproveita a referência guardada; alterar apenas descrição de boleto antigo incompleto não é recusado por esta validação. `service_payment` incompleto conserva HTTP 400 e `Pagamento de Serviços exige Entidade (5 dígitos) e Referência (9 dígitos)`; 5/9 dígitos conserva aceitação. Método desconhecido continua HTTP 400. Não executar estas chamadas em Live nesta preparação.

Após **Publish**, conferir `/version.json` com o SHA completo e homologar BR (Brasil primeiro, Fortaleza · CE, Pix/Boleto/TED/Débito automático, boleto 46 recusa e 47/48 aceita) e PT (mesmos grupos, rótulos, IBAN/SWIFT e DOM). A aplicação e a homologação Live ficam fora desta execução.
