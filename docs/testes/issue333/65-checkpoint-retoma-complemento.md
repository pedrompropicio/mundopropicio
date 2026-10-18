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