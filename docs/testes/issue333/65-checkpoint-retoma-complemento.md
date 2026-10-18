# Prova65 — checkpoint imediato da retoma única

2026-10-18 17:41:47 UTC. HEAD recebido 503784643937891022d72c30385d91639897e2af.
Fase8 PARCIAL; fases1–7 concluídas,9–18 pendentes. Reserva #333 mantida, #323 intacta.

- Processo iniciado UMA vez: `PILOT8_MARKER=issue333-pilot8-11af044ae28127538fe8cc06be67541a bun docs/testes/issue333/pilot8/run-cloud57.ts --resume-identity63`, em background.
- Estado privado63 e parâmetros64 conferidos com a mesma identidade revista; secret0600 presente; PDF1517B SHA2568ae66f6a452934a1f43a5d9fb2c5f22fef7e407e4d2f1b8db53f03d75794798f.
- SELECT oficiais 0001–0004: incompatibilities=[], users1/exact1, signed0/sessions0/reference0, allowlist ativa0/core0/attempt0; cinco MD5 iguais aos esperados.
- Baseline novo lido DUAS vezes oficialmente: 15 relações count+MD5 e 18 fontes/ACL/config/owner iguais; transactions1966. Resultados privados guardados, não apenas queries.
- Relay `/tmp/issue333-select58-JFF13E`: respostas com id exato+fingerprint SHA256 da query+campos esperados conferidos pelo driver.
- Evento `controller_prepare=true` observado; no_login=true. Readiness até17:46:47UTC. Controller deve aplicar SQL64 com janela real; executor NÃO aplica ativação nem revogação.
- Ainda não comprovados: login, par HTTP, fatura, revogação/check, logout/ban/sessions0 finais. Não concluir piloto por este checkpoint.
- Nenhuma conta nova/retry/DDL/deploy/Publish/produto alterado. Fixture59 preservada.

Próximo: controller confirma ativação; executor serve readiness oficial e continua a MESMA execução. Após `controller_revoke_exact_two`, avisar controller para revogar; depois check próprio lote200/conferido sem escritas e cleanup independente. Falha: parar sem retry, preservar prova e coordenar cleanup.

## Encerramento em 17:44 UTC — timeout antes do login

- À chegada da confirmação do controller, 17:43:28 UTC, o mesmo PID ainda existia, mas já não aguardava readiness0005: havia emitido o pedido de cleanup0006 às17:42. PID vivo não significa piloto ativo.
- O prazo externo de readiness era17:46:47, mas o relay tem deadline individual60000ms (`OfficialSelectBridge.fresh`). O pedido0005 foi emitido às17:41 e expirou antes da confirmação humana. Não foi servido tardiamente, não houve reinício, retry ou login.
- O SELECT oficial0006 devolveu revoked={count:2,disabled:0}; a resposta só chegou após o prazo desse pedido de cleanup. O finally seguiu independentemente para ban e sessões0007. Não afirmar que0006 foi consumido ou que houve `controller_revoke_exact_two`: esse evento não apareceu no log.
- Controller avisado imediatamente para revogar as duas permissões. SELECT independente final confirmou allowlist do owner2/enabled0, banned=true, last_sign_in_atNULL, auth.sessions0 e refresh_tokens0.
- Sessões de entrada0, resultados0 e faturas do owner/referência0; transactions1966. Não houve upload, prévia, execução, par HTTP, download ou check pós-revogação nesta retoma.
- SELECT oficial0008: as15 relações count+MD5 e as18 fontes/ACL/config/owner permanecem iguais ao baseline; globais0. Allowlist total2→4 por ativação controller, linhas preservadas. A comparação final não considera essas duas linhas autorizadas um efeito financeiro.
- Processo terminou com `pilot_stopped=true,repeat_forbidden=true`; stopped.json contém apenas `Private driver stopped; read-only recovery only`. O erro detalhado de cleanup não foi persistido pelo CLI: não declarar cleanup do runner plenamente comprovado. A limpeza final foi comprovada por SELECT independente.
- Estado privado marcado `stopped_banned_no_login`; senha apagada, PDF e artefactos preservados. Não retomar esta conta nem criar substituta sem novo âmbito expressamente autorizado.
- Reserva de execução#333 libertada; Issue continua aberta: fases1–7 concluídas,8PARCIAL,9–18pendentes. Produto, #323, DECISIONS e fixture59 intactos. Sem DDL/deploy/Publish.

Limite técnico concreto: a espera humana de5min não protege um SELECT pendente de60s. Qualquer futura correção do executor deve ser local/isolada, com teste dinâmico dessa coordenação, antes de considerar outro piloto. Não implementada nesta tarefa.

## Adenda controller e evidência temporal — 17:45 UTC

Proveniência: atualização expressa do controller nesta conversa (não nova execução).
SELECT do controller às17:43:51UTC encontrou conta63 já banida, last_sign_inNULL, sessões0/faturas0, mas duas permissões ainda enabled. Controller aplicou `revoke.INERTE.sql62` renderizado para owner63+empresa+marcador+SHA exatos, transação com sucesso. SELECT independente posterior do controller confirmou active0/sessions0/bannedtrue/last_sign_inNULL/invoices0. Compatível com o SELECT final do executor já registado acima. Revogação foi do controller, não do runner.

Evidência local preservada: `process65.log`, `stopped.json`, requests/responses originais e `relay-termination65.json` privado sanitizado. Horários UTC medidos pelo mtime original dos ficheiros:

```text
0005.request (readiness): 17:41:47.821
0005.response: AUSENTE
0006.request (finally/readRevoked): 17:42:47.899
Intervalo 0005 → 0006: 60078.034 ms
0007.request (sessões após tentativa independente de ban): 17:43:48.308
0006.response: 17:43:52.386 — após 64487.700 ms; chegou DEPOIS de 0007
0007.response: 17:44:02.833
0008.request (baseline final): 17:44:02.983
0008.response: 17:44:31.445
process65.log: pilot_stopped=true, repeat_forbidden=true
stopped.json: Private driver stopped; read-only recovery only
```

Causa técnica sustentada pela sequência real e código: deadline individual60000ms do relay encerrou `readReady` sem resposta0005; a exceção atravessou a espera externa300000ms e entrou no finally aos60.078s. Também expirou a primeira leitura de revogação0006, antes de a resposta tardia chegar, razão de a revogação não ser comprovada pelo runner. Não foi expiração dos10min de permissões nem falha de login/HTTP. Limite: o log sanitizado NÃO contém stack/erro original; a cadeia acima é demonstrada pelos tempos+fluxo do código, não por uma mensagem de exceção recuperada. Não inventar o erro bruto.

Encerramento local confirmado às17:45:32UTC: PID37027 ausente; relay é uma pasta de spool, sem serviço autónomo. Marcado `CLOSED.json`, sem servir novos pedidos, apagar provas ou reiniciar processo. Senha já removida, estado privado bloqueia retoma. Nenhuma escrita Cloud nesta adenda. Fase8 seguePARCIAL; não há cleanup pendente.