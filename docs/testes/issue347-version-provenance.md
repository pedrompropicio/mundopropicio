# #347 — proveniência de version.json (lote #473, E2b, R1)

## Âmbito e fontes

Preparação local em 02/11/2026, base `d8d9c954f01cffb5a1234dd4d2c3cb7dc5e84a16`, igual ao HEAD conferido no runner. Árvore inicialmente limpa. Despacho válido até 09:59 UTC; sem alteração dos ficheiros da #475. Foram lidos AGENTS, INDEX, QUADRO (execução e frente 2), estado-plataforma-e-infra, memória `.lovable/memory/features/build-code-splitting.md`, procedimento anterior de Publish, `vite.config.ts` e `src/lib/versionCheck.ts`. A pesquisa em docs/memória encontrou o mecanismo existente; não foi criada outra política de atualização.

O CI da base é o indicado no despacho, não uma observação remota desta execução. Não houve rede para serviços MP, Live, Publish, DDL/DML, commit ou push. CI sobre estas alterações e integração por branch/PR ficam para o controlador.

## Causa comprovada e hipótese

Comprovado pela leitura anterior: `resolveCommit()` devolvia qualquer saída git não vazia após trim; se git falhasse, escolhia a primeira variável não vazia entre `VITE_COMMIT_SHA`, `COMMIT_REF`, `GIT_COMMIT`, sem validação. Assim, uma variável arbitrária podia entrar no JSON e uma fonte inválida podia esconder outra válida. Se nenhuma fonte existisse, devolvia `null`.

O `commit:null` observado pelo Pedro em 23/10 é contexto fornecido no despacho, não uma leitura de produção feita aqui. Ausência de git e das variáveis no builder Lovable continua hipótese do ambiente: a leitura do código e a existência de variáveis no runner não a demonstram. Não se inventou fonte proprietária, configuração, chave, SHA remoto nem timestamp substituto.

## Antes e depois

O build usa agora `scripts/build-commit.ts`, com leitura git injetável e ambiente restrito às três fontes existentes. Cada candidato passa por trim e validação hexadecimal completa de 40 (SHA-1) ou explicitamente 64 (SHA-256) caracteres, normalizado em minúsculas. SHA curto, nome de ramo, timestamp, caracteres inválidos e quebras internas são recusados. Git ausente/inválido permite procurar a primeira variável válida na ordem anterior. Sem candidato válido: `commit:null`, `commitSource:unknown`. Valores rejeitados e mensagens de erro não são publicados ou registados pelo resolvedor.

O plugin real mantém `buildId` textual, `builtAt` ISO do mesmo instante e `commit`, acrescentando apenas `commitSource` com fonte validada sintaticamente. A validação não autentica a veracidade de uma variável. Também o SHA git identifica HEAD, não certifica alterações locais sem commit: este build local usa deliberadamente uma árvore modificada.

`src/lib/versionCheck.ts`, updater, PWA, reload e chunks não foram alterados. O consumidor continua a comparar apenas `buildId` e a navegação continua reservada ao atualizador após clique (#351). O INDEX foi alterado apenas no parágrafo pós-Publish. O novo procedimento distingue correspondência de SHA, build não identificado/cache e comprovação inconclusiva; não exige build posterior ao deploy nem apresenta marcador funcional como equivalência integral. Hash de artefacto exige referência esperada confiável, cadeia ainda não estabelecida.

## Testes e provas locais

O teste `src/test/issue347-version-provenance.test.ts` cobre git válido, falha e saída inválida, prioridade dos três fallbacks, trim/case, SHA-256, ausência e várias entradas inválidas. Os testes do consumidor importam a configuração Vite real, executam o hook `closeBundle` do plugin e verificam o JSON escrito, a igualdade com `define.__BUILD_ID__`, a relação temporal e a ausência de valores privados/logs. Apenas git e escrita de ficheiros são simulados nessa prova; não há fixture com uma segunda implementação do plugin.

A primeira execução dirigida revelou literais de teste com comprimento errado; foram corrigidos para IDs completos. Resultado dirigido final: 19/19 PASS, sem skip novo. As verificações globais e a inspeção do build são registadas abaixo quando concluídas.

## Limitações e aceitação operacional

Esta preparação não comprova o SHA publicado no Lovable e não resolve a #347 em Live. Na próxima janela autorizada falta observar o builder real, estabelecer uma fonte ligada ao HEAD aprovado e correlacionar a execução/artefacto com o JSON servido. Se continuar sem fonte válida, o commit fica `null` e a aceitação operacional permanece pendente. `commitSource:unknown` não distingue ausência de fonte de valor inválido, por desenho sem exposição dos valores.

A memória e o procedimento antigo mantêm referências históricas mais fortes; não foram editados por estarem fora dos caminhos autorizados. O critério corrigido está no INDEX e em `docs/procedimentos/PROC-verificar-versao-publicada.md`.

## Resultado do build local

`bun run build`: exit 0, incluindo geração PWA, sem alteração de limites. Avisos existentes de Browserslist, imports e tamanho de chunks não foram tratados por estarem fora do âmbito. JSON inspecionado:

```json
{"buildId":"1793599242122","builtAt":"2026-11-02T06:00:42.122Z","commit":"d8d9c954f01cffb5a1234dd4d2c3cb7dc5e84a16","commitSource":"git"}
```

Asserções locais confirmaram igualdade com `git rev-parse HEAD` recolhido pelo shell, `buildId === String(Date.parse(builtAt))` e presença do mesmo ID num JS gerado. A primeira tentativa de inspeção encontrou `EPERM` ao chamar git através de `node:child_process`; a leitura pelo shell e asserção sobre esse ficheiro temporário passaram, sem alterar o produto ou contornar permissões. O build real resolveu git normalmente. Estes resultados dizem respeito ao runner, não ao builder Lovable.

## Verificação global antes/depois

- Antes: `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` exit 0.
- Antes: `bunx vitest run` exit 1; 3362 PASS, 1 FAIL, 16 skipped, 11 todo; 336 ficheiros PASS, 2 FAIL, 2 skipped. Falhas por timeout existentes em `newgang-crm-profile-fields.test.ts` (beforeAll 10 s) e `issue359-consent-guard-c.test.ts` (teste 5 s). Esta execução foi iniciada antes de criar o teste #347 e não o incluiu.
- Depois: o mesmo comando tsgo, repetido sobre a versão final, exit 0.
- Depois: `bunx vitest run` completo exit 0; **3392 PASS, 6 skipped, 11 todo**, 339 ficheiros PASS e 2 skipped (341 no total). Inclui os 19 testes novos e os dois ficheiros que tiveram timeout na base. Nenhum skip novo, timeout aumentado, limite relaxado ou correção alheia ao âmbito.
- Build local: `bun run build` exit 0; inspeção do JSON/bundle acima PASS.
- `git diff --check`: exit 0.

Logs locais desta execução em `/tmp/issue347-tsgo-before.log`, `/tmp/issue347-tsgo-final.log`, `/tmp/issue347-vitest-before.log`, `/tmp/issue347-vitest-after.log`, `/tmp/issue347-targeted.log` e `/tmp/issue347-build.log`; são temporários do runner, não provas remotas nem artefactos publicados. As execuções completas sobrepuseram-se parcialmente; os timeouts iniciais não se repetiram na execução final, sem inferir causa definitiva.
