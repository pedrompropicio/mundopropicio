# Tarefa90 — pacote final consolidado para revisão/aprovação

## Resultado e ajuste necessário comprovado

Preflight oficial em `preflight.md`: fonte88 abortaria por grants automáticos para papéis técnicos, além deanon/authenticated/service_role. Novo SQL90 deriva integralmente da fonte88 corrigida, resetando ACLs de TODOS não-owner somente nos objetos novos; barreiras de owner/herança/search_path continuam. Nada nos defaults/ACL legados foi mudado. Fonte87/88/89 e provas históricas não regeneradas.

Outro defeito comprovado na leitura: não havia timeout servidor para análise (somente abort do browser). Adicionado prazo60s, propagado ao SDK e ao durablecontrol, mantendo uncertain pósPOST, sem retry. Dois testes com clock controlado, sem esperas reais. Não alterar modelo/limites produto existentes.

## Fontes integrais e ordem futura

1. `supabase/manual/issue333_tarefa90_application.INERTE.sql`: aplicação transacional fechada,2tabelas/RLS/ACLmínima, transitionserviceonly e responsibleowneronly. Cria apenas estado técnico singleton+audit revision1closed; nunca chama provider.
2. `supabase/manual/issue333_tarefa90_application.ROLLBACK-INERTE.sql`: recusa claim ativo; fecha+auditrevision, remove RPCs/control e RETÉM audit intacta. SemCASCADE. Reinstalação após rollback exige revisão específica pois audit existe; não apagá-la para rerun.
3. `supabase/manual/issue333_tarefa90_readback.SELECT.sql`: estado/ACL/owner/RPC/registry/gates, sóSELECT após aplicação autorizada.
4. `DEPLOY-closed-data-entry.diff`: mudanças locais exatas a implantar no futuro, inclusive deadline. Deploy de toda função data-entry com seus imports `_shared/`, mantendoanalysisfalse/providerfalse/uploadfalse/pilotScopedtrue. Não apenas copiar um index sem dependências; manifesto hashes abaixo.
5. `supabase/manual/issue333_tarefa90_restricted_window.INERTE.sql` e rollback: futurofase9nominal600s, duas chavespreparation/assistant_create; preflight0linhas tornaUPDATE79inaplicável. INSERT de duas configurações nominalmente aprovadas, NÃO fixtures/contas/documentos; substituição privadaUUID obrigatória. Tudo INERTE. Não reabresettings globais, writers legados ou adapters. Antes de usar: resolveraceitação8 e autorizardocumentoreal/uso restrito sem inventar limite de faturas.
6. `FUTURE-phase10-gates.INERTE.diff`: altera SOMENTE analysisfalse/providerreviewedfalse para true, APÓSfase9liberada/disponibilidade autorizada. Não aplicado hoje. `pilotScopedtrue/uploadfalse` permanecem e exigem capacidadepreparationnominal válida.
7. `supabase/manual/issue333_tarefa90_responsible_usage.INERTE.sql`: responsável executa SQL próprio com revisão/hash/claim exatos; não é endpoint nem grantbrowser/model. Reopen somente closed+idle+semclaim; close mantém claim e fencerevision; confer elimina claim só depois de conferência explícita e deixa CLOSED. Novaabertura é outra decisão, nunca timer/envflip. Audit sóadmin_action/hashdecisão, semprompt/documento/corpoerro/segredo. Hash é trilha, não prova criptográfica de autorização; a autoridade é executorowner e aprovação controller/Pedro.

Número observado livre: prefixo0203, registryid205esperado. NÃO registado/journal/migrationLive; controller revalida colisão imediatamente antes de mover fonte exata ao canal autorizado. Ferramenta de migration aplica diretamente, sem pausa adicional automática: autorização precisa ocorrer ANTES de invocá-la.

## Budget externo proposto — NÃO executado/autorizado nesta tarefa

Modelo preparado:openai/gpt-6-astra; POSThttps://ai.gateway.lovable.dev/v1/responses, usandoLOVABLE_API_KEY no servidor. Disponibilidade/saldo/permissão NÃO confirmados. Semfallback/modeloalternativo;403/402/404param até responsável, semprobe/retry.

Dados enviados:UMPDF/JPEG/PNG de até5MiB, pedidoaté2000bytes e histórico máximo8turnos/12000bytes. Documento pode conter dados pessoais/empresariais: Pedro deve autorizar esse documento específico; nada real enviado hoje. Storefalse, semtoolsfinanceiras/admin e semrazão/requestmetadata naUI.

Proposta de autorização externa inicial: no máximoUMA chamada,1POST/0retries/semfallback, maxOutputTokens6000, timeoutservidor60s, uma emvooglobal. MáximoUMA é teto operacional supervisionado proposto, NÃO quota monetária implementada;6000tokens não controla input/documentprocessing/preço fixo. Custo não conhecido nem garantido. Após resultado/erro/Stop, fechar janela/controle e não realizar segunda chamada sem autorização. Timeout/Stop pósPOST pode cobrar e mantémclaimbloqueado até conferência. Modeloindisponível continuaCLOSED e nenhumteste para achar alternativa.

## Fase8 — o que artefactos já provam, sem repetir piloto

78-fecho-manual76/77 e baseline local provam relato aprovado, resultado único e revogação histórica; NÃO trazem requestcheck iniciado pósrevogação, paresHTTPsimultâneos ou downloadseparado dosbytesfinals. SHA observado no registro não é SHA de download. Localhandler/PGdoubles demonstram lógica, não transporteLive.

- Checkapósrevogação: local já suporta caminho read-only; artefactos não certificam tempo do request. Exige sessãoreal existente autorizada e caminhoautenticado permitido, ou adiamentoexpresso.
- ExecuteHTTPsimultâneo mesma prévia: artefactos não contêm esse par. Exige prévia/documentoreal autorizado com efeitos explicitamente aprovados, ou adiamentoexpresso; NÃO duplicar piloto/fixture para completar checklist.
- Downloadseparado/SHA: pode ser leitura de documentoreal existente autorizada, sem criar novo; artefactos não contêm bytes+hash de download certificado. Ou adiamentoexpresso.

Para avançar diretamente à liberaçãorestrita9 semnovoensaio, recomendação: Pedro aceitaadiamentoexplícito dos três critérios, mantendo8PARCIAL, sem dizer8concluída. Não inverter9/10.

## Checklist18 honesta

- [x] 1 — concluída anteriormente, sem reexecução90.
- [x] 2 — concluída anteriormente, sem reexecução90.
- [x] 3 — concluída anteriormente, sem reexecução90.
- [x] 4 — concluída anteriormente, sem reexecução90.
- [x] 5 — concluída anteriormente, sem reexecução90.
- [x] 6 — concluída anteriormente, sem reexecução90.
- [x] 7 — concluída anteriormente, sem reexecução90.
- [ ] 8 — PARCIAL; três critérios acima, não dispensados hoje.
- [ ] 9 — release restrito NÃO liberado; patchnominal pronto,identidadeprivada/adiamento8/autorização aplicação necessários.
- [ ] 10 — PARCIAL: análise/adaptador/controle/deadline locais validados;SQL90/deploy/ready/availabilitycustos não autorizados/aplicados.
- [ ] 11 — Gmail fechado.
- [ ] 12 — Drive fechado.
- [ ] 13 — TX/anexos fechado.
- [ ] 14 — BP/Formalidade fechado.
- [ ] 15 — extratos fechado.
- [ ] 16 — bilheteiras fechado.
- [ ] 17 — aceitaçãointegrada pendente.
- [ ] 18 — final pendente.

## Testes90 e verificação

PGoptin90: primeira execução exit1 por runnerpostgres.js que recusaBEGIN solto commax2 (nãoSQL); runner passou a reservar transação `sql.begin`. Segunda execução4PASS/exit0: candidato88falha com defaultstécnicos reais;90 aplica comownerpostgresNONsuperuser e membershipsdireção real;ACLminimais/serviceselect/transition/reponsibledeny;reviewhash/revision/close/confer/reopen/finalizacaotardia;duasconexõesmesmarevision e rollbackauditpreservada. Não repetir baterias88.

Vitest afetados:58PASS/exit0 (2deadline90+21control+26analysis+9SDK), uma execução. Deno checkexit0/runtime2PASSexit0/bundle192módulos exit0;semgateway/modelo. Bundle pode baixar ferramenta de pacote esbuild, não dados/provider. HarnessbuildOK;types/CI do novoSHA aguardam controller. Suite completa não repetida:CI415basejáverde; CI novoSHA verifica default.

## ÚNICO bloco de autorização futura proposta

Pedro aprova após controllerCIverde: aplicar FONTEEXATA SQL90 como próximo número revalidado0203, readbacksACL/registry/hash e deploydata-entryFECHADO (sem Publish). Para uso restrito9: fornecer identificação privada do MESMO utilizadorexistente/empresa, autorizar criação dasDUASchaves600s do patch eUMdocumentoreal escolhido, aceitar adiamentoexpressodos3critérios8 (mantémPARCIAL), preservar autorizaçãohumana/hash/audit e nenhumaoperaçãofinanceira. SomenteDEPOIS9liberada, autorizar atéUMA chamada externa ao modelo/endpoint/dados/limitesdescritos e aplicar patch10+ownerreopencomhashdecisão; modeloindisponível mantémbloqueio. Publish NÃO incluído; pede autorização própria. Nada disso executado90.

Dependências materiais somente: autorizaçãoDDL/deployfechado; númerorevalidado/executor; identidadeprivada e escolha documentoreal/adiamento8 para9; disponibilidade/custoautorizado para10. Nenhuma nova preparação genérica. ResíduosAuthStorage continuamlimpezamanualadiada.
