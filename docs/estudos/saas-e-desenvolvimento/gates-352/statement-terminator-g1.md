#352 — statement_terminator e G1

Data: 26/10/2026, UTC. Executor: Codex. Âmbito R0 no repositório privado.

A regra statement_terminator separa o SQL de entrada dos comandos do runner, acrescentando uma nova linha e terminador quando necessário. A análise ignora comentários finais e respeita strings e corpos dollar-quoted. Entradas já terminadas ficam intactas. Nenhum ficheiro histórico, overlay ou plano foi alterado nesta etapa.

Implementação: [commit privado 640f0f1](https://github.com/pedrompropicio/mundopropicio-replay/commit/640f0f111b2635b5bedcb50f583d0b7f50b682ae).

Validação: 7 testes locais novos e 28 anteriores aprovados; 5 testes nativos novos, incluindo entrada sem terminador seguida de RELEASE SAVEPOINT e entrada já terminada. Total nativo: 40 aprovados.

[G1 — run 40250605490](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40250605490), desde vazio, entre 00:42:13 e 00:47:17 UTC: VERMELHO. Concluídas 922 de 1457 entradas; 923 tentadas, uma falhada, 534 não tentadas. Avanço de 45 entradas face ao run anterior. A versão 20260818175012 passou. Checkpoint 20260430033938: 114/114, sem diferenças. Seed isolado: 117 linhas, zero pais por resolver.

Saltos: 155 destrutivos e 2126 idempotentes. Variantes idempotentes: base 1158; policy_equal 610; using_index 175; trigger_equal 169; insert_duplicate_equal 1; txn_control 10; insert_duplicate_superseded_by_ledger 3. Os ficheiros ledger/skipped-destructive.json e ledger/skipped-idempotent.json no artefacto privado contêm os registos completos. Crons locais: 12 exportados de forma sanitizada, zero após limpeza, agendador desligado.

Primeira falha nova: ledger/20260825133647_3473c587-9a42-4e00-bc62-04e305230d17.sql, UPDATE iniciado na linha 11; SQLSTATE 42703, coluna f.paying_partner_id inexistente, referida na linha 16 em public.event_forecasts. A pesquisa local encontrou a criação de paying_partner_id em 20260825124356, linhas 1–2, mas sobre public.transactions; essa definição não satisfaz a dependência em event_forecasts. Não foi aplicada qualquer correcção a este novo bloqueio. Proposta para revisão: apurar a origem histórica da coluna de event_forecasts ou a validade histórica desta instrução antes de autorizar outra alteração.

G2: NÃO EXECUTADO, condicionado a G1 verde. Não houve nova consulta ou escrita em Live nesta etapa.

Artefacto privado 12620990934; SHA256 do ZIP: 7be9d00f63b2964dc828632b2a0cd5f48aac407adba56e78f37cdf0273decc94. Inclui logs, execução, testes, checkpoint e saltos; os catálogos locais são parciais e não representam G2.

Reserva #352 mantida até ao fecho do gate; QUADRO e estado permanecem a cargo do Claude Code. Este fecho publica apenas este documento novo, sem SQL integral nem dados de Live. Verificação #329 imediatamente antes do push e resultado do scanner registados no comentário da Issue.
