# MP Gestão — estudo de SaaS e alternativas de desenvolvimento

Documento vivo · iniciado em 23/10/2026 (horário de Fortaleza).
Estado: estudo aberto. Sem escolha definitiva de ferramenta, migração ou piloto executado.

## Objetivo e modo de utilização

Construir gradualmente o caminho para comercializar o MP Gestão como SaaS e avaliar desenvolvimento fora do Lovable, preservando a operação atual.

Esta pasta é a referência partilhada do estudo para Claude e ChatGPT. Antes de continuar a discussão, ler este README e a documentação atual do projeto. Atualizar este documento no lugar; resultados futuros identificam data, origem, versão e limites. Não manter cópias concorrentes como fontes oficiais.

O estudo não substitui docs/INDEX.md, docs/CHATS.md, docs/QUADRO.md, os estados das frentes, docs/DECISIONS.md ou as Issues. Decisões duradouras aprovadas seguem para DECISIONS; demandas concretas seguem para Issues e para a frente responsável. A pasta não ativa nem notifica chats.

## Direção expressa pelo Pedro

- O ERP incorpora particularidades reais do setor de eventos, amadurecidas com utilização nas empresas do grupo.
- O tempo dedicado pelo Pedro concentra-se sobretudo em novas funcionalidades e módulos; não deve ser apresentado automaticamente como dependência de manutenção.
- A próxima evolução de produto é adaptar a plataforma ao real brasileiro e às questões fiscais do Brasil, preservando Portugal.
- A preparação para SaaS será gradual, acompanhando a maturidade da operação nos dois países.
- Há interesse em testar funcionalidades desenvolvidas fora do Lovable para observar o comportamento e o esforço de acompanhamento.
- O estudo deve ficar acessível ao Claude e ao ChatGPT.

**Âmbito autorizado nesta etapa:** organizar e registar o estudo. O interesse em testar não define ainda a funcionalidade, o executor ou a autorização de implementação. Não há autorização nesta conversa para migração, DDL/DML, deploy, Publish, novas contas, crons ou chamadas com efeitos externos.

## Ponto de partida

A leitura inicial de documentação, código e metadados mostrou:
- ERP com BP, cenários, turnês/Master-cidades, rateios, bilheteiras, tesouraria, contratos e acertos com sócios.
- Módulos adjacentes de CRM, Audience, Produção e carreira artística, com níveis diferentes de maturidade.
- Fundamentos multiempresa: memberships, permissões, identidade visual, funções por empresa e isolamento na base.
- React/TypeScript no código inspecionado e backend Lovable Cloud com base tecnológica Supabase.
- Documentação, testes e monitorização existentes, que devem ser reutilizados.

Foi uma revisão ampla por amostragem, não uma auditoria completa, teste de carga ou certificação de segurança. Notas de maturidade dadas na conversa são avaliações subjetivas, não indicadores operacionais.

Fontes internas a reler antes de qualquer proposta técnica:
- ../../ARCHITECTURE.md
- ../../INDEX.md
- ../../CHATS.md
- ../../QUADRO.md
- ../../estado/estado-plataforma-e-infra.md
- ../../../.lovable/memory/features/multi-membership-model.md
- ../../../.lovable/memory/features/company-exclusive-features.md
- ../../../.lovable/memory/features/ui-permissions-overrides.md
- ../../../.lovable/memory/security/multi-tenant-edge-functions-audit.md
- ../../../.lovable/memory/features/invariant-monitor.md
- ../../../.lovable/memory/features/build-code-splitting.md

## Separar três decisões

| Decisão | Opções em estudo | Implicação |
|---|---|---|
| Onde desenvolver | Lovable; Claude Code; Codex; Cursor | Quem altera e testa o código |
| Onde hospedar a aplicação | Lovable; hospedagem externa a selecionar | Quem publica e opera a interface/serviço |
| Onde gerir o backend | Lovable Cloud; Supabase próprio gerido | Controlo sobre dados, recursos, funções e recuperação |

Mudar o desenvolvimento não obriga a mudar a hospedagem ou a base. Não se propõe reescrever o ERP para experimentar outro agente.

## Alternativas de desenvolvimento

| Alternativa | Vantagem esperada | Aspeto a medir |
|---|---|---|
| Lovable atual | Continuidade e construção integrada com pré-visualização | Qualidade, tempo total, limites de controlo e custo |
| GitHub + Claude Code executor + Codex revisor | Trabalhar no código existente com revisão independente | Configuração inicial, esforço do Pedro e regressões |
| GitHub + Codex executor + Claude Code revisor | Mesmo formato, invertendo responsabilidades | Comparar tarefas equivalentes sem presumir vencedor |
| Cursor como ambiente integrado | Código, agente e revisão no mesmo editor | Adaptação da interface ao trabalho por comandos |

Claude Code como primeiro executor experimental foi uma recomendação na conversa, não uma escolha aprovada. Não existe comparação prática concluída entre ferramentas no MP.

Um executor por demanda; o outro revê por leitura. Nenhum agente tem autorização permanente para produção.

## Integração com o ERP existente

### A. Desenvolver fora e integrar dentro

Trabalhar numa branch do mesmo repositório, executar testes, rever e integrar de forma controlada. O módulo passa a funcionar dentro do ERP e pode reutilizar login, menus, permissões, cálculos e APIs.

É a primeira opção proposta para o piloto, por reduzir a quantidade de alterações simultâneas.

### B. Aplicação ou serviço hospedado fora

Pode comunicar com o backend atual pelas APIs autorizadas e disponibilizar endpoints para o ERP. Exige definir autenticação, autorização por empresa, contrato de dados, sessão entre domínios, CORS quando aplicável e tratamento de falhas.

Não é possível chamar remotamente uma função interna do browser como se fosse uma API: a lógica precisa de ser partilhada em código ou exposta através de um serviço.

### Limites importantes

- Acesso pela API não equivale a acesso administrativo à base.
- A publishable key não concede permissões de utilizador nem substitui RLS.
- Funções apenas service_role precisam de um caminho específico de integração; não expor segredos no cliente.
- Deploy de funções e alterações de esquema continuam sob o fluxo autorizado do projeto.
- O Cloud e um projeto Supabase próprio não têm necessariamente os mesmos acessos, opções ou limites.
- Login em aplicação separada não se torna automaticamente partilhado.

## Proposta do primeiro piloto — por aprovar

**Candidato:** melhoria delimitada de apresentação/exportação de um relatório existente, usando o cálculo canónico já disponível.

A funcionalidade concreta será escolhida com o Pedro após verificar o que já existe. Evitar começar por uma reescrita de cálculos financeiros, mudança fiscal ou serviço novo em produção.

Etapas propostas:
1. Identificar relatório, problema e critérios de aceitação; abrir Issue e definir frente/executor.
2. Confirmar código atual, fontes, reservas, HEAD e CI.
3. Preparar ambiente isolado e dados fictícios; começar sem ligação à Live.
4. Implementar numa branch separada; executar os testes relevantes e gerar pré-visualização.
5. Revisão pelo outro agente e validação visual/funcional pelo Pedro.
6. Registar resultado, esforço, limitações e decisão de continuar ou ajustar.
7. Só depois preparar integração/publicação pelo fluxo autorizado.

A segunda experiência poderá validar leitura autenticada da mesma base e uma chamada a função sem efeitos externos, com âmbito e autorização próprios. Não se presume que dry run ou função de leitura sejam isentos de efeitos.

### Critérios de avaliação

| Dimensão | Prova a registar |
|---|---|
| Correção | Casos aceites e comparação com cálculo canónico |
| Regressões | Testes e diferenças entre antes/depois |
| Experiência | Pré-visualização e aceitação do Pedro |
| Esforço | Tempo total, intervenções e retrabalho |
| Custo | Consumo verificável, sem estimativas apresentadas como factos |
| Integração | Branch, commits, CI e sincronização |
| Reversibilidade | Como retirar o piloto sem afetar a operação |
| Segurança | Âmbito de dados, permissões e efeitos efetivamente observados |

## Condições para SaaS a amadurecer

- Configuração de país, moeda e fiscalidade, com paridade/regressão de Portugal.
- Entrada de cliente, configuração inicial e utilização autónoma pela equipa.
- Planos, módulos contratados, cobrança e medição de custo por empresa.
- Testes de isolamento entre empresas em APIs, funções, storage e exportações.
- Cópia externa de dados e documentos e ensaio de recuperação.
- Ambiente isolado para validação; gestão de versões e prova de publicação.
- Carga simultânea de utilizadores, relatórios, imports e tarefas agendadas.
- Manual, suporte, diagnóstico e acesso de suporte auditado.

Não duplicar demandas existentes. Pontos já documentados incluem #202 (cópia externa/storage), #194 (manual), #317 (comportamentos de deploy/segredos) e #347 (identificação da versão publicada). Consultar Issue e comentários atuais antes de concluir o que falta. O defeito do restauro não atómico da #203 foi registado como corrigido; não o apresentar como pendência atual sem nova prova.

## Registo de decisões e experiências

| Item | Estado | Evidência |
|---|---|---|
| Abrir estudo partilhado | Autorizado | Pedido do Pedro nesta conversa, 23/10/2026 |
| Tornar acessível ao Claude | Autorizado | Pedido expresso do Pedro, 23/10/2026 |
| Adaptar BRL/fiscalidade Brasil antes da preparação comercial completa | Direção de produto | Declaração do Pedro nesta conversa; não autoriza implementação |
| Experimentar desenvolvimento fora | Interesse confirmado | Escolha do piloto e execução ainda por autorizar |
| Sair do Lovable / migrar backend | Não decidido | Alternativas em estudo |
| Primeiro piloto | Não iniciado | Nenhum código ou teste criado por este estudo |
| Comparação de ferramentas | Não realizada | Não declarar superioridade comprovada |

Próximo passo: escolher um candidato pequeno e preparar a sua proposta concreta. Não há continuação automática nem acompanhamento agendado.

## Referências externas consultadas

Consultadas em 23/10/2026; capacidades e limites devem ser reconfirmados na preparação do piloto.

- Lovable Cloud: https://docs.lovable.dev/features/cloud
- Hospedagem e escala: https://docs.lovable.dev/features/hosting
- Desenvolvimento/hospedagem externa mantendo backend: https://docs.lovable.dev/tips-tricks/external-deployment-hosting
- Cloud versus Supabase próprio: https://supabase.com/kb/troubleshooting/identify-lovable-cloud-or-supabase-backend
- Edge Functions: https://docs.lovable.dev/features/edge-functions
- Preparação de produção: https://supabase.com/docs/guides/deployment/going-into-prod
- Backups e exclusão dos objetos de Storage: https://supabase.com/docs/guides/platform/backups
- Claude Code: https://code.claude.com/docs/en/overview
- Codex: https://learn.chatgpt.com/docs/codex/cli
- Cursor: https://cursor.com/docs/agent/overview

## Regra de atualização

Cada ferramenta lê a versão atual antes de escrever. Preservar contribuições do outro lado, separar factos/propostas/decisões e seguir a regra de escritor único e sincronização (#329). Enquanto o agente estiver ocupado, alterações documentais seguem pelo caminho previsto no QUADRO.

Este documento guarda análise. Resultados medidos guardam predicado, origem, data e versão; não copiar números mutáveis de memória. Não guardar credenciais, documentos privados ou dados financeiros/pessoais de clientes.
