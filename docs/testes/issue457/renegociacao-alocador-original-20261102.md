# #475/#457 — alocador original: ensaio matemático inerte

Base confirmada: `dbd0aa9651e4a930c645bba91a635db7e009d4bc`; checkout inicialmente limpo. Despacho recortado à aritmética, coordenado na #473; não é entrega da RPC inteira. Leitura: INDEX, QUADRO (execução/frente 4), AGENTS raiz/supabase, estado financeiro, memória `transaction-installments.md`, arranque 0 de 02/11, D-ERP345–351, PROC-promocao, helper/testes #471 e três relatórios anteriores indicados. Memória antiga não supera #298/Modelo A nem código atual. Sem consulta a replay/bindings privados ou serviços MP.

## Contrato e prova

`supabase/manual/issue475_original_allocator.INERTE.sql` é artefacto de ensaio, não migração aplicável: cria somente `pg_temp.issue475_original_allocator(numeric,numeric[])`, removida ao fechar a sessão. Função matemática IMMUTABLE, SECURITY INVOKER, search_path fixo `pg_catalog`, EXECUTE revogado de PUBLIC, sem grants de produto, tabelas, escritores ou endpoint de aplicação. Rollback do ensaio comentado no ficheiro.

Entrada interna: total de cêntimos inteiros e array de pesos inteiros (bases EUR escaladas por 10.000). Total, cada peso e soma dos pesos têm limite `9007199254740991`; exige valores finitos, inteiros e não negativos e array unidimensional não vazio/sem nulos. Valida tudo antes da repartição, incluindo para total zero. Zero retorna zeros mesmo com pesos todos zero; total positivo com soma zero recusa. Peso zero aceite aqui não amplia o contrato de plano da RPC.

Produtos, quocientes e restos são `numeric`; `div/mod` calculam bases inteiras e restos exatos, sem float ou arredondamento intermédio. Restantes cêntimos seguem restos decrescentes, com desempate por posição de entrada via WITH ORDINALITY, independentemente do lower bound. A saída tem lower bound 1 e conserva a ordem de entrada. A soma é exata e o erro absoluto de cada elemento relativamente à quota racional é menor que um cêntimo; para total/soma zero, a quota racional não está definida e a saída contratada é zero.

| Total (cêntimos) | Pesos | Resultado (cêntimos) |
|---|---|---|
| 10001 | 1,1,1 | 3334,3334,3333 |
| 10002 | 1,1,1 | 3334,3334,3334 |
| 10001 | 1,2,3 | 1667,3334,5000 |
| 1 | 1,1,1,1 | 1,0,0,0 |
| 2 | 0,1,0,1,1 | 0,1,0,1,0 |

O teste lê e executa os bytes completos do SQL em PGlite descartável, sem mocks da função, credenciais ou serviços MP. Cobre exemplos, quatro casas escaladas, empates, uma parcela, zero, lower bounds 0/negativo, limites seguros, produtos maiores que bigint e recusas de total/pesos inválidos, NaN, infinitos, frações, nulos, array vazio/multidimensional e limites de peso/soma/total. Há 120 casos gerados deterministicamente com paridade por importação do helper real #471, soma, não negatividade, erro racional exato e prioridade/desempate. Os resultados numéricos do cliente são convertidos para cêntimos por texto decimal e BigInt, sem multiplicação float nem fórmula alternativa de repartição.

O SQL aceita `9007199254740991` cêntimos numa parcela; `distributeInstallmentOriginal('90071992547409.91',[1])` recusa por `centsPayload`, pois a serialização decimal number perde precisão. Provas SQL no limite e de produtos maiores que bigint são separadas da paridade no domínio comum: esta assinatura interna NÃO é um payload JSON seguro em reais/EUR. Não existe conversão JSON/JS no artefacto, escolha de origem, câmbio, IVA, moeda ou limite de quantidade de parcelas.

O harness consulta pg_proc/proconfig/ACL efetiva: invoker, immutable, search_path fixo, PUBLIC sem EXECUTE, role sintética sem EXECUTE e grants apenas ao owner. Isto não prova ACL/RLS da RPC completa. Os quatro testes de `issue475-source-blockers.test.ts` permanecem byte a byte inalterados e continuam a demonstrar o erro antigo, a omissão de forecast_id, a contraprova cross-tenant e os rollbacks sintéticos da fonte antiga. O novo helper não foi integrado na RPC.

## Comandos e resultados

- Focados: `bunx vitest run src/test/issue475-original-allocator.test.ts src/test/issue475-source-blockers.test.ts src/lib/__tests__/issue471-installment-original.test.ts` — 3 ficheiros, 85 testes aprovados (47 novos, 4 antigos, 34 da #471), sem skips; 3,34 s.
- Tipos: `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` — exit 0; primeira execução identificou duas tipagens no teste novo, corrigidas sem alterar configuração.
- Suíte: `bunx vitest run` — exit 0; 342 ficheiros aprovados e 2 skipped; 3448 testes aprovados, 6 skipped e 11 todo existentes; 152,05 s. Os 47 testes novos passaram nesta execução (3,837 s), já com as correções de tipos. Sem novos skips, timeout aumentado, dependências ou configuração alterada. Não houve suíte anterior às edições nesta sessão; CI da base é o contexto fornecido no despacho. A suíte completa foi executada uma vez.
- Build: `bun run build` — exit 0; Vite 45,56 s e PWA gerado; avisos não bloqueantes de Browserslist, minificação/imports e tamanho de chunks, sem ajustes de configuração ou dependências.
- Conferência final: `git diff --check` limpo; leitura integral dos quatro ficheiros novos e comparação da lista completa (incluindo untracked) com a lista fechada, sem desvios. O teste antigo foi comparado byte a byte com HEAD. Nenhum ficheiro já versionado foi alterado.
- SHA-256 do SQL: `edb91fbc1a11ceb892dea64d69efda6d42c3aa3c3af43a15ad9434ba8f31cfdd`.

## Limites

Integração na RPC, origem armazenada, autorização por empresa, metadados/BP, rollback transacional de produto, concorrência e gates G1–G5 continuam pendentes. Nenhum catálogo instalado foi qualificado; não se inventaram stubs de triggers. Não houve instalação, SQL MP, dados reais, deploy, Publish, aplicação de migração ou alteração de guardas #471/#413/#404. #475/#457 permanecem abertas; não se declara renegociação estrangeira disponível. CI remoto do diff e revisão/merge manual permanecem posteriores; o sucesso da CI da base foi fornecido no despacho, não reconsultado nesta sessão.
