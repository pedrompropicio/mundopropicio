# #333 — Prova39: execute negativo com PDF válido, sem efeitos

Entrega 2026-10-18 02:01:49 UTC. HEAD inicial848e2f556a0e18a8a04a4593e02acef201767743=GitHub=Lovable e CI39087996779success/agentFinishedtrue confirmados pelo controlador; checkout limpo, ancestralidade301a62c2 PASS. Início observado01:57:15UTC. Reserva atualizada antes do ensaio. Continuação imediata autorizada por Pedro às01:56UTC, sem intervalo restante. Executor único0-Cowork ChatGPT via Lovable ERP, sem subagentes; #323/DECISIONS intactas.

## Resultado finito
Preflight local PASS;13 verificações Live PASS. Execute Cloud409 em1.168s com statuspendente/reservaprepare, não422/schema. RPCauthorize403/42501 com mensagem de operação não ativada. Capabilitiesfalse/false. Lacuna do execute negativo da prova37 fechada; não repetidos os39checks anteriores nem qualquer hash errado Cloud.

## Antes da conta: bytes e handler reais
PDF sintético de1página, sem fatura/fornecedor real,1499bytes,application/pdf. SHA256 dos bytes exatos:71f5e44dc5b441804eb07ab099b006d4fb119f5c9b86f82b9645492ce711670a. ReportLab gerou catálogo/objetos/xref/startxref/EOF;pdfinfo leu1página,pdftotext leu a marca “Synthetic document. Not an invoice.”. Renderização Poppler vista:sem cortes,sobreposição ou caracteres quebrados. Ficheiro e render apenas/tmp/issue333-proof39; nenhum upload.

Importados diretamente do checkout, sem copiar/reimplementar o produto:validateDocument emdata-entry-core.ts,createAttemptHandler emhandler.ts e protocolo standalone-attempt.ts. O validador aceitou os bytes exatos. Request schema/owner/check passaram com envelope correspondente. Espião lançou42501 emauthorize:handler respondeu409pendente,2check/1authorize/0begin/0commit/0upload/0read/0receipt. Transporte local injeta a recusa, NÃO é SQL real; preflight comprova caminho do handler. Hash do envelope local usa JSON; Cloud calculou hash canónico PostgreSQLjsonb por SELECT. Hash documental é idêntico em ambos.

Primeira tentativa local falhou apenas na resolução npm:zod@3.23.8. Corrigido somente deno.json temporário(nodeModulesDir:auto); importações/asserts/produto intactos. PASS obtido ANTES da criação da conta. Nenhuma conta consumida pelo erro local. Bibliotecaspypdf ausentes:usado leitor Poppler instalado, sem instalar/reimplementar leitor.

## Uma conta e uma reserva técnicas
ÚNICA conta nova.invalid por AuthAdmin createUser email_confirm:true, sem email/invite/magiclink; password aleatória/JWT só memória, sign-in password normal. Trigger existente criou profile+roleuser; somente essa linha da conta nova promovida a manager na empresa existente. Nenhuma permissão global/ACL/config alterada. Contexto canónico RPC confirmou manager+empresa. Nenhuma conta anterior reaberta.

ÚNICA reserva prepare semeada service, identidade/documentosha/size/mime/envelopehash/path/destino inexistente definidos desde início; nenhum update da reserva. Payload técnico zeroEUR/IVA0 e marca não-fatura; não criado registo emstandalone_invoices. Envelope/hash retornados pelo check correspondem à fixture e aos1499bytes preservados. Uma única chamada execute com base64 desses bytes. Authorize negado e recuperação somentecheck; não resend/legacy. Checkowner correto antes/depois, reserva inteira count/hash idêntica; zeroaudits/receipts/objetos/destino.

## Matriz desta continuação (não repete anteriores)
```text

{"case": "one new Auth fixture", "result": "PASS", "http": 200}
{"case": "canonical manager context", "result": "PASS", "http": 200}
{"case": "immutable prepare fixture seeded", "result": "PASS", "http": 201, "document_size": 1499}
{"case": "capabilities false/false", "result": "PASS", "http": 200, "seconds": 0.978, "sqlstate": null, "status": null, "state": null}
{"case": "owner canonical check before", "result": "PASS", "http": 200, "seconds": 0.186, "sqlstate": null, "status": null, "state": "prepare"}
{"case": "Cloud execute exact PDF gate closed", "result": "PASS", "http": 409, "seconds": 1.168, "sqlstate": null, "status": "pendente", "state": "prepare"}
{"case": "RPC authorize closed42501", "result": "PASS", "http": 403, "seconds": 0.323, "sqlstate": "42501", "status": null, "state": null}
{"case": "owner recovery read-only after", "result": "PASS", "http": 200, "seconds": 0.177, "sqlstate": null, "status": null, "state": "prepare"}
{"case": "entire prepare row unchanged", "result": "PASS"}
{"case": "zero destination effects", "result": "PASS", "audits": 0, "invoices": 0, "objects": 0, "receipts": 0, "state": "prepare"}
{"case": "global logout", "result": "PASS", "http": 204}
{"case": "ban new fixture", "result": "PASS", "http": 200}
{"case": "ban/sessions SQL closure", "result": "PASS", "banned": true, "sessions": 0}
```

## Baselines reais antes/depois
23 componentes count+hash iguais. Hashes/IDs/linhas privadas só/tmp; saída pública sanitizada por igualdade+contagem:
```text
{"transactions": {"equal": true, "before_n": 1966, "after_n": 1966}, "transaction_payments": {"equal": true, "before_n": 1417, "after_n": 1417}, "event_forecasts": {"equal": true, "before_n": 2300, "after_n": 2300}, "standalone_invoices": {"equal": true, "before_n": 98, "after_n": 98}, "financial_accounts": {"equal": true, "before_n": 27, "after_n": 27}, "data_entry_settings": {"equal": true, "before_n": 0, "after_n": 0}, "standalone_attempt_settings_333": {"equal": true, "before_n": 0, "after_n": 0}, "standalone_attempt_audit_333": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_sessions": {"equal": true, "before_n": 2, "after_n": 2}, "data_entry_documents": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_previews": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_results": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_storage_receipts": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_messages": {"equal": true, "before_n": 0, "after_n": 0}, "prior_attempts": {"equal": true, "before_n": 4, "after_n": 4}, "prior_auth": {"equal": true, "before_n": 60, "after_n": 60}, "prior_roles": {"equal": true, "before_n": 83, "after_n": 83}, "prior_profiles": {"equal": true, "before_n": 60, "after_n": 60}, "functions_acl": {"equal": true, "before_n": 22, "after_n": 22}, "table_acl_rls": {"equal": true, "before_n": 303, "after_n": 303}, "policies": {"equal": true, "before_n": 1085, "after_n": 1085}, "storage_objects": {"equal": true, "before_n": 105, "after_n": 105}, "storage_buckets": {"equal": true, "before_n": 2, "after_n": 2}}
```

Âmbitos: financeiro5tabelas;CORE/settings/audit/messages;fixturesanterioresAuth/roles/profiles/attempts excluindo SOMENTE a conta/principal novos;22funções públicasdata_entry_* e standalone_*333 com corpos+ACL;303tabelas públicasrelkindr comACL/RLS;1085policies public+storage;105objetos/2buckets data-entry-staging+standalone-invoices. Contagens de tabelas/policies diferem do relatório37 porque o filtro desta prova é explícito acima; não usar diferença entre inventários de âmbito diverso como mutação ou regressão. Cada before/after desta prova tem o MESMO filtro.

Mudanças técnicas próprias:Auth+1/profile+1/membership próprio manager/reservaprepare+1. Anteriores totalmente preservados. Destino invoices0/audits0/objects0/receipts0/stateprepare. Igualdade efetiva de Storage e receipts comprova ausência de efeitos persistidos. Contagem de chamadas upload/read/receipt/commit é espião LOCAL; não há trace de chamadas interno Cloud acessível, não alegado. Cloud409+gate42501+row unchanged+Storage/receipts/auditfinanceiro iguais são evidência combinada do bloqueio antes de efeito. Nenhum request Storage de escrita emitido pelo runner.

## Encerramento e limites
Finally executou após todos os controlos independentes:logoutglobal204,ban200,SELECTbanned=true/auth.sessions0. Sem alegar revogação instantânea de accessJWT. Fixture/reserva/auditoria preservadas;sem apagar/reabrir conta. Nenhum SQLDDL/runtime/config/permissõesglobais/flags/deploy/Publish/CAPI/email/cron/portal;nenhuma fatura real ou fictícia/TX/BP/pagamento/conta/reembolso.

ProvaAuth/Storage/gates NEGATIVA completada no âmbito autorizado:provas28/34/37+execute39. Não é execução positivaCloud/E2E, produto ativo ou conclusão integral da fase6. Limite37 do path inexistente standalone-invoices continua sem provar isolamento de objeto existente nesse bucket; esta prova não amplia esse contrato.

## Timeout separado — não repetido
Consolidado de37/38:SQL0191=Live por comparação no servidor,hash divergente40001 imediato emPostgreSQL17local~27ms;Cloud excedeu20s sem resposta. Causa infraestrutura desconhecida. Proposta diagnóstica INERTE acessível:controlador solicitar traceCloud dos pedidos anteriores da função/janela01:44–01:48UTC com correlação e número de tentativas/código40001, sem queries/PII/segredos. Distinguir retryPostgREST/gateway de lock/rede com essa evidência; não criar helpersLive nem repetir chamadaCloud para recolher trace. Experimento de código alternativo emSQLlocal opcional não necessário para fechar execute e não executado aqui; PG anterior já distingue erro SQL imediato de transporteCloud. Não autoriza migração/correção automática.

Não recomendar nova rodada de contas. A pendência é diagnóstico do timeout/revisão do controlador/CI documental desta entrega. Issue333/reserva continuam abertas;ativação/piloto/Publish proibidos.

## Outputs integrais sanitizados desta prova

### pdf.log
```text
{"sha256": "71f5e44dc5b441804eb07ab099b006d4fb119f5c9b86f82b9645492ce711670a", "size_bytes": 1499, "mime": "application/pdf", "pdfinfo_pages": 1, "text_parsing": true}
```
### local-first-failure.log
```text
[0m[1m[31merror[0m: Could not find a matching package for 'npm:zod@3.23.8' in the node_modules directory. Ensure you have all your JSR and npm dependencies listed in your deno.json or package.json, then run `deno install`. Alternatively, turn on auto-install by specifying `"nodeModulesDir": "auto"` in your deno.json file.
    at [0m[36mfile:///dev-server/supabase/functions/standalone-attempt-333/handler.ts[0m:[0m[33m3[0m:[0m[33m19[0m

Stack backtrace:
   0: anyhow::error::<impl core::convert::From<E> for anyhow::Error>::from
   1: deno::tools::run::run_script::{{closure}}
   2: deno::spawn_subcommand::{{closure}}
   3: tokio::runtime::task::raw::poll
   4: deno::main
   5: std::sys::backtrace::__rust_begin_short_backtrace
   6: main
   7: __libc_start_call_main
   8: __libc_start_main@@GLIBC_2.34
   9: _start
```
### local.log
```text
[0m[32mDownload[0m https://europe-west1-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/zod
[0m[32mDownload[0m https://europe-west1-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/zod/-/zod-3.23.8.tgz
[0m[32mInitialize[0m zod@3.23.8
{"result":"PASS","exact_product_imports":true,"validateDocument":"application/pdf","request_schema_and_check":true,"http":409,"status":"pendente","rpc_calls":{"check":2,"authorize":1,"begin":0,"commit":0,"upload":0,"read":0,"receipt":0},"gate_simulation":"injected transport throws42501; not a real SQL gate","envelope_hash_kind":"local JSON hash only; Cloud uses canonical PostgreSQL jsonb hash"}
```
### live-sanitized.log
```text
{"case": "one new Auth fixture", "result": "PASS", "http": 200}
{"case": "canonical manager context", "result": "PASS", "http": 200}
{"case": "immutable prepare fixture seeded", "result": "PASS", "http": 201, "document_size": 1499}
{"case": "capabilities false/false", "result": "PASS", "http": 200, "seconds": 0.978, "sqlstate": null, "status": null, "state": null}
{"case": "owner canonical check before", "result": "PASS", "http": 200, "seconds": 0.186, "sqlstate": null, "status": null, "state": "prepare"}
{"case": "Cloud execute exact PDF gate closed", "result": "PASS", "http": 409, "seconds": 1.168, "sqlstate": null, "status": "pendente", "state": "prepare"}
{"case": "RPC authorize closed42501", "result": "PASS", "http": 403, "seconds": 0.323, "sqlstate": "42501", "status": null, "state": null}
{"case": "owner recovery read-only after", "result": "PASS", "http": 200, "seconds": 0.177, "sqlstate": null, "status": null, "state": "prepare"}
{"case": "entire prepare row unchanged", "result": "PASS"}
{"case": "zero destination effects", "result": "PASS", "audits": 0, "invoices": 0, "objects": 0, "receipts": 0, "state": "prepare"}
{"case": "global logout", "result": "PASS", "http": 204}
{"case": "ban new fixture", "result": "PASS", "http": 200}
{"case": "ban/sessions SQL closure", "result": "PASS", "banned": true, "sessions": 0}
BASELINES {"transactions": {"equal": true, "before_n": 1966, "after_n": 1966}, "transaction_payments": {"equal": true, "before_n": 1417, "after_n": 1417}, "event_forecasts": {"equal": true, "before_n": 2300, "after_n": 2300}, "standalone_invoices": {"equal": true, "before_n": 98, "after_n": 98}, "financial_accounts": {"equal": true, "before_n": 27, "after_n": 27}, "data_entry_settings": {"equal": true, "before_n": 0, "after_n": 0}, "standalone_attempt_settings_333": {"equal": true, "before_n": 0, "after_n": 0}, "standalone_attempt_audit_333": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_sessions": {"equal": true, "before_n": 2, "after_n": 2}, "data_entry_documents": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_previews": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_results": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_storage_receipts": {"equal": true, "before_n": 0, "after_n": 0}, "data_entry_messages": {"equal": true, "before_n": 0, "after_n": 0}, "prior_attempts": {"equal": true, "before_n": 4, "after_n": 4}, "prior_auth": {"equal": true, "before_n": 60, "after_n": 60}, "prior_roles": {"equal": true, "before_n": 83, "after_n": 83}, "prior_profiles": {"equal": true, "before_n": 60, "after_n": 60}, "functions_acl": {"equal": true, "before_n": 22, "after_n": 22}, "table_acl_rls": {"equal": true, "before_n": 303, "after_n": 303}, "policies": {"equal": true, "before_n": 1085, "after_n": 1085}, "storage_objects": {"equal": true, "before_n": 105, "after_n": 105}, "storage_buckets": {"equal": true, "before_n": 2, "after_n": 2}}
```
