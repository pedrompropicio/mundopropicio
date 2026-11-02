# Corretivo de timeout e busca · Issue #461 · 02/11/2026 · Mundo Propício

15 regressões sintéticas novas; nenhuma prova de aceitação real da #333.

## Âmbito e fontes

Base local conferida: `5ed4352f7999d3cd6052e3f93cffe5e2d71aad5e`, inicialmente sem alterações. Foram lidos INDEX, QUADRO, estado-plataforma-e-infra (incluindo #333), AGENTS da raiz, supabase/ e data-entry/, D-ERP345–350, PROC-promocao, catálogo/regras de relatórios e as memórias document-entry-assistant.md e data-entry-automatisms.md. Não existe AGENTS em supabase/functions/ nem estado-entrada-de-dados.md nesta base.

O despacho forneceu a evidência da interface: duas buscas vazias e «Parado a pedido». Essa evidência não identifica os filtros efetivamente enviados, nem demonstra timeout naquele pedido, nem ausência dos emails. O CI prévio indicado no despacho não foi novamente consultado remotamente.

Preparação de ficheiros, sem SQL, deploy, Publish, serviços de negócio ou credenciais. A criação de branch na cópia original falhou porque `.git` é somente leitura. A implementação foi preparada numa cópia isolada `/tmp/issue461`, com branch local `executor/461-timeout-busca`; os três ficheiros finais foram copiados para a árvore de trabalho para entrega e verificação. Não houve commit, push, alteração de refs de main, sincronização Lovable ou PR. O PR e a revisão por leitura do 0 ficam pendentes; merge manual.

## Antes e depois

Antes, boundedAnalysis chamava o mesmo abort sem motivo para deadline e chamador. runAssistantTurn classificava ambos como stopped. Com fornecedor cooperativo fictício, o teste na base original devolveu efetivamente `stopped` para deadline, contrariando `limit`. Stop manteve stopped. Com fornecedor ou Gmail que ignoravam abort, o turno podia continuar pendente; a fixture inicial da base excedeu o timeout do próprio teste, sem esperar 60 segundos reais.

Depois, deadline aborta com TimeoutError e Stop preserva o motivo do chamador. O orquestrador classifica timeout no estado wire existente `limit`, Stop em `stopped` e falhas de fornecedor em `denied`/`error`. O handler continua a devolver HTTP 499 para o pedido cujo chamador foi abortado. Não foi necessário alterar o type do cliente.

As esperas de ferramentas de leitura concorrem com o signal do turno. A espera do modelo preserva a finalização do seu adaptador durável; depois dessa finalização, uma resposta tardia é descartada antes de iniciar ferramentas. Um fornecedor que ignore abort pode manter essa espera pendente: não se inventa conclusão nem se liberta o claim. Isto não cancela fisicamente uma requisição Gmail já enviada nem resolve o estado durável do fornecedor. O controlo durável mantém os seus próprios fences, finalização e tratamento pós-POST; não foi alterado. Não há reset, lease, retry, libertação de claim ou orçamento implementados neste corretivo. O texto de timeout explicita a incerteza de uma chamada já iniciada.

## Busca e filtros

A busca vazia termina deterministicamente após uma chamada ao modelo e uma ferramenta de busca; não pede ao modelo que tente novas buscas ou invente resultados. A resposta identifica período/remetente/assunto disponíveis e pede confirmação humana. next_page_token ou coverage_complete=false produzem aviso explícito de cobertura parcial. As opções e a revisão humana dos resultados positivos mantêm o percurso existente.

O schema e a query Gmail foram exercitados sem mudanças: `fecho OU apuramento` em subject é um termo literal, não uma disjunção. O orquestrador passa a recusar essa combinação antes do Gmail e a pedir escolha explícita de assunto, conservando período e remetente. O contrato do modelo também exige clarificação de assuntos alternativos e proíbe escolher uma alternativa silenciosamente. Não se criou query livre, ferramenta nova nem pesquisa automática de alternativas. A interpretação de linguagem natural pelo fornecedor real não foi ensaiada; os testes cobrem os passos tipados simulados, não certificam todos os enunciados possíveis.

O transporte Gmail real, com HTTP inteiramente fictício, produziu duas consultas flexíveis para «apuramento» sem resultados. Ambas conservaram período e remetente. Este número de consultas internas é distinto da contagem de uma ferramenta gmailSearch no orquestrador; o limite existente continua a ser quatro consultas internas.

## Contagens por caso

| Caso sintético | Modelo | gmailSearch | gmailRead / ERP / scanner / writers | Resultado |
|---|---:|---:|---:|---|
| Handler: deadline com modelo que ignora abort | 1 | 0 | 0 | limit; resultado tardio descartado |
| Handler: Stop com modelo que ignora abort | 1 | 0 | 0 | HTTP 499; resultado tardio descartado |
| Handler: vazio, cobertura completa | 1 | 1 | 0 | answer com filtros; sem ciclo |
| Handler: vazio, cobertura parcial | 1 | 1 | 0 | answer com aviso parcial |
| Subject com OU | 1 | 0 | 0 | clarify explícito |
| Fornecedor indisponível | 1 | 0 | 0 | denied; sem retry |
| Erro Gmail | 1 | 1 | 0 | error; sem retry |
| Ferramenta inexistente repetida | 2 | 0 | 0 | limit |
| Gmail tardio após deadline | 1 | 1 | 0 | limit; resposta descartada |
| Stop já emitido, orquestrador | 0 | 0 | 0 | stopped |
| Cada filtro inválido: página >20, período >92 dias, remetente com operador | 2 | 0 | 0 | limit após recusa repetida |
| Cada abort cooperativo: deadline / Stop | 1 | 0 | 0 | limit / stopped |
| Transporte Gmail flexível vazio | 0 | 1 ferramenta equivalente / 2 GETs | 0 | vazio; âmbito conservado |

As contagens são verificadas por spies nas fixtures. Os 15 testes incluem casos parametrizados; uma linha pode representar vários testes ou duas verificações no mesmo teste. Relógio falso nos casos de deadline, sem sleeps de 60 segundos. A fixture #458 foi reutilizada sem alterar os seus contratos.

## Verificação

A matriz inicial de 10 testes, executada contra os dois ficheiros originais numa segunda cópia isolada, teve 6 falhas / 4 sucessos. A repetição da matriz de 15 casos contra as fontes originais teve 7 falhas / 8 sucessos. A prova adicional de abort cooperativo na base mostrou 1 falha (deadline classificado stopped) / 1 sucesso (Stop). Execuções por filtro de nome não alteraram testes nem introduziram `.skip`.

A matriz final dirigida passou: 15/15. A primeira execução completa também registou timeouts em hooks de newgang-crm-profile-fields e reimbursement-payment-exclude-0286 e num teste de issue359-consent-guard-c, sob verificações concorrentes. Não foram alterados esses testes, limites nem exclusões; a execução redundante foi interrompida antes da repetição final. A primeira execução completa detetou duas regressões introduzidas pela corrida de abort do modelo: devolvia antes da finalização durável. Essa corrida foi retirada apenas do modelo, preservando a ordem do controlo; a execução dirigida com os testes originais intactos de anexos12j e controlo87 passou 46/46. A execução conjunta anterior de deadline90, controlo87, retoma458, retoma458-integrated e a matriz então com 13 casos passou 44/44. Os testes existentes de controlo87 verificam que abort pós-POST retém claim uncertain e bloqueia nova chamada; são doubles locais e não uma prova de concorrência PostgreSQL.

`bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: sucesso (exit 0), após a correção final.

`bun run build`: sucesso (exit 0), 9.142 módulos; avisos de Browserslist desatualizado, importação mista e tamanho de chunks, sem alteração de configuração.

`bunx vitest run`: sucesso (exit 0), 331 ficheiros passaram, 2 ficheiros com skips existentes; 3.216 testes passaram, 6 skips existentes e 11 todo existentes (3.233 casos), em 393,49 s. A versão final passou os testes que tinham falhado, sem alterar esses contratos ou acrescentar skips/exclusões. `git diff --check`: limpo.

## Entrega e limites

Fontes a integrar e, futuramente, incluir no deploy exclusivo de data-entry pelo 0: `supabase/functions/data-entry/analysis-deadline.ts` e `supabase/functions/_shared/assistant-orchestrator.ts`. Testes: `src/test/data-entry-timeout461.test.ts`.

SHA-256 das fontes finais:

- analysis-deadline.ts: `fb34bb050f30517dba219e827e99623a8085ab51ad77f51eb56e46da72538340`.
- assistant-orchestrator.ts: `4a4119d5cc56556339a6a73d23cef9ce200b90c32b8af746083f64aca7df9df7`. Não há migração nem necessidade de alterar index.ts, flags, allowlist, OAuth, writers, catálogo fiscal ou UI.

Não foram usados Gmail/IA/scanner/ERP reais, documentos privados ou rede de negócio. Não foi verificado o fluxo real, instalado código, confirmado CI do novo commit, aberto PR ou encerrada a #333. O corretivo não demonstra a causa do incidente original nem certifica aceitação real.

Origem dos números: logs locais `/tmp/461-*.log` e spies das fixtures, sessão de 02/11/2026; executor E2b, frente Plataforma & Infra.
