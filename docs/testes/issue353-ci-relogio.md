# CI — relógio dos testes · #353 · 24/10/2026 · MP Gestão Eventos · Mundo Propício

Baseline local: 11 falhas e 18 testes aprovados em capi-v2; host 24/10/2026, 11:35 UTC.

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

Validação após correção: pendente.

## Limites

Só testes sintéticos, PostgreSQL em memória e mocks; sem rede externa, Live, segredos, DDL/DML, deploy, Publish, reenvios ou mudanças na reserva #322.
Tipos e build ficam a cargo da verificação automática do ambiente; não serão executados manualmente. Resultados locais não provam CI remoto verde; controller confere o SHA final e fecha a Issue.

Origem: teste src/test/capi-v2.test.ts e execução local às 11:35 UTC de 24/10/2026. Emissor: 0 · Cowork.