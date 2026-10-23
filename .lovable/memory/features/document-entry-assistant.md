---
name: Assistente de Entrada de Dados
description: Gates fechados, snapshot vinculado, labels opcionais sem fuga tenant e recuperação read-only
type: feature
---

## Etapa 2 (17/10/2026 21:40 UTC)
Código integrado e 3 funções implantadas; gates fechados. Clientes ainda legacy mantêm legacy_untracked com contexto canónico válido; tentativa reservada ou incerta nunca recorre ao writer antigo. Nova intenção só para tentativa concluída e mais recente da mesma família (empresa/owner/operação/hash/intent_seq), por confirmação explícita; servidor é autoridade final. Resposta perdida exige conferência read-only e bloqueia repetição, mesmo após mudar seleção. Revisão da UI e aceitação ponta-a-ponta pendentes; certificação negativa não é aceitação completa. Ativação/Publish não autorizados.

Leitura de capacidades é exclusivamente service-only, após Auth e contexto canónico no endpoint; ausência/erro/malformado mantém false. Ler capacidades nunca autoriza mutação nem abre preparação/execução. Settings e gates internos continuam sem acesso externo; aplicar o leitor não autoriza flags true, piloto ou Publish.

## Testes autenticados Live (17/10/2026 23:20 UTC)
Matriz 37/37 PASS com 4 contas fictícias .invalid (banidas no fim) e 1 sessão técnica: capabilities false/false, headers forjados 409, anon 401, RPCs/gates 42501, leitura owner read-only OK, isolamento owner/empresa/papel confirmado, storage sem visibilidade (RLS oculta objetos). Certificação negativa não é aceitação ponta-a-ponta: concorrência/retoma/execução positiva exigem proposta separada. Ativação/Publish não autorizados.

## Limite de aceitação e reserva preparada
Ensaios locais autorizados não abrem operações Live. Reserva preparada só executa com ação explícita do owner/contexto canónico e bytes originais verificados; nova intenção ou seleção não autorizam efeitos. Resultado incerto exige conferência read-only, nunca writer legado. Integração DOM não é Chromium React completo; relatório parcial ou CI geral verde não aprovam aceitação integral.


A autorização da reserva mostra dados legíveis do envelope confirmado no servidor, vinculados ao owner/empresa/operação/hash; não usa o formulário antigo. Tentativas authorized/inprogress só permitem conferência read-only, nunca novo upload/begin/commit. Provas locais Chromium não autorizam deploy/ativação/piloto/Publish e não substituem Cloud.

Labels de snapshot são opcionais: erro/coluna ausente nunca perde o envelope nem inventa nomes. Label de pagador só após membership canónica na empresa verificada; ID do envelope nunca autoriza revelar nome de outra empresa. Deploy de leitura com gates fechados não autoriza faturas, piloto ou Publish; piloto futuro exige isolamento efetivo por owner/empresa além do gate por operação.

## Recusas e limites de prova
Timeout sem resposta é inconclusivo, nunca recusa comprovada nem autorização para repetir efeitos. O hash divergente já é validado em0191 e lança40001; não assumir comparação ausente nem alterar ordenação SQL por hipótese. Prova37 distingue recusa SQL local imediata do timeout Cloud sem causa de infraestrutura demonstrada. Fixture inválida422 não prova gate de execute; preservar falha e preparar bytes válidos desde a reserva sem relaxar validação. Baselines ACL/RLS/policies devem ser comparados efetivamente, não inferidos da ausência de DDL. Gates continuam fechados; sem piloto/ativação/Publish.

Preflight técnico obrigatório antes de consumir uma conta: PDF estrutural lido por parser e validateDocument exato, bytes/hash/size preservados desde a reserva, handler real com authorize recusado e espias sem upload/read/receipt/commit. Recusa execute409 com recuperação read-only não abre operações nem resolve timeout40001; fechar a lacuna negativa não equivale a fase6 concluída ou produto ativo.

Hash-check é semântica sócheck,semconcluir causatimeoutantigo. Autorização específicaPedro18/10/2026 02:33UTC para migraçãooficial/UMAconta/reserva/UMRPC+UMendpoint negativo;ACLreaispreservadassemGRANTsuposto. Finallylogoutquandohouver sessão/ban sócontanova/SELECToficialsessions0. Falhafixture nãoautoriza reabrirconta/nova rodada;retomada exige decisão explícita. Semflags/faturas/upload/deploy/Publish;fase6/Issue/reservaabertas.

## Fase11e (20/10/2026)
Pesquisa/leitura Gmail própria ativa no modal com upload fechado: gmail_read lê só a mensagem escolhida, texto simples ou HTML→texto sanitizado (200KB/4000 chars/profundidade 6/15s, truncagem sinalizada), nunca marca lido nem escreve. Importação de anexo continua bloqueada pelo envio documental fechado. Gates análise/upload false e control rev16 closed preservados; deploy só data-entry.

## Fase11f (20/10/2026)
Pesquisa de assunto flexível por omissão (variações explicáveis, exato primeiro), opção só-exata; recuperação limitada ≤4 consultas fixas em AND com período/remetente, cobertura incompleta sempre sinalizada, nunca "todos". Gmail não tem fuzzy nativo: não prometer. Gates/control inalterados.

## Fase12 (20/10/2026)
Entrada principal em texto livre com orquestrador restrito (ferramentas fechadas, resultados não confiáveis, seletor humano); proposta Ticketline inerte com hash; fecho recebido não prova recebimento. Inativo até pacote de ativação; LLM só mock; execução bloqueada.


## 12j leitura única e anexos (23/10/2026)
Cada email lê-se uma vez por turno; recusa repetida termina. Anexos (nome/tipo/tamanho) e numeração vêm só da pesquisa assinada e revalidada, nunca do modelo nem do histórico; após a escolha, as respostas levam a revisão existente. Parar após o POST deixa o controlo uncertain: nunca reset/retry automático; conferência só por SQL responsável com Sim.
