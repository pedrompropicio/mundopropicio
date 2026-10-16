# #330 — aplicação infra/API: bloqueio de formato antes de escrita

16/10/2026 23:18 UTC. Autorização: aplicar infra e API compatível; missão desativada, sem Publish.

HEAD local e GitHub main conferidos: 9a68f26437718ca22ba84f82d71c3a0bf573217d.

SQL aprovado SHA256: b19b09e32f6db9edb7c1fa3def1b9ec07bf1916d1ac1f5cac10a79e06e441cfd.
Patch API SHA256: a5f1e0c028f3fcd1adfb05e91090f6ef6cd6886ad84412b47944ca3e230d06fb.

Backend Lovable Cloud Live confirmado pelo canal de projeto. SELECT de guardas às23:18:25UTC: três tabelas, seis funções e índice330 ausentes. Nenhuma instalação anterior encontrada.

## Bloqueio

O schema do canal autorizado lov_database--migration exige SQL SEM instruções de controlo de transação, pois o próprio migrador gere a transação. O ficheiro aprovado contém BEGIN na linha3 e COMMIT na linha419. Não foi submetido em formato incompatível; não foram removidos silenciosamente sob autorização de hash literal.

Normalização proposta: retirar SOMENTE essas duas linhas, mantendo todos os outros bytes/DDL/seed/grants/regras intactos, com transação gerida pelo canal canónico. SHA256 desse payload: 0c7d4091b893bc8d4978472a3f50bf32f545961238ba72964f1d2e63a95fcb39. Cópia apenas temporária; artefacto aprovado original intacto.

Aguardar confirmação dessa exceção ao envio literal. Alternativa: não aplicar. Não usar run_sql para DDL nem canal alternativo.

## Estado

Nenhuma migration executada/gerada, nenhum DDL/DML Live, patch API não aplicado e nenhuma edge deployada. Missão permanece indisponível; sem perfis/créditos criados por esta tarefa. Snapshot completo imediatamente antes da escrita, verificação ACL/core e smoke estão por executar após desbloqueio. Sem testes de escrita Live, envios, Wallet, OAuth, crons ou alterações322/323. CI anterior quality success informado pelo Pedro; nenhum resultado novo alegado.