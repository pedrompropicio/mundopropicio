# CI — relógio dos testes · #353 · 24/10/2026 · MP Gestão Eventos · Mundo Propício

Resultado local final: 2409 PASS, 6 skip, 11 todo e zero falhas; baseline capi-v2: 11 FAIL/18 PASS.

## Causa e âmbito

Base comum recebida: `3afd243a92c6462f49be483faccf954391276d3b`, sem alterações locais. Issue e autorização conforme despacho do controller; sem consulta externa à Issue nesta execução.
Fixtures fixas em 18/10/2026 e NOW em 19/10/2026. O handler usa Date global na expiração, independentemente de deps.now. A partir de 24/10 às 10:00 UTC, os eventos ultrapassam seis dias e onze expectativas de payload/envio/retry deixam de passar. Não é regressão de produção introduzida pelos commits documentais.

## Plano de correção

1. No único teste autorizado, fixar apenas Date em beforeEach do describe handler e restaurar em afterEach, conservando os temporizadores reais.
2. Reutilizar a prova de idade e acrescentar fronteiras antes/no/depois de seis dias no percurso simulado do handler; provar limpeza de Date e temporizadores.
3. Executar capi-v2 com o host de 24/10 e um host futuro simulado; depois executar a suite integral após todos os ajustes.
4. Registar resultados locais e manter a reserva até CI independente no SHA final. Sem alterar produção, #322 ou regras gerais.

## Comandos e resultados

`bunx --no-install vitest run src/test/capi-v2.test.ts` — antes: exit 1; 11 FAIL/18 PASS, 29 testes; 6,46 s. Host real: 24/10/2026 11:35:47 UTC.

`bunx --no-install vitest run src/test/capi-v2.test.ts` — depois, host real 24/10/2026: exit 0; 33 PASS, 4,42 s.

`ISSUE353_HOST_DATE=2030-01-01T12:00:00Z bunx --no-install vitest run src/test/capi-v2.test.ts --config /tmp/issue353/vitest.config.ts` — host futuro simulado: exit 0; 33 PASS, 4,73 s. Configuração temporária fora do repo reutiliza a configuração canónica e acrescenta um Date do host via Proxy, preservando todos os construtores com argumentos. NOW do teste permanece 19/10/2026 02:00 UTC. Primeiro ensaio do harness temporário com construtor incompleto falhou no initdb local (29 PASS/4 não executados); foi corrigido só em /tmp e repetido integralmente com 33 PASS.

`bunx --no-install vitest run --maxWorkers=2 --hookTimeout=60000` — suite integral FINAL após todos os ajustes ao teste e ao harness: exit 0; 259 ficheiros PASS/2 skip; 2409 PASS/6 skip/11 todo, 289,56 s. Nenhum skip/todo acrescentado ou alterado. Os 2394 PASS/11 FAIL do CI anterior são fonte controller; não foi repetida a suite integral pré-fix local, apenas capi-v2.

Quatro regressões novas: antes/no/depois do limite de seis dias no handler simulado e restauração do Date do host após o describe handler. Prova de fronteiras também integrada no teste puro existente. Date.now igual ao NOW fixo, temporizador real preservado, crypto/payload/retry e PostgreSQL em memória exercitados. Fixtures, MAX_AGE_DAYS, guardas e expectativas existentes não alteradas.

`git diff --check` — exit 0. Verificação automática: últimas entradas `build OK` às 11:36:22 e 11:36:46 UTC. Tipos isolados não executados manualmente; tsgo/CI final dependem do controller.

Código validado no commit automático `c83ca22ec800d9ae7a745029787b41913e30d4b1`; o commit anterior `4afd1e612` contém apenas o plano documental/reserva. Comparação com a base comum: só teste e documentação próprios, nenhum commit alheio sobrescrito. Fecho documental posterior não altera código; o controller deve conferir CI no SHA final recebido, não apenas neste SHA do código.

## Limites

Só testes sintéticos, PostgreSQL em memória e mocks; sem rede externa, Live, segredos, DDL/DML, deploy, Publish, reenvios ou mudanças na reserva #322.
Tipos e build ficam a cargo da verificação automática do ambiente; não serão executados manualmente. Resultados locais não provam CI remoto verde; controller confere o SHA final e fecha a Issue.

## Questões/decisões em aberto

Nenhuma decisão nova para Pedro. Reserva #353 mantida até controller confirmar código, tsgo e CI remoto no SHA final; Issue não editada nem fechada. Relatório técnico pontual, sem modelo aplicável no catálogo; docs/modelos/ e INDEX intactos.

Origem: src/test/capi-v2.test.ts, comandos locais de 11:35–11:42 UTC e /tmp/observability/build-errors.log, 24/10/2026. Emissor: 0 · Cowork.