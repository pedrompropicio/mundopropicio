# #333 — Prova50: dois checks HTTP Live fechados

UTC 2026-10-18T03:09:30.364768+00:00. Base autorizada244e5a663f1e662c6816a47329624f5b06d3130e; CI39092213151completed/success confirmado por API. Pedro autorizou esta execução única coordenada; executor agente, controlador preparou DB pelo seu conector. Sem subagentes/AGENTS/DECISIONS/#323 alterados.

## Fluxo único
Preflight SELECT: email/marcador não existentes, fontes MD5 atuais iguais49, flagsCORE/attempt0, internalEXECUTE anon/auth/servicefalse.16 baselines reais count+hash antes. UMAconta nova AuthAdmin.email_confirmtrue/metadataempresa+marker exatos/full_name fictício, senha aleatória somente memória, sem login antes de preparação; nenhum email/invite/magiclink. Runner privado espera máxima300s; readiness consultas read_query somente própria role/attempt. Controlador preparou exclusiva membershipeditor+UMAreservaprepare; agente NÃO escreveu roles/perfis/reserva. Preparação observada03:07:52UTC, dentro do limite.

Envelope1499B/PDF39SHA histórico, payload0EUR/IVA0, scanner_create, owner/empresa/path canónicos, destino inexistente; hash canónico validado por SELECT digest(envelope::text). Não enviou bytes nem repetiu execute39. Login MESMAconta/contextoRPCeditor/empresa correta; capabilitiesfalse/false; UMcheck correto200 prepare.

## Resultado Live
Exatamente UM RPC hashdivergente: HTTP403/SQLSTATE42501,0.148s.
Exatamente UM endpoint hashdivergente: HTTP409/statuspendente,0.858s.
Timeout20s por request, sem retries. Ambos PASS; nenhum timeout/incerto. Não prova a causa dos timeouts40001 antigos.

Finalmente logoutglobal204, banSÓnova conta200; SELECTauth.sessions=0 e bannedtrue. Senha/JWT descartados da memória no finally; nenhum ficheiro de senha criado. FixturesDB preservadas, sem deletes/reabertura/outra conta.

## Conferência somente leitura
Reserva completa observada idêntica antes/depois: prepare/envelope/hash/path/owner/empresa/intenção1/priorNULL/resultadoNULL/conclusãoNULL; nenhum authorize/begin/commit/execute/upload. Destinationinvoice0/Storageobject0/receipt0/attemptaudit0. Auditoria administrativa da membership tem2registos (create inicial + updateeditor), segregados expressamente, nunca desligada.
16grupos count+hash iguais com filtros correspondentes: transactions,payments,forecasts,accounts,invoices,receipts,storage,core,attempts,attemptaudit,settings,profiles,roles,audit,aclrls,policies. Excluídos somente perfil/role/reserva novos e auditoria dessa role; restantes integrais iguais. MD5internalb748a720b4cb1f988a927b5577e511dd/audit9509fe109550c9e0367fcbe4ffc661c5/authuid/currentcompany, ACL/owner/config e privilégios efetivos preservados; flags0/0, capabilitiesfalse/false.

## Qualidade e limites
24PG locaisPASS novamente; não contam como Cloud. Sem produto/DDL/deploy/Publish/ativação/financeiro/envios/CAPI/crons. CIbase success, CIdocumental final ainda não observada. Esta prova fecha SOMENTE os dois HTTP pendentes; fase6 inteira/E2Epositivo/produtoativo NÃO concluídos.

Próximo passo: controlador rever esta prova sanitizada/CI documental e consolidar checklist333, sem nova rodada de contas. Issue/reserva mantidas para revisão; causa antiga não demonstrada.
