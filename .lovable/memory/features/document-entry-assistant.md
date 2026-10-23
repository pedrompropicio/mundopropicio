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

## 12k anexo Ticketline (23/10/2026)
O scanner existente só lê número/data/total do anexo; linhas vêm só do corpo — o candidato diz "Revisão parcial" e a confirmação fica bloqueada até haver número, data, total e linhas humanas. Data sem origem fica vazia (campo texto AAAA-MM-DD, nunca hoje). Anexos apresentados uma vez (painel; imagens recolhidas por tipo). Trocar de origem limpa o candidato. Extrair linhas do PDF exige novo contrato com bytes reais.

## Retoma corretiva — linhas do apuramento (23/10/2026)
Contrato dedicado `_shared/assistant-ticketline-apuramento.ts` extrai as LINHAS do anexo (schema zod estrito, tipos fechados, sinais/cêntimos/moeda, Σ=total, zero nunca é linha, sem deduplicação por nome, data ausente fica ausente, pendências nunca silenciosas). Reusa o transporte do scanner e o controlo durável/abort; o scanner genérico de faturas não mudou. Falha do scanner de linhas = pendência, nunca derruba o candidato. Painel: guarda de sequência impede resposta antiga em voo de se reaplicar ao novo radio; data usa o DatePicker padrão do ERP (vazio inequívoco). Deploy da data-entry e Publish continuam por autorizar (R2); PDF real nunca lido — validação com bytes reais pendente de autorização específica.

## #333 revisão controller (23/10/2026) — continuação corretiva
- Anexo escolhido é a AUTORIDADE das linhas: corpo do email é só contexto (conflito sinalizado, nunca linhas extra silenciosas); soma validada sobre o candidato efetivo; truncagem silenciosa proibida.
- Revalidação de auth/empresa corre FORA do catch do scanner; revogação durante o scanner é recusa, nunca candidato parcial assinado.
- Caminho apuramento = UMA chamada dedicada (multi-página); scanner genérico de faturas não é chamado nesse caminho.
- Valores monetários sem arredondamento (>2 casas recusados, tolerância só a ruído IEEE754); event_hint de repasse/transitado normalizado a null no servidor; moeda ausente nunca presumida EUR.
- Pendências bloqueantes são estruturadas (`blocking: {code,message}[]`, assinadas no token e no hash); resolução humana explícita por código + recomputação (no_lines/sum_mismatch); regex de mensagem nunca resolve; avisos informativos não bloqueiam.
- Guarda seq do painel cobre load, recalc e authorize (respostas tardias descartadas). Duplicados cedo via leitura ERP isolada (JWT do chamador); outra empresa não vê IDs.


## #333 residual — versão da revisão e ausência de extração (23/10/2026)
Toda alteração dos dados, resolução/confirmacão, origem, candidato inicial (mesmo token), utilizador/empresa e seleção de ações invalida pedidos e autorização. Sucesso/erro/notice/finally só se aplicam à versão e pedido atuais; editar durante autorização nunca restaura autorização antiga. Guarda no handler local além dos botões; sem autorização executável antiga no contexto novo.
Escolhido anexo, ZERO linhas, falha/ausência do scanner ou scanner só de metadados significam linhas vazias + bloqueio/revisão manual; corpo mantém só contexto/proveniência, nunca linhas promovidas à fonte PDF. Testes sintéticos não autorizam deploy/Publish nem validam PDF original.

- Datas na revisão Ticketline: sempre DatePicker padrão com `clearable` (nunca input nativo); "Limpar recebimento" limpa o bloco inteiro pelo edit fence; data obrigatória vazia continua a bloquear, nunca preencher com hoje.
- Padrão global de datas aprovado pelo Pedro e já integrado no AGENTS em 23/10/2026: aplica-se também aos filtros Gmail Desde/Até e Data da fatura do Assistente. Período Gmail continua obrigatório e com os defaults existentes; limpar texto/botão apaga o canónico e exige preenchimento antes de pesquisar/paginar, nunca pesquisa com data antiga. Preservar limites Desde<=Até e ISO civil sem conversão de fuso; não autoriza migração global, janela, login, chamadas reais ou Publish.
