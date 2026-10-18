# #333 — tarefa85: análise documental restrita, fase10

## Entrega
- Acrescentar análise do documento já enviado e conversa restrita ao lote atual, sem criar outra área de chat ou novas tabelas. A conversa desta camada fica apenas na sessão aberta; os dados confirmados seguem para a prévia existente.
- Mostrar campos candidatos com trecho/página quando disponíveis, origem e incerteza. Separar claramente **documento**, **encontrado no ERP**, **sugestão** e **confirmado pela pessoa**.
- Permitir revisão/edição humana antes de preparar a prévia vinculativa. Nunca preencher automaticamente pagador, conta, evento, IVA ausente ou moeda ausente; valores incompatíveis suspendem a revisão.
- Preservar autorização nominal, hash, empresa, execução e conferência atuais. O modelo não terá ferramentas de escrita, SQL, administração, pesquisa externa ou acesso financeiro.

## Segurança e disponibilidade
- Análise fechada por defeito, independente das permissões de preparação/execução. Não ativar fase9, alterar flags ou dispensar os três critérios pendentes da fase8.
- Verificar sessão, papel admin/platform_admin/manager, empresa, owner do lote e documento no servidor; conferir tipo, tamanho e SHA dos bytes antes de enviar ao modelo e revalidar contexto antes de devolver a resposta.
- Limitar entrada, histórico da conversa e orçamento de saída; uma chamada por ação explícita, sem retry automático ou chamadas em segundo plano. Usar streaming e cancelamento explícito; não introduzir abortos por temporizador que possam deixar trabalho cobrado em execução.
- Validar a resposta antes de a usar na revisão. Recusas, configuração ausente, resposta inválida e limites do serviço mostram erro real seguro, nunca sucesso ou resposta inventada.
- Documentos e mensagens são dados não confiáveis: nenhuma instrução neles amplia o âmbito ou as ferramentas.

## Integração técnica
- Reutilizar o Gateway e o segredo server-side já previstos no projeto. A investigação não encontrou uma integração OpenAI documental existente reutilizável: preparar o adaptador OpenAI/Responses com SDK e helpers oficiais, sem substituir modelos de outras funções.
- Acrescentar módulos próprios para contrato de análise, serviço com dependências injetáveis e revisão/conversa; integrar no cliente/modal existentes sem refatorar os escritores financeiros.
- Ler os contratos oficiais de streaming, Responses e AI Elements antes de implementar; usar os componentes de conversa compatíveis com o projeto. Não adicionar persistência ou threads novos.
- Não criar chave nem presumir disponibilidade do modelo. O caminho permanece desabilitado e a verificação externa fica pendente nesta entrega.

## Validação e limites desta tarefa
- Testes locais herméticos com doubles: isolamento owner/empresa/papel, gates fechados, hash/tipo/tamanho, injeção, saída inválida, incertezas, edição humana, contexto obsoleto e zero chamadas de escrita pela análise.
- Executar somente testes pertinentes; sem provas obrigatórias dependentes de /tmp ou Chromium no CI padrão. Tipos/build pelo harness automático; nenhuma chamada paga, documento real, piloto ou escrita Cloud.
- Não tocar nos testes70/worker60, #323, DECISIONS, dados reais, Auth, Storage residual, SQL81/83, migrations, Gmail/Drive/OAuth ou Publish.

## Registos e fecho
- A regra “nenhuma fixture/conta/fatura/ficheiro fictício no ERP pelo agente” já foi guardada; limpeza Auth/Storage fica adiada para exclusão manual.
- Reserva única #333 já limitada à tarefa85; documentação partilhada reservada por #323 não será editada. Registar estado atualizado sanitizado em prova própria333.
- Entregar arquivos/diff revisável, testes e limites observados, SHA disponível, dependências reais e checklist honesta das18fases:1–7 concluídas;8 parcial;9 não liberada;10 código preparado, validação externa pendente;11–18 pendentes.
- Antes do próximo dispatch não corretivo ou Publish, controller confirma CI quality verde do novo SHA. Nenhuma ativação ou publicação decorre da aprovação deste plano.