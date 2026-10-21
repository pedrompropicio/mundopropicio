# #335 2l — manifesto de leituras

Estado: INCOMPLETO. Não confundir capturas automáticas/hashes ou revisão por subagente com leitura integral pelo executor.

## Confirmadas integralmente, por partes
- docs/QUADRO.md: 1–100,101–200,201–279 (279 linhas).
- AGENTS.md: 1–38; supabase/AGENTS.md: 1–3; roadmap.md: 1–61.
- .lovable/plan.md: 1–70,71–133.
- .lovable/memory/features/compensacao-ligada.md e payment-account-ownership.md: 1–40 (ficheiros completos).
- Issue #335: corpo + 12 comentários, API paginada, captura /tmp/issue335-2l/issue.txt: 1–100,101–200,201–300,301–400,401–467. Não certifica comentários acrescentados depois dessa captura.
- docs/questoes-issue335-fase2k-local.md: 1–18; docs/testes/issue335-fase2k-hashes.sha256: 1–35.
- docs/testes/issue335-fases12-local.md: 520–610 e701–795 confirmadas; 611–700 não confirmado integralmente nesta fase. Secção2k completa; secções2h–2j não certificadas integralmente.
- supabase/manual/20261021_issue335_offset_core.INERTE.sql original: 1–120,121–240,241–360,361–480,481–600,601–720,721–840,841–960,961–1075; posteriores alterações conhecidas por patches, não releitura integral adicional.
- offset_group_storage.INERTE.sql: 1–90; rollback: 1–11.
- offset_approval.INERTE.sql: 1–159; kill_switch candidato e rollback completos; offset_balance candidato 1–126 e rollback completo.
- supabase/tests/issue335/phase2h-run.sh: 1–23; phase2h-suite.sh: 1–37; fixtures: 1–75; install.py: 1–133; adapt.py completo; diff.py completo.
- phase2k-rollback.py: 1–49; phase2f-concurrency.py: 1–100,101–134; phase2j-concurrency.py: 1–124; phase2g-approval.sql: 1–136.
- run.sh: ficheiro integral recebido (1–164), mas apresentado numa única leitura: NÃO cumpre o pedido de releitura por partes.

## Parciais ou não confirmadas integralmente
- offset_core.ROLLBACK-INERTE.sql: 1–110,610–705; intervalo intermédio não relido integralmente nesta fase.
- offset_invariants.INERTE.sql: 1–105; restante e rollback sem confirmação integral.
- offset_approval.ROLLBACK-INERTE.sql: 1–100; restante não confirmado.
- restore.INERTE.sql: 1–100 de 150; rollback completo recebido 1–137, não por partes.
- cash_position e cash_position_invariant + rollbacks: não confirmados integralmente nesta fase.
- phase2j.sql: 1–120 apenas; phase2k-focused.sql, matching*, concurrency.sql, phase2h-extract/capture e TODO live/phase2k: não confirmados integralmente.
- Fórmulas cliente: revisão independente identificou os consumidores; não houve releitura integral do código cliente pelo executor nesta fase.

## Ficheiros novos
status/emergency/reactivation candidatos e rollbacks; phase2l.sql/rollback.py: criados nesta fase, conteúdo conhecido. Isto não substitui revisão independente.

Conclusão: requisito (8) não encerrado; sem autorização para A–C nem declaração de aceitação técnica.