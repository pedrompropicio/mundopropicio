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