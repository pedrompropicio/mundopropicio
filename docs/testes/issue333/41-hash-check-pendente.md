# #333 — Prova41: classificação hash-check, PENDENTE de revisão/aplicação

Entrega 2026-10-18 02:23:28 UTC. Base autorizada6070edb51798ef19d5e547780d5f6f0ea43dd264; HEAD observadoafcf1100218fafe39e3ae83ff4b0cabbadd280a1, ancestralidadeexit0. Issue aberta, comentários6244519816/6244533781/6244572107 e checklist6244398679 lidos via API pública. Endpoint github-issues sem sessão devolveu401; não criada conta para contornar. CI base39088634742success e intermédio39089161599success/0d812a380 confirmados por API; CI do HEAD final ainda não disponível.

## Mudança mínima e semântica
O hash imutável divergente de check é recusa de conferência do pedido; não representa, por si, serialização transitória.42501 mantém a recusa já usada para tentativa indisponível/identidade/operação; não relaxa validação e evita classificar esta recusa como transaction rollback40001. RPC autenticada passa de500 para403; endpoint real mantém409pendente, sem contrato JSON novo, retry ou efeito. Apenas p_action=check muda; authorize/begin/commit/confirm continuam40001 quando o gate local permite alcançar o conflito.

SQL rastreado em supabase/manual/20261018_issue333_hash-check.PENDENTE.sql, deliberadamente FORA do journal/registry aplicado; não é migração aplicada. Rollback concreto no ficheiro homónimo ROLLBACK.PENDENTE.sql.0191 histórica intacta. O DO exige md5 da fonte exata e uma ocorrência única, usa pg_get_functiondef + CREATE OR REPLACE via EXECUTE, e compara oid/owner/ACL/config/SECDEF/volatilidade/argumentos/retorno/linguagem; qualquer desvio aborta55000 atomicamente. Nenhum GRANT/REVOKE/DROP/setting/data write. Não criar0193 manual nem tocar journal; após revisão o mecanismo oficial gera a migração rastreada.

Fonte Live conferida por SELECT antes/depois:md5(prosrc)=91f7e9690436c59666c800fb63eb344c; ACL/SECDEF/search_path iguais. Corpo candidato=b748a720b4cb1f988a927b5577e511dd. Fonte e manifesto completo em41-manifest.json; diff inteiro em41-function.diff.

## Documentação primária e limites causais
- PostgreSQL17: https://www.postgresql.org/docs/17/mvcc-serialization-failure-handling.html —40001 serialization_failure, aplicação deve estar preparada para repetir a transação completa; “PostgreSQL does not offer an automatic retry facility”. Página efetivamente obtida.
- PostgREST16.4 documentação oficial: https://github.com/PostgREST/postgrest/blob/v16.4/docs/references/errors.rst —40*→500;42501→403 autenticado/401 anónimo. Site stable respondeu429 nesta sessão; fonte oficial raw acessível obtida. Documentação citada NÃO prova retry automático PostgREST ou gateway.
- PostgREST16.4 binário oficial instalado apenas/tmp;PG17.9 local. Não é versão/infraestrutura Cloud nem reprodução da causaCloud.

Sabemos:SQL local imediato,fonteLive igual,Cloud anterior sem resposta até20s. CausaCloud continua NÃO DEMONSTRADA; nenhuma chamada hashCloud repetida/conta criada/DDL/deploy/Publish nesta entrega. Trace pedidos antigos01:44–01:48UTC continua alternativa diagnóstica pelo controlador. Reclassificação é correção semântica defensiva, não promessa de resolver timeout.

## Matriz antes/depois/reversão
PostgreSQL17 real:22/22PASS, socket Unix/listen_addresses vazio,pgcrypto,0190–0192 bytes exatos. Identidades/helpers schema fixture, não AuthCloud. Todas as tabelas public/auth count+hash, relaçõesACL/RLS/policies e funçõesACL/metadata comparadas efetivamente em cada caso; corpos restantes iguais. Uma reserva fictícia prepare, destino inexistente;zero faturas/audits/recibos/financeiro. Gates sem linhas; gates true apenas dentro de transações locais que abortam e restauram integralmente.

- Hash divergente antes:40001 imediato(<2s assert);depois42501 imediato(<2s);rollback40001.
- Hashnull:42501depois,sem sucesso;inexistente/owner/tenant/operação/sessão errados42501.
- Check correto:JSON completo igual antes/depois/rollback;stateprepare,nenhuma gravação/audit.
- Prepare/authorize/begin/commit/confirm com gatesfechados:42501,zero efeitos.
- Outros hashes authorize/begin/commit/confirm:40001preservado;commitsemreadback40001preservado;rollback total.
- Duas conexões:FOR UPDATE existente bloqueia check;release→42501;segunda conexão readquire lock em250ms. Locks não removidos. Read-only significa SEM INSERT/UPDATE/DELETE/audit, não transação SQL READ ONLY (FOR UPDATE mantido).
- Reaplicar candidato ou rollback em fonteerrada:55000;rollback repõe bytes/ACL/retorno;candidate reaplicável localmente.

PostgRESTlocalHTTP6observaçõesPASS:
{"scope": "LOCAL PostgREST16.4 + PostgreSQL17.9; NOT Cloud", "rows": [{"case": "local correct before", "http": 200, "sqlstate": null, "seconds": 0.0179}, {"case": "local divergent before", "http": 500, "sqlstate": "40001", "seconds": 0.0081}, {"case": "local divergent after", "http": 403, "sqlstate": "42501", "seconds": 0.006}, {"case": "local anonymous after", "http": 401, "sqlstate": "42501", "seconds": 0.0055}, {"case": "local correct after", "http": 200, "sqlstate": null, "seconds": 0.0059}, {"case": "local divergent rollback", "http": 500, "sqlstate": "40001", "seconds": 0.007}], "row_and_acl_unchanged": true, "result": "PASS"}

Endpoint REAL com transporte SIMULADO42501:3/3PASS;check/execute409pendente,1RPCcheck,0snapshot/upload/read/receipt/authorize/begin/commit. Execute recusa antes de validar bytes; não repete prova39/PDF e não é Cloud. Não mudou código do endpoint.

Inventário sem ampliar:hashconfirm40001;confirmresultadoanterior/intenção40001;editbefore40001;commitreadback/destino40001;data_entry_attempt_333 snapshot40001 (alcançável também comcheck) permanece intacto. CORE data_entry_commit hash/versão/estado40001 permanecem intactos. Só o ramo interno explicitado é alterado.

## Qualidade
Vitestantes1381PASS+1skip+11todo;depois1384PASS+mesmos1skip/11todo;zero falhasnovas. PG22PASS separado. tsgo app exit0. Build automático mais recente02:19:57UTC “build OK”;não executado build manual. CI intermédio verde não substitui CI final;consultar após autocommit. Outputs integrais em42-outputs-prova41.md,sem segredos/IDsfixture/credenciais. Scripts privados/instalação/configJWT local só/tmp;nenhum arquivo.env lido.

## Plano Live único e finito — NÃO EXECUTADO
1 Controlador revê41-function.diff,SQL+rollback+manifesto e CI final;revalidarHEAD/ancestralidade/reserva e nenhuma outra frente.
2 Baselinesantes count+hash com filtros idênticos:financeiro/settings/CORE/attempts/audit/receipts/Storage;fonteMD5 e funçõesACL/metadata efetivas/tabelasRLS/policies;guardar privados/tmp. Fonte diferente=PARAR.
3 Se aprovado concretamente,no âmbitoPedro:submeter SQLPENDENTE inteiro ao lov_database--migration;registar caminho retornado e compararfonteMD5candidata+ACLmetadata;semdeploy/Publish/flags. Rollback se verificaçãofalhar:submeter ROLLBACKPENDENTE como NOVA migração oficial;sem editar0191/semDROP/limpeza.
4 Só após aplicação/verificação:UMAcontatécnica futura.invalid AuthAdmin sem emails,senha/JWTmemória,papelmínimopróprio/contextocanónico;UMAreserva prepare imutável semdestino/objeto. Capabilitiesfalse/false echeckcorreto antes. HasherradoSÓNOFINAL:UMrequestRPCeUMendpoint,timeoutfinito semretry;esperadoRPC403/42501,endpoint409pendente;registar latência/códigos. Sem faturas/flags/upload/receipt. Sem nova rodada automática.
5 Qualquer resposta incerta:conferir somente leituras de state/destino/audit/receipt/Storage e baselines;semreenvio. Finally obrigatório em qualquerresultado:logoutglobal,banSÓnova conta,SELECTsessions0;preservarfixtures. Separar novosAuth/role/attempt das baselinesanteriores.
6 Compararbaselinesdepois realmente;relatar PASS/FAIL/INCONCLUSIVO e fonte/ACL iguais. Mesmo PASS não comprova causa do timeout antigo, fase6inteira ou ativação/piloto.

#333 aberta/reserva mantida;#323/DECISIONS/outrasfrentes preservadas. Próximo passo executável: revisão concreta do diff e CI final pelo controlador; não nova tarefa de contas antes dessa revisão.
