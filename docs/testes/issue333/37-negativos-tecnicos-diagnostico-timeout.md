# #333 — Prova37: negativos técnicos e diagnóstico limitado do timeout

Entrega 2026-10-18 01:50:46 UTC. Início observado 18/10/2026 01:44:37 UTC; prova Live terminou antes de 01:47:59 UTC. HEAD recebido `148fdb0b516eb3348db58e2f62007e665e8a0757`, checkout limpo, ancestralidade de8c0c3e29 comprovada. GitHub=Lovable/agentFinished/CI39086983574 success confirmados pelo controlador. Intervalo restante dispensado expressamente por Pedro nesta tarefa. Reserva atualizada antes dos testes; único executor, sem subagentes. #333 aberta/reservada; #323 e DECISIONS intactas.

## Âmbito e fixtures
Uma nova conta .invalid AuthAdmin email_confirm:true, senha/JWT apenas em memória, sem email/invite/magiclink. Papel manager mínimo apenas na nova conta; empresa existente sem alteração. Uma reserva prepare sintética foi indispensável para a listagem populada: envelope/hash canónico calculado por SELECT, destino inexistente, sem objeto/recibo/fatura. Inventário e baselines integrais apenas em /tmp/issue333-proof37/private. Nenhuma conta anterior reaberta; nenhum dado financeiro escrito, mesmo fictício. Zero deploy/DDL/config/permissões globais/flags/Publish/Meta/emails/crons.

## Matriz única consolidada
39 verificações Live: 36 PASS, 1 FAIL de fixture, 2 INCONCLUSIVO. Mais 6 verificações PostgreSQL local PASS; não contam como Cloud.

```text
caso | observado | resultado
canonical manager context | 200; company/role match, IDs omitted | PASS
capabilities authenticated | 200;  | PASS
endpoint populated own list | 200; exact single own fixture, canonical operation/company, no foreign IDs | PASS
RPC populated own list | 200; exact same own fixture | PASS
endpoint different operation empty list | 200;  | PASS
RPC different operation empty list | 200;  | PASS
endpoint prepare closed | 409; valid schema; canonical RPC gate certified separately | PASS
RPC prepare gate | 403 SQLSTATE 42501;  | PASS
endpoint execute closed | 422; valid PDF; authorize gate certified separately; no upload | FAIL
RPC authorize gate | 403 SQLSTATE 42501;  | PASS
RPC begin gate | 403 SQLSTATE 42501;  | PASS
RPC commit gate | 403 SQLSTATE 42501;  | PASS
endpoint confirm closed | 409; valid schema, gate reached before state; not a completed prior result | PASS
RPC confirm gate | 403 SQLSTATE 42501;  | PASS
authenticated private standalone_attempts_333 | 403 SQLSTATE 42501;  | PASS
authenticated private standalone_attempt_audit_333 | 403 SQLSTATE 42501;  | PASS
authenticated private standalone_attempt_settings_333 | 403 SQLSTATE 42501;  | PASS
authenticated private data_entry_sessions | 403 SQLSTATE 42501;  | PASS
authenticated private data_entry_documents | 403 SQLSTATE 42501;  | PASS
authenticated private data_entry_messages | 403 SQLSTATE 42501;  | PASS
authenticated private data_entry_previews | 403 SQLSTATE 42501;  | PASS
authenticated private data_entry_results | 403 SQLSTATE 42501;  | PASS
authenticated private data_entry_storage_receipts | 403 SQLSTATE 42501;  | PASS
authenticated private data_entry_settings | 403 SQLSTATE 42501;  | PASS
Storage authenticated read data-entry-staging | 400 SQLSTATE NoSuchKey; no bytes returned; staging existing technical object | PASS
Storage authenticated list data-entry-staging | 200; empty/denied scoped list, no global listing | PASS
Storage authenticated read standalone-invoices | 400 SQLSTATE NoSuchKey; nonexistent isolated path: denial/absence cannot prove existing-object isolation | PASS
Storage authenticated list standalone-invoices | 200; empty/denied scoped list, no global listing | PASS
Storage authenticated signed URL staging | 400 SQLSTATE NoSuchKey; no signed URL emitted or persisted | PASS
correct owner check | 200; technical prepare snapshot; no invoice result | PASS
nonexistent RPC check | 403 SQLSTATE 42501;  | PASS
wrong operation RPC check | 403 SQLSTATE 42501;  | PASS
forged user header | 409;  | PASS
forged company header | 409;  | PASS
wrong hash direct RPC once | None; no client retry; bounded 20s; read-only check | INCONCLUSIVO
wrong hash endpoint once | None; single bounded read-only request, no resend | INCONCLUSIVO
global logout | 204;  | PASS
ban new account | 200;  | PASS
ban verified and auth.sessions zero | SELECT; SELECT; access JWT instant revocation not asserted | PASS
PG17 local: wrong hash 40001 | 40001 | PASS
PG17 local: missing ID 42501 | 42501 | PASS
PG17 local: prepare closed 42501 | 42501 | PASS
PG17 local: authorize closed 42501 | 42501 | PASS
PG17 local: correct owner | 0 | PASS
PG17 local: second connection row lock after error | 0 | PASS
```

## Falha concreta de fixture: execute endpoint
O documento técnico enviado tinha 39 bytes (comprimento recontado dos bytes exatos), cabeçalho PDF e EOF, mas não continha objeto/startxref nem o mínimo de64 bytes do validador. O endpoint devolveu422 antes de authorize. A premissa do runner “valid PDF” estava errada; FAIL conservado no output, não tratado como recusa de gate. Não é falha demonstrada de produto. A conta foi encerrada somente depois de todos os grupos independentes e do diagnóstico.

Authorize/begin/commit via RPC deram403/42501 com mensagem de operação não ativada. Prepare e confirm endpoint deram409, acompanhados de gate42501 nos RPCs correspondentes. Não são schema400. Confirm foi construído com schema válido e reserva prepare: o gate recusa antes da condição completed, não prova confirmação positiva. Execute ponta-a-ponta até ao gate permanece NÃO PROVADO por esta fixture. Alteração mínima do ensaio: usar PDF técnico com objeto/startxref/EOF e comprimento>=64, vinculado na reserva desde a criação; não alterar o validador nem a reserva imutável. Sem nova conta ou reenvio efetuado nesta tarefa após o finally.

## Storage
Authenticated não recebeu bytes nem URL assinada; listagens limitadas ao caminho técnico deram[]. O objeto staging existente foi posteriormente relido por service:200,94bytes, SHA256 igual à fixture técnica da prova22. Isto distingue ocultação authenticated de objeto ausente nesse caso. O caminho standalone-invoices desta prova é inexistente:NoSuchKey/[] não provam isolamento de objeto existente nesse bucket. Acesso positivo service ao staging respeitou o contrato existente e não abriu segurança; acesso positivo browser não está disponível. Nenhum upload nem novo objeto.

## Timeout: evidência e limites
1. A comparação `p_hash IS DISTINCT FROM v.envelope_hash` JÁ EXISTE no corpo Live e lança40001. Não é comparação ausente. Comparação md5(prosrc) executada NO SERVIDOR confirmou ambos os corpos iguais byte a byte aos corpos0191. O retorno textual do leitor redigiu `ANY(allowed)` como[REDACTED]; essa redação não é divergência Live. Wrapper textual foi exato.
2. Pedido RPC HTTP bruto requests, sem mecanismo de retry cliente: uma chamada read-only com hash errado excedeu20.031s. Endpoint: uma chamada read-only excedeu20.033s. Sem resposta HTTP, ambos INCONCLUSIVO, não recusa comprovada.
3. pg_stat_activity/pg_locks observados três vezes durante o pedido RPC, filtrando somente UUID da reserva/conta desta prova, sem retornar queries: nenhum backend identificável. Limite: parâmetros preparados podem não aparecer em query; não se conclui ausência de lock nem número de retries. Telemetria agregada específica da função/janela retornou[]. Não há trace de gateway/PostgREST acessível que comprove retry40001.
4. PostgreSQL17.9 local sem credenciais Cloud, socket Unix/listen_addresses vazio: fixture de schema local documentada + SQL0190–0192 congeladas, wrapper Live exato; internal0191 exato, confirmado igual no servidor, pois retorno textual estava redigido. Hash errado lança40001 em0.027s; inexistente42501 em0.0332s; gates42501 em~0.03s; owner prepare OK. Uma segunda conexão conseguiu FOR UPDATE após o erro com lock_timeout250ms. Zero fatura/auditoria/settings locais. Auth/roles/helpers de identidade são fixtures locais; gateway/PostgREST/Edge não existem neste teste e não são alegados como reproduzidos.

Conclusão: recusa SQL imediata comprovada localmente; timeout ocorre no percurso Cloud de erro40001, mas camada causal NÃO DEMONSTRADA. Retry automático de serialização no gateway/PostgREST é hipótese compatível, não facto; lock/rede/transporte não eliminados pela visibilidade disponível. Fonte divergente e comparação ausente foram afastadas pelas comparações no servidor. Primeira tentativa de initdb falhou no runuser do sandbox; repetição isolada com setpriv UID1000 passou, sem mudar asserts/SQL.

## Baselines efetivamente comparados
22 componentes iguais por count+hash agregado de conteúdo antes/depois: financeiro(1966TX/1417pagamentos/2300BP/98avulsas/27contas), settings0/0, audit0, CORE sessions2/documents0/previews0/results0/receipts0, anteriores attempts3/auth59/roles81/profiles59,22funções com corpos+ACL,311tabelas ACL/RLS,1276policies,105objetos dos dois buckets,2buckets. Igualdade ACL baseada em comparação real, não ausência de DDL.

Alterações próprias separadas: uma conta nova banida, membership próprio mínimo e uma reserva prepare; destino0faturas, audit0, objetos0. Fixtures anteriores e Storage preservados. Capabilities authenticated antes false/false e service depois200 false/false. A primeira chamada final usou nome incorreto capabilities(plural) e deu404; chamada corrigida capability(singular) deu200 false/false; nenhuma flag alterada.

## Encerramento
Logout global204; ban200; SELECT banned=true e auth.sessions=0. Sem alegar revogação instantânea dos access JWT. Não apagar fixtures. Conta encerrada após todos os grupos independentes, apesar do422 e timeouts.

## Proposta única INERTE (não executada)
Revisão do controlador dos outputs e pedido de trace interno Cloud do erro40001, incluindo limite/retry e correlação do pedido sem PII. Se confirmar classificação de conflito de aplicação como serialização, preparar UMA migração nova, nunca editar0191, para diferenciar somente a divergência de hash de check por erro não retryable e manter recusas owner/company/operação inalteradas; provar42501/40001/conflito e locks localmente antes de qualquer autorização de aplicação. Em futura prova técnica especificamente autorizada, usar uma fixture PDF válida desde a reserva e comprovar execute bloqueado antes de upload/efeitos. Não é autorização de nova conta, deploy, migração, piloto, allowlist, flags ou Publish. Sem causa infraestrutura demonstrada, não aplicar esta hipótese como correção automática.

CI anterior confirmado; CI documental desta entrega ao controlador. Sem aceitação E2E ou produto ativo.
