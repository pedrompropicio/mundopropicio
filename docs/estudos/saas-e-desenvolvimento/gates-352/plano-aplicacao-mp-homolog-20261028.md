# Mundo Propício — plano de aplicação do esquema no mp-homolog

**Data:** 28/10/2026 UTC, 27/10/2026 em Fortaleza. **Frente:** 2 · Plataforma e Infra. **Issue:** #352. **Classe desta entrega:** R0, apenas documentação. **Estado:** proposta para revisão, sem autorização de ligação ou aplicação.

Despacho: [6457268826](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6457268826). A preparação local do G4 foi confirmada no [parecer 6457105338](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6457105338); os seus 12 jobs **não entram** nesta aplicação do esquema.

O destino é o **mp-homolog já existente**, na organização **Mundo Propício**, plano **Pro**, região **eu-west-1**, conforme a [correção 6455745096](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6455745096). Nessa verificação estava vazio, em Nano e com spend cap ligado. A organização duplicada de Paris foi eliminada. Não se cria outro projeto por causa de documentação antiga. O identificador técnico do destino ainda tem de ser confirmado pelo Pedro no painel existente; o nome, por si só, não identifica uma base.

Nesta R0 foram lidos documentos, fontes e provas existentes, sem ligação ao mp-homolog ou a Live, sem criar segredos, alterar compute ou executar SQL. G4, G5, deploy e Publish continuam fora do âmbito. A classe R0 dispensa reserva segundo o QUADRO; a futura execução terá reserva própria. Publicação documental com `[skip ci]` e confirmação da #329 antes do push.

As referências de projeto e de pacote abaixo já constam dos despachos públicos da #352. Este plano não publica endereços de ligação, identificadores técnicos do destino, commits ou runs privados, inputs históricos, comandos dos jobs ou SQL integral. As credenciais e os procedimentos de execução descritos são propostas para o futuro Sim.

## 1. Ligação do GitHub ao mp-homolog

**Proposta:** ligação PostgreSQL temporária, iniciada exclusivamente pelo workflow manual específico da #352 no repositório privado `pedrompropicio/mundopropicio-replay`. Não implica ligar o projeto ao deploy automático do GitHub nem dar ao CI acesso à API de gestão do Supabase.

| Elemento | Decisão proposta |
| --- | --- |
| Credencial | Uma password nova, exclusiva e temporária da base do mp-homolog. |
| Papel | `postgres` do projeto gerido, sem superutilizador. É o administrador disponível para criar os objetos e aplicar as ACL da aplicação; um papel apenas de leitura não executa este trabalho. Não se pede acesso a `supabase_admin`. |
| Introdução | O Pedro gera a password e introduz diretamente no painel Supabase do projeto correto e no segredo `MP_HOMOLOG_DB_PASSWORD` do GitHub Actions privado. Nenhum valor passa por conversa, Issue, Git, artefactos ou comandos publicados. |
| Identidade do destino | Referência/ID do projeto, host, porta, base e utilizador copiados da secção Connect do projeto existente. Estes metadados não secretos ficam fixados no manifesto de execução. |
| Transporte | TLS com verificação do certificado e do nome do servidor. Ligação direta na porta 5432 se o runner tiver IPv6; caso contrário, pooler em modo **session**, porta 5432, com o host e utilizador fornecidos pelo painel. Não usar o pooler transaction para esta aplicação. |
| Credenciais dispensadas | Não são necessários service role, chave anon, JWT, token pessoal de gestão ou credencial de produção. Não usar ligação preexistente ou destino implícito do CLI. |

Esta é a menor credencial **prática para o bootstrap completo**, não uma conta de baixo privilégio. Inventar um login que possa assumir `postgres` não reduz o poder efetivo. Depois da aplicação, nenhum CI periódico necessita de conservar essa password. A disponibilidade e os limites do administrador gerido estão documentados pelo [Supabase](https://supabase.com/docs/guides/database/postgres/roles-superuser); os modos de ligação constam da [documentação de conexão](https://supabase.com/docs/guides/database/connecting-to-postgres).

Antes de o Pedro introduzir a credencial, a revisão do workflow verifica:

- Execução apenas manual, num commit privado fixado, com um único executor; sem gatilhos de push, PR ou agenda. Só o CI da #352, sem sonda HTTP de produção.
- Permissões GitHub de leitura do conteúdo; ações e dependências fixadas por versão imutável; credencial disponível apenas ao passo de ligação, nunca a código de PR ou ações que a não necessitem. Checkout sem persistência da credencial GitHub.
- Preferência por segredo de environment dedicado, com restrição de branch, se o plano GitHub privado o permitir. Caso contrário, segredo temporário do repositório, depois de auditar todos os workflows que o possam referenciar. Não presumir que aprovações obrigatórias de environment existem no plano contratado: as [restrições de ambientes privados](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) variam por plano. Não contratar outro plano nesta operação.
- Lista positiva do ID, host, porta e utilizador do mp-homolog antes de abrir a ligação; rejeição explícita da identidade de Live e de qualquer destino não listado. Não aceitar uma URL arbitrária como input. Depois da ligação, conferir também base, utilizador e atributos do papel; estes últimos não substituem a prova do endpoint.
- Password transmitida ao cliente por mecanismo secreto, sem impressão, argumentos de comando, tracing ou DSN nos logs. Scanner nos ficheiros, logs e artefactos; relatório público apenas com contagens e hashes.

**Prova de separação de produção:** o Pedro confirma a origem da password recém-gerada no mp-homolog; a revisão identifica o único nome de segredo usado pelo workflow e o destino fixado. O job não recebe qualquer segredo de Live. A comparação recebe uma captura de catálogo sanitizada pelo canal já autorizado de Live, fora do GitHub, e não uma credencial para a recolher. O scanner prova ausência das classes que deteta; não prova, sozinho, de que projeto veio uma password. A origem declarada pelo Pedro e a vinculação ao destino completam essa prova.

**Revogação, mesmo se falhar:** fechar as ligações do job; o Pedro volta a rodar a password no painel do mp-homolog, sem publicar a nova no GitHub, e elimina `MP_HOMOLOG_DB_PASSWORD`. Verificar que não restam sessões identificadas como pertencentes ao CI e terminá-las, se necessário, antes de dar a revogação por concluída. Eliminar o segredo do GitHub, por si só, não invalida a password anterior nem sessões abertas. Desativar a possibilidade de novo run com a credencial temporária. Registar só horários, contagens e confirmação da revogação.

## 2. Pacote, ordem, checkpoints e recuperação

### Base imutável

| Prova | Identificador |
| --- | --- |
| Pacote G3 verde | `g3-validation-current-catalogue.zip` — 43 ficheiros, 277744 bytes de fontes |
| SHA-256 do pacote | `c316fc12b8b9b9ef890bb2975c9e6f32b1a312a933956c9fe704f07f3db0d715` |
| Origem pública destes identificadores | [Sim 6454492672](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6454492672) |

O pacote usa o repositório público, a baseline e os inputs históricos já existentes no replay privado, como determina a [aceitação pública do G3](planos-g3-g6-20261026.md). As 232 entradas e os 8 fixtures sem fonte pública continuam privados, com dívida de publicação tratada pela frente 2 na #387. Não se copiam para o repositório público. Os fixtures autorizados incluem referências e identidades sintéticas; não são uma cópia dos dados de negócio de Live. O âmbito futuro tem de os nomear como exceção explícita ao esquema sem dados. Não há seeds novos nem expansão dos fixtures.

**A prova verde local não demonstra compatibilidade com o serviço gerido.** Não autoriza apontar o executor local ao mp-homolog, nem reproduzir configurações, administração ou limpeza de recursos próprias de uma base descartável.

Será necessário preparar, numa etapa posterior autorizada, um adaptador para o Supabase gerido, com manifesto próprio e hash fixado. Deve conservar os SQL efetivos, ordem, overlays, proveniência e regras do pacote verde, substituindo apenas transporte, bootstrap local e verificações de ambiente. Exclusões de entradas geradas da plataforma precisam de correspondência individual com N4 e prova do estado já fornecido pelo serviço. Qualquer nova alteração de SQL, semântica ou regra fica identificada para parecer e Sim próprios; não se oculta no adaptador. O zip verde mantém o seu hash. O novo candidato de execução só pode ser publicado e executado depois da confirmação do seu hash pelo Pedro.

### Sequência proposta

| Checkpoint | Aplicação e prova exigidas |
| --- | --- |
| C0 — candidato, antes da ligação | Conferir hashes do pacote, inputs, baseline, overlays e código de comparação; fechar o manifesto do adaptador e dos deltas; scanner 0. Testar o candidato em base descartável, com o papel executor sem superutilizador, cron desligado e egress bloqueado. G1 e G2 locais verdes não substituem a verificação gerida de C1. |
| C1 — destino, antes da escrita | Com Sim e credencial introduzida pelo Pedro, confirmar identidade, vazio de aplicação, versões/extensões/owners/papéis/ACL geridos, capacidade, 0 jobs e 0 segredos. Demonstrar que todas as operações de C2–C6 são permitidas ao `postgres` gerido. Divergência não coberta interrompe antes da escrita. |
| C2 — histórico ordenado | Executar a ordem efetiva do manifesto, que intercala ledger, órfãos, seeds autorizados, Drizzle, fontes manuais, reconstruções e baseline histórica. Não executar famílias inteiras separadamente nem a ordem alfabética das pastas. Os overlays substituem o conteúdo na posição aprovada; não se executa o original e depois o overlay. Verificar hash do SQL efetivo por entrada e conservar os checkpoints do manifesto, sem substituir falha por skip. |
| C3 — tail e extensões | Aplicar o tail no ponto definido pelo manifesto e verificar a pertença dos objetos de aplicação às extensões. Pertença de uma tabela a uma extensão e membership entre papéis são conceitos distintos; as operações dependem dos owners, conforme a secção 3. |
| C4 — definição final e ACL | Aplicar as reconciliações de definição, depois as compensações ACL aprovadas. Provar reaplicação idempotente das entradas previstas, sem alterar a primeira aplicação e sem ignorar definição divergente. |
| C5 — par congelado | G2 N1–N9 contra a referência congelada correspondente, para distinguir regressão do pacote de evolução posterior de Live. Não é a aceitação final do mp-homolog. |
| C6 — evolução posterior | Aplicar 0282, 0283 e 0284, já incluídas no pacote verde, e só os deltas adicionais expressamente fixados no candidato aprovado. Revalidar hashes e auditoria posicional N9 para o commit candidato completo. |
| C7 — aceitação atual | Capturar catálogo do mp-homolog e comparar com o catálogo atual de Live pela mesma cadeia N1–N9. Exigir todos os critérios da secção 5, publicar provas sanitizadas e revogar a credencial. |

Há um delta conhecido: o pacote verde termina em **0284**, mas o QUADRO já regista **0285 aplicada em Live**, com fonte pública em `drizzle/migrations/0285_0285_p6b_a_pagar_caches.sql`. Deve entrar num suplemento separado, com hash fixado, validado no replay antes da aplicação gerida e incluído no Sim do candidato. Não se altera silenciosamente o zip c316. A 0286 estava apenas proposta no QUADRO consultado; não entra por existir um ficheiro. A recolha futura de catálogo confirma o que efetivamente está aplicado. Qualquer evolução adicional exige novo fecho do candidato e do seu hash.

Cada entrada termina com verificação do resultado e registo de índice, hash e duração. Usar transação por unidade onde o SQL o permita; o manifesto identifica operações que não possam ser transacionais. Registar sucesso apenas após commit. Recontar jobs e segredos nos checkpoints e rejeitar qualquer operação que os crie. Não é admissível criar jobs e apagá-los no fim para alcançar zero no destino. Se houver agendamento ainda executável no SQL efetivo, a sua supressão precisa de overlay identificado, prova e aprovação no candidato; não se presume autorizada pela adaptação do transporte.

**Se falhar a meio:** parar no primeiro erro ou privilégio sem efeito, guardar SQLSTATE, índice e hashes sem conteúdos privados, fechar ligações e manter o destino indisponível para uso. Não continuar do ponto seguinte, reparar o ledger para fingir aplicação, nem ampliar privilégios automaticamente.

Como não há dados de negócio a preservar, a recuperação proposta é um **reset apenas dos objetos de aplicação deste destino**, seguido de uma repetição integral do mesmo candidato, no máximo uma vez e apenas se a causa estiver compreendida e coberta. O método e o inventário do reset têm de constar do candidato revisto. A documentação do [CLI](https://supabase.com/docs/reference/cli/supabase-db-reset) avisa que o reset remoto remove entidades criadas pelo utilizador e não remove papéis personalizados. Não se executa um reset a partir do checkout completo com descoberta automática de migrations/seeds: isso aplicaria fontes fora da ordem aprovada. Preservar os schemas e papéis internos; provar novamente C1 e conferir os papéis que um reset deixa para trás.

Se não for possível provar um reset seguro e completo, parar. Alternativa: o Pedro recria um projeto vazio na organização correta, mediante autorização própria; isso muda o ID, a lista de destinos e a credencial, pelo que exige nova confirmação antes de ligar. Não recriar a organização nem apagar o projeto existente por iniciativa do executor. Uma correção que mude o candidato, mesmo após falha, volta à confirmação do novo hash.

## 3. Supabase gerido: compatibilidade e regras

| Área | Tratamento no mp-homolog |
| --- | --- |
| `postgres` | Administrador sem superutilizador. Não reproduzir `ALTER SYSTEM`, acesso a ficheiros do servidor ou pressupostos do administrador local. A prova local deve abrir sessão com o papel real de teste, sem herdar uma sessão de superutilizador. |
| Extensões | Inventariar nome, versão disponível/instalada, schema e owner antes da escrita e comparar com o manifesto aprovado. Não pressupor que o serviço oferece as mesmas versões do ambiente local. Instalar só dependências aprovadas e disponíveis. Versão, API ou ownership incompatíveis bloqueiam; nenhuma atualização automática para fazer o teste passar. |
| `auth`, `storage`, `realtime`, `vault` | Reutilizar os objetos geridos que o serviço fornece. Não restaurar por cima os dumps dos schemas, papéis, owners ou configurações internos. Funções, triggers e políticas da aplicação nesses schemas continuam a exigir origem e comparação. Não inserir utilizadores reais, objetos de storage ou segredos. |
| Papéis da plataforma | Não criar réplicas, pedir membership em `supabase_admin` ou tentar assumir esse papel. Os grants da aplicação continuam explícitos e verificáveis. Não confundir avisos de REVOKE sem efeito com sucesso. |
| PGMQ e Drizzle | Continuam objetos da aplicação em N5. Verificar se a pertença à extensão já está no estado pretendido; se não estiver, provar que `postgres` pode executar a operação aprovada. Falta de ownership é bloqueante, não uma nova exclusão N4. |
| Cron, rede e vault | Criar as estruturas de extensão necessárias não autoriza agendar tarefas nem inserir segredos. Os 12 jobs do G4 permanecem fora. A configuração local de cron e o firewall Docker não são transportáveis para o serviço gerido. |

As [permissões dos schemas geridos](https://supabase.com/docs/guides/platform/permissions) e a [impossibilidade de alterar os privilégios padrão de supabase_admin](https://supabase.com/kb/troubleshooting/cant-change-the-default-privileges-of-supabase_admin-in-the-public-schema) impedem tratar o administrador local como equivalente ao `postgres` do projeto.

**`platform_managed_privileges`:** mantém exatamente o âmbito aprovado: ACL de `storage.buckets` e `storage.objects`, memberships `supabase_functions_admin` → `postgres` e `supabase_realtime_admin` → `postgres`, e configuração de `supabase_admin`. Só passam à linha-base N4 quando todas as referências nas fontes são entradas geradas por dump ou reposição do que a plataforma já faz. Uma migração da aplicação que dê GRANT, REVOKE, membership ou altere ACL de storage continua bloqueante. A classificação identifica fonte, objeto, linha e hash. N4 não autoriza descartar qualquer erro de permissões.

**`acl_final_from_live`:** continua a definir a ACL final dos objetos da aplicação, usando as compensações aprovadas, executadas com o papel autorizado e verificadas no catálogo. Não se transplantam passwords, atributos privilegiados ou ACL internas do serviço. A exceção gerida anterior é aplicada só aos alvos elegíveis e com prova. As políticas RLS de `storage.objects` continuam integralmente na comparação; uma contagem histórica não substitui igualdade com a captura atual.

Permanecem `reviewed_literal_allowlist`, `catalog_identifier_literal`, `sanitized_literal_reconstruction` com telefone e IBAN sintéticos, `enum_position_overlay`, `live_only_tail`, `live_definition_prevails`, `live_absence_prevails`, as regras R7/R8, R4b e `self_contained_fixture`. Não normalizar diferenças sem regra. O INSERT posicional só é fixture autónomo quando a própria suite cria a tabela usada; o uso sobre a base migrada continua sujeito a N9. A prova de R4b para `financial_accounts` acompanha o candidato.

**Ausência de efeitos externos:** um firewall no runner não impede egress iniciado pelo PostgreSQL gerido, e restrições de entrada do Supabase não provam bloqueio de saída. Antes de aplicar, rever o SQL efetivo e os caminhos chamados pelos fixtures, blocos executados e triggers: nenhuma chamada HTTP, envio, worker ou resolução de segredo pode ser executada. Guardar definições de funções não equivale a invocá-las. Se a prova não for possível, parar antes da escrita; não usar a falta de segredos como substituto dessa prova, nem testar contra endpoints de produção.

## 4. Capacidade e preço consultado

**Proposta concreta: Micro.** Nano pode comportar um esquema sem dados de negócio, mas não há medição que prove o pico de memória deste replay no serviço gerido. O número de objetos, por si só, não o demonstra. Micro oferece margem de memória superior e evita insistir no Nano sem vantagem de preço no Pro.

Consulta às fontes oficiais em **28/10/2026, 00:38 UTC**:

| Compute | Memória | Ligações diretas / clientes de pooler | Preço aplicável no Pro |
| --- | --- | --- | --- |
| Nano existente | Até 0,5 GB | 60 / 200 | Cobrado ao mesmo preço do Micro |
| Micro proposto | 1 GB | 60 / 200 | USD 0,01344/h, cerca de USD 10/mês |

Fontes: [Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk), [preço e créditos de compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute) e [pricing](https://supabase.com/pricing). O Pro custa USD 25/mês e inclui USD 10 mensais de crédito de compute **por organização**. Esse crédito cobre aproximadamente um Micro se não estiver consumido por outro projeto; conferir o saldo no painel antes da decisão. Não é um crédito novo por projeto. Compute não fica limitado pelo spend cap. Valores em USD, sem presumir impostos, câmbio ou extras.

A documentação explica que Nano pode subsistir após passagem de Free para Pro, é faturado como Micro e não é convertido automaticamente devido à interrupção envolvida. A proposta é o Pedro mudar **apenas o mp-homolog vazio** para Micro antes da aplicação, depois do Sim; nenhuma alteração foi feita nesta R0.

Executar DDL sequencialmente, com uma ligação de aplicação e, no máximo, uma de observação. Registar duração, tamanho da base, memória, CPU e erros/reinícios nos checkpoints, pelos meios disponíveis ao projeto. Micro é uma escolha inicial fundamentada, não uma garantia de capacidade: falha por memória, reinício ou timeout interrompe o run. Compute superior, alteração de configuração ou relaxamento de testes exigem decisão própria; não fazer upgrade automático.

## 5. Aceitação no mp-homolog

**Aceitar apenas quando todos os critérios forem demonstrados no mesmo candidato e janela:**

| Critério | Evidência |
| --- | --- |
| Identidade e completude | Projeto/organização/região confirmados; manifesto, pacote, suplemento, adaptador e fontes com hashes fixados; todos os checkpoints concluídos. |
| G2 atual N1–N9 | Catálogo do mp-homolog comparado ao de Live, 0 bloqueantes, com as mesmas regras fechadas e contagens por normalização. A versão congelada serve de diagnóstico, não substitui a referência atual. |
| Origem e ordem | Todas as diferenças têm origem comprovada; auditoria posicional N9 cobre o commit completo. Políticas RLS de storage, PGMQ, Drizzle, definições e ACL da aplicação permanecem incluídas. |
| Cron | Exatamente 0 linhas em `cron.job` e 0 em `cron.job_run_details`, no início, nos checkpoints e no fim. Nunca instalar os 12 jobs nesta etapa. |
| Vault | Exatamente 0 segredos em `vault.secrets`. Apenas contagem, sem consultar valores ou a vista de segredos desencriptados. |
| Visibilidade dos contadores | Provar que o papel vê o conjunto completo. Se RLS filtrar a leitura, não aceitar um zero aparente; usar verificação que falhe quando houver filtragem, incluindo `row_security=off` quando aplicável, sem o tratar como bypass de RLS. Falta de visibilidade bloqueia. |
| Sanitização | Scanner 0 sobre candidato, SQL efetivo, logs e artefactos; sem credenciais, dados de negócio, referências operacionais de produção ou contactos não permitidos pelas regras aprovadas. |
| Encerramento | Provas privadas com hashes, relatório público sanitizado e revogação da credencial confirmada. Nenhum deploy, Publish, G4 ou G5. |

A captura de Live é feita, **na futura etapa autorizada**, pelo canal já aprovado, exclusivamente com SELECT de catálogo. Nenhuma password, DSN, service role ou token de produção entra no GitHub. O workflow privado recebe apenas o resultado sanitizado e os hashes. Fixar a janela, respeitar o limite de idade do gate existente e verificar alterações de catálogo entre recolha e aceitação; se mudar, atualizar o par e repetir a comparação. Não declarar verde atual com a captura histórica usada pelo G3.

Qualquer captura adicional ou execução do detector é manual nesta etapa futura; a agenda de seis em seis horas continua desligada. Não ligar portal, frontend, workers ou tráfego de utilizadores ao mp-homolog. Os fixtures mínimos aprovados não o tornam uma cópia de produção.

## 6. Texto exato do Sim e condições para o usar

O presente despacho aprova somente este documento. Ainda faltam o **candidato adaptado testado como não superutilizador**, o **suplemento atual validado** e a **identidade técnica confirmada do projeto**. Não existe hoje um hash desse candidato para autorizar. A sua preparação técnica será uma etapa separada, com o âmbito próprio aprovado; não é executada nesta R0.

Depois de esses elementos estarem concretos, o parecer de prontidão na #352 deve identificar, sem credenciais: projeto/ID, commit e SHA-256 do candidato, hash do zip verde, deltas incluídos, provas locais, matriz de compatibilidade e método de reset. O Pedro responde **a esse parecer específico**, para que o texto abaixo fique vinculado a um pacote verificável e não a alterações futuras indeterminadas.

> Sim à aplicação do esquema no mp-homolog existente, organização Mundo Propício, eu-west-1, identificado no parecer de prontidão da #352 a que respondo, usando exclusivamente o candidato, commit e SHA-256 fixados nesse parecer. A base é o pacote verde g3-validation-current-catalogue.zip, SHA-256 c316fc12b8b9b9ef890bb2975c9e6f32b1a312a933956c9fe704f07f3db0d715, com o adaptador gerido e apenas os deltas discriminados e validados no parecer, incluindo a 0285 se confirmada em Live. Autorizo a mudança deste projeto vazio de Nano para Micro ao preço oficial indicado no plano. Eu introduzo diretamente uma password temporária exclusiva do postgres do mp-homolog no painel Supabase e no segredo do GitHub Actions privado; nenhuma credencial de produção entra no processo. Autorizo uma execução manual pelo CI específico da #352, com o esquema, baseline, overlays e os oito fixtures privados já aprovados, sem dados de negócio ou seeds novos. Antes da escrita, confirmar destino, privilégios geridos, ausência de efeitos externos, zero jobs e zero segredos; parar se a prova falhar. Em falha de aplicação, autorizo no máximo um reset dos objetos de aplicação deste mesmo destino pelo método revisto no parecer e uma repetição integral do mesmo candidato, somente com causa compreendida e coberta. Qualquer mudança do hash, SQL, regras, privilégios, destino ou âmbito exige novo Sim. A aceitação é G2 contra o catálogo atual de Live, N1 a N9 sem bloqueantes, zero jobs cron, zero segredos no vault e scanner zero. Live só SELECT de catálogo pelo canal já autorizado; o GitHub recebe apenas a captura sanitizada. No fim, mesmo em falha, revogar a password temporária, remover o segredo do GitHub, publicar o resultado na #352 e libertar a reserva. Não autorizo G4, G5, jobs, agenda periódica, deploy, Publish, recriação de projeto ou organização, nem qualquer escrita em Live.

Um Sim dado antes de existir o parecer com ID e hash não satisfaz a confirmação do pacote. O plano não dispensa as autorizações por alteração já fixadas na #352. Questões cobertas pelas regras seguem essas regras; incompatibilidades sem cobertura voltam ao revisor com objeto, operação, fonte e hash, sem improvisar permissões.
