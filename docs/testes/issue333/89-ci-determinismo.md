# Tarefa89 — correção local do CI414

Base GitHub/Lovable verificada: `11b0243487c7228e9cdc0d10b8aa81486634e849`. Controller: agentFinishedtrue, CI414 run39246566917 quality118039817475, falha única proof60. Autorização Pedro limitada à correção CI333.

## Causa e reprodução

O teste escrevia respostas depois de 30/50ms reais, enquanto o bridge relê ficheiros a cada 200ms e verifica deadline antes da leitura. Sob carga, uma espera acorda depois do prazo: mesmo uma resposta já entregue com fingerprint errado produz deadline. Dois selects concorrentes também atribuem sequência depois de mkdir assíncrono: o teste não deve presumir qual query recebe 0001.

Reprodução local na base antiga: substituir Date.now/setTimeout só no processo descartável, entregar resposta com fingerprint errado durante a primeira espera e avançar relógio para 3001ms. Resultado: `Official SELECT bridge response deadline; no account fallback`, exit1 (falha esperada do diagnóstico), em vez de fingerprint mismatch. Sem rede, contas, dados Cloud ou piloto.

## Correção mínima

- OfficialSelectBridge aceita opcionalmente now/sleep; defaults continuam Date.now/setTimeout, deadline20000ms e polling200ms. Validação SELECT/id/fingerprint/schema e failclosed não mudaram.
- Testes de identidade/fingerprint/schema usam relógio parado e prontidão explícita: sleep só é alcançado depois do request gravado e ENOENT na resposta. Só liberam polling após writeFile terminar.
- Concorrência: lê id/fingerprint da query realmente gravada; entrega segundo resultado primeiro, com id duplicado, e depois fingerprint stale no primeiro. Ambos rejeitam pelo motivo correto, independentemente da ordem de mkdir.
- Prazo real sem resposta continua separado e passa com defaults. Nova negativa controlada: resposta exata no instante3000ms é recusada sem fallback; não aceita resposta tardia.
- Ficheiros temporários são removidos depois de cada teste. Não altera worker60 opt-in nem fixture70.

## Verificação

1. Diagnóstico antigo: exit1 esperado.
2. `bunx vitest run src/test/issue333-proof60.test.ts src/test/issue333-private-cloud57.test.ts src/test/issue333-baseline58.test.ts src/test/issue333-future-runner.test.ts`: exit0, 28PASS/4ficheiros; proof60 7PASS, incluindo prazo real e fronteira controlada.
3. `bunx vitest run`: UMA execução default, sem flags de workers/timeout; exit0, 193ficheirosPASS/2skip, 1653PASS/6skip/11todo; 82.69s. Não constitui garantia de ausência de todos os flakes de outras frentes.
4. Harness automático: build OK em2026-10-19T11:51:56Z. Tipos não executados manualmente: harness/CI controller validam SHA final. Nenhum canário de rede executado nesta tarefa.
5. `git diff --check`: exit0. Diff e hashes próprios89; não regenerar87/88.

## Limites e próximo passo

UploadEnabled/ANALYSIS_ENABLED/ANALYSIS_PROVIDER_REVIEWED permanecemfalse. 8PARCIAL/9não liberada/10PARCIAL. SQL88/rollback, CAPI322, portal-track, reservas322/323, AGENTS raiz e DECISIONS preservados. Zero Cloudquery/write/DDL/DML/modelo/deploy/Publish/AuthStorage/limpeza/fixtureERP.

Só subreserva89 libertada. Controller deve confirmar HEAD integrado e CIqualitySUCCESS novo antes de próximo dispatch não corretivo/Publish. Após verde: revisão final SQL88/ACL alvo/rollback para autorização própria de aplicação; não novo plano genérico nem ativação implícita.