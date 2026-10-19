# Tarefa87 — controlo provider e claim global, entrega LOCAL/INERTE

## Coordenação e fontes
Autorização Pedro19/10/2026 01:25Fortaleza; controller confirmou agentFinishedtrue, HEAD GitHub/Lovable460cb2e55c80caa8cb7c61efe7a0986d74bceab2 iguais e CI411 run39199050205 quality117887987678SUCCESS antes do dispatch. Regra329 lida. Durante o trabalho os commits automáticos avançaram localmente; remoto93ad6a82 era ancestral do localb87ca0dc, não havia commits exclusivos remotos. Novo HEAD/CI requerem confirmação controller.

Lidos: docs/INDEX.md, docs/QUADRO.md, AGENTS.md raiz, supabase/functions/data-entry/AGENTS.md, mem://features/document-entry-assistant, .lovable/memory/features/document-entry-assistant.md, docs/testes/issue333/86-pausa-provider-DESENHO-INERTE.md, analysis-service/index/analysis-stream, issue333-ai/provider/responses/run-id, testes85/86 e runners PostgreSQL locais. Plano específico aprovado e arquivado na pasta .lovable/plan/.

## Fontes completas e diff
- `supabase/manual/issue333_tarefa87_provider_control.INERTE.sql`: duas relações novas e uma RPC service-only; não registada no canal migrations, sem número020x.
- `supabase/manual/issue333_tarefa87_provider_control.ROLLBACK-INERTE.sql`: lock e recusa com claim pendente antes de remover exclusivamente os objetos novos; sem CASCADE. Preservação/exportação da trilha técnica antes de eventual rollback real precisa revisão independente; rollback testado apenas localmente.
- `supabase/functions/_shared/issue333-ai/control.ts`: contrato, validação de resposta, adapterRPC e execução durável.
- `analysis-service.ts`, `index.ts`, `provider.ts`, `responses.ts`: integração no fluxo existente; gatesupload/analysis/providerfalse, nenhuma autorização nova ao browser/modelo.
- `src/test/data-entry-control87.test.ts`, testes85 adaptados ao contrato obrigatório; runnerSQL separado `docs/testes/issue333/provider87/`.
- `87-diff.diff`, `87-hashes.sha256`, `87-outputs.md`: diff integral, hashesSHA256 e comandos/output sanitizados locais.

## Garantias e limites
Singleton integração/workspace impede bypass por empresa. Não depende de Map local. RPC bloqueia linha e exige revision/claim exatos; revisões retornam strings, sem perda bigint. Nenhum endpointadmin/reopen/resume; aplicação do SQL nasce closed/enabledfalse/reviewedfalse. O setup ready existe SOMENTE nos testes descartáveis, não em operação publicada.

Leitura prévia nega configuração ausente/malformada/erro antes dos headersSSE. Claim é obtido antes do SDK/chave/headersprovider; transporte revalida contexto/revision antes de POST. Uma execução global em voo através de conexões/isolates; callbacks/processo local só descrevem transporte, não concedem autoridade.

Trilha persistida: revision, claim aleatório não vinculado a pessoa/documento, etapa, código público validado, statusHTTP e timestamp servidor. Sem owner/tenant/request/prompt/documento/corpoerro/segredo/IP/run_id. Revisão e update/audit são atómicos. PUBLIC/anon/authenticated sem acesso; service_role sóSELECT nas relações e EXECUTE naRPC; sem UPDATE direto. Ownerpostgres e search_pathpg_catalog,public comprovados localmente.

AntesPOST: falha/cancelamento conhecidos permitem limpar apenas claimclaimed/revision exatos. Após marcaçãoPOST, crash mantém claim; network/EOF sem response.completed/5xx/cancelamento mantêm uncertain+unavailable, sem expiração/retry. Perda de respostaRPC de post/finalização é failclosed, sem nova finalização automática. Uma marcaçãoPOST pode ocorrer sem envio efetivo: conservador deliberado, exige conferência, não prova de cobrança.

402→paused_credit;403→denied_provider;404→unavailable persistidos antes de expor erro público, sem retry/probe/fallback. HTTP200 com recusaSDK/JSON inválido e término comprovado registra invalid_response e afeta somente aquele pedido. Recusa semântica em texto válido no âmbito documental é resposta candidata, nunca autorização; não tentar adivinhar recusa por palavras. HTTP4xx restante registra http_failure sem retry automático. HTTP429 finaliza pedido sem timer; eventual nova ação humana não é retry automático. HTTP5xx é conservadoramente incerto.

PausaSQL mantém claim; revisão nova impede finalização tardia. Finalização não escreve ready/reenabled e não limpa outro claim. Revalidação contexto/revision antes/depois finish descarta resposta obsoleta. Pausa entre última validação e leitura humana não pode retrair pedido já aceite externamente: nenhuma promessa de atomicidade externa, zero faturação ou stop instantâneo.

Stop propaga AbortSignal, não garante zero cobrança.6000tokens limita saída, não orçamento monetário; não implementada quota financeira dura. Bundle experimental não equivale runtime hospedado ou deploy.

## Testes e exitcodes
1. Regressões85/86 iniciais:39PASS,exit0.
2. Novos contratos+SDK doubles finais:21PASS; regressões39PASS; total60PASS,exit0.
3. PostgreSQL real descartável: primeira tentativaexit1 (uid65534 ausente), corrigido runner para OSuser1000 já existente; sem criação de contas. Segunda falha localexit1 por wildcard incluir testeDeno, corrigida seleção exata do runnerPG, sem skip. Final20PASS,exit0.
4. Deno check0, runtime87+86 2PASS/0FAIL exit0, bundle191módulos exit0. Script sanitiza env e usa fetchdoubles; nenhuma chamada real a modelo/gateway.
5. Suite default 1:1648PASS/1FAIL/6SKIP/11TODO,exit1 (deadlineproof60). Suite default 2:1651PASS/1FAIL/6SKIP/11TODO,exit1 (timeoutcheckpoint66). Não alterados esses testes/limites nem CI.
6. Isoladosproof60+checkpoint66:23PASS/1FAIL deadlineproof60; execução anteriorproof60 dentro dos pertinentes6PASS. Flutuação registrada, não ocultada.
7. Mesma suite completa com `--maxWorkers=2`:1652PASS/6SKIP/11TODO,193ficheirosPASS+2skip,exit0. Opção só no comando local, configuraçãoCI intacta. Isto NÃO certifica CI GitHub.
8. Harness automático: buildOK nos registos posteriores às alterações de código. TypecheckTS/Deno reportado pelo harness/check; não executar build/tsgo manual em paralelo ao harness. CItypes no novoSHA ainda depende controller.

PostgreSQL cobre backendPIDs distintos, um vencedorclaim, dois adapters concorrentes/uma chamada, closed/ausente, pausas402/403/404 noutra conexão, revision/finalização tardia, cancelamento antes/depois, crash/reconexão, ausência de lease, códigos inválidos, ACL/RLS/owner/search_path, troca de contexto, análise real→reporthash e rollback. Cluster socketUnix exclusivamente local criado/removido; opt-inISSUE333_LOCAL_PROOF=1, requisito ausente falha, sem PGexterno/browser/tmpbrowser obrigatórioCIdefault.

## Checklist18 — sem reexecutar provas anteriores
- [x]1–7 concluídas pelo controller anteriormente; esta tarefa não as repete.
- [ ]8PARCIAL: checkapósrevogação, HTTPsimultâneo mesma prévia, download separado/SHA continuam pendentes e não dispensados.
- [ ]9release restrito NÃO liberado.
- [ ]10PARCIAL: análise+controle durável local entregues; SQLaplicado/configuração/provider/runtimehospedado/provaexterna/conferência/reabertura pendentes.
- [ ]11Gmail.
- [ ]12Drive.
- [ ]13TX/anexos.
- [ ]14BP/Formalidade.
- [ ]15extratos.
- [ ]16bilheteiras.
- [ ]17aceitação integrada.
- [ ]18final.

## Dependências antes de aplicar/ativar
Controller revisar fontes/hashes/rollback/ACL e escolher númeroLive sem colisão0202; autorização própria de aplicação e conferência emLive; desenho futuro auditado de conferência/reabertura pelo responsável semUI/envflip; validaçãoSDK/runtimehospedado/provider externa sob autorização de custos; fase8lacunas/fase9release autorizada. Confirmar HEADintegrado eCIqualitySUCCESS novo antes próximo dispatchnão corretivo/Publish. ResíduosAuthStorage manuais adiados, não repetir81/83.

Zero consultas/escritasCloud/DDL_DML/migration/deploy/Publish/crons/chamadaspagas/segredos/documentosreais/fixturesERP; CAPI/portal-track/testes322/reservaClaude/#323/AGENTSraiz/DECISIONS preservados.