# #352 — reconstrução das colunas de insights e G1

Data: 26/10/2026. Parecer: [6412773197](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6412773197). Executor: Codex. Live: apenas SELECT de catálogo. G2 não autorizado nem executado.

## Resultado

Correção verificada; G1 permanece vermelho por um novo objecto sem origem demonstrada nesta etapa: `public.partner_aporte_mirror`. A versão `20260915004441`, que antes falhava em `campaign_name`, terminou com exit_code 0, sem alteração à função.

- [Commit privado 2ea7f0be](https://github.com/pedrompropicio/mundopropicio-replay/commit/2ea7f0be3ffa36f29a230948c3f946a1fc494562).
- [G1 40302830063](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40302830063), artefacto `schema-replay-352` (12641777076).
- Execução UTC: 2026-10-26 09:51:59–09:59:10.
- 1.100 entradas concluídas / 1.464; 1.101 tentadas; 1 falhada; 363 não tentadas.
- Checkpoints de referência: cidades **47/47**, categorias **114/114**, ambos sem diferenças.

## Proveniência e alteração limitada

O inventário mostrou uma distinção importante: Meta não tinha uma entrada no manifesto de relações reconstruídas; a criação executada vinha de `orphan/20260511030000_meta_insights_and_event_link.sql`, linhas 18–47. Google é criada por `ledger/20260821214900_356415ee-a2b1-492f-8100-24a6c14b90a6.sql`.

SELECT de colunas às 09:39:28.385 UTC: 39 colunas Meta e 22 Google. SELECT de metadados do ledger às 09:41:15.406 UTC: 14 versões mencionam estas tabelas; nenhuma cria Meta, uma cria Google. Os MD5 dos três ficheiros estruturais (20260821214900, 20260821221938, 20260920003224) coincidem com os statements actuais de Live.

Meta passa a nascer com 31 colunas: todas as que não são acrescentadas por ALTER do ledger, com tipo, nulidade e default exactos do catálogo. Foram recuperadas campaign_name, date_stop, actions e action_values, além das diferenças de definição. As oito colunas de vídeo continuam exclusivamente no ALTER de 20260821221938. Currency já estava no órfão e não tem ADD no ledger: permanece na criação; isto não afirma que fazia parte das primeiras 30 colunas históricas de Live.

Google mantém as 21 colunas originais, já coincidentes com Live; video_metrics continua no ALTER de 20260920003224. Nenhuma alteração ao seu SQL.

Foi criada uma cópia reconstruída da definição Meta e um overlay que substitui somente o CREATE na posição original. Prefixo, sufixo e constraints preservados. Nenhuma alteração aos originais, funções, seeds ou regras de salto; nenhuma nova entrada ou alteração de ordem no plano.

Provas privadas: `reconstructed/insights-manifest.json`, `insights-columns-live.json`, `insights-ledger-proof.json` e `insights-source-inventory.json`. O manifesto classifica cada coluna e liga-a à criação ou ao ALTER responsável.

## Validação

- 9 testes locais PASS.
- 66 verificações nativas do job PASS, incluindo quatro novas verificações de colunas: Meta inicial 31/31; Google inicial 21/21; Meta após ALTER 39/39; Google após ALTER 22/22.
- Checkpoints no replay efectivo: Meta inicial 31/31, Google inicial 21/21, Meta após ALTER 39/39, todos PASS. O checkpoint Google de 20/09 não foi alcançado; 22/22 foi validado apenas no teste nativo isolado.
- check-pii: 1.244 ficheiros SQL, zero ocorrências e zero JSON inválidos.
- Crons: 12 exportados e removidos, zero no fim; agendador desligado.
- Saltos destrutivos: 155.
- Saltos idempotentes: 2.135 (base 1.162; policy_equal 611; using_index 175; trigger_equal 169; insert_duplicate_equal 1; txn_control 10; insert_duplicate_superseded_by_ledger 3; grant_revoke_missing_object 4).
- Saltos revistos: 4 (orphan_dml_without_effect 1; data_volume_assertion 3).
- Compensação ACL final não alcançada.

## Novo bloqueio: parar para parecer

`ledger/20260917115514_28240247-ae1d-4402-b396-032d823b26a0.sql`: UPDATE iniciado na linha 5, referência à relação na linha 7, SQLSTATE **42P01**, objecto **public.partner_aporte_mirror**. A versão foi revertida integralmente.

Origem não demonstrada nesta etapa. Não foi reconstruída a relação, semeada qualquer linha, acrescentada regra de salto ou alterada a migração. G1 pára aqui; G2 não corre.

## Digests e coordenação

- Original Meta: `79426691eddc19e37bb18526dcf3de37b164119626881092246d19c606404e2d`.
- Overlay executado: `802a6f70ab42674af0002be0bcacb79ad941a72384d3658791181233a38743ea`.
- Manifesto da reconstrução: `d3217ff8cae3d7aa509ae62e2bd6ebb6bbcd3d89a95739399c1ef618d872fe95`.
- Catálogo de colunas: `0e58b8528a226fd25d0d1dc92aacf0588b8e37b31ecf3e58d621c4ed8dea5a29`.
- Plano: `01e6db3008a6c81e3939f6852e88d311c73f4a3db60d6afad60586749ccf6781`.
- ZIP do run: `23bdf72ab73ab6f8b14cd141b96bea7981a3bd001af0c734ac2b557a76196847`.

#329 antes do push privado: 09:51:26.455 UTC, GitHub público = Lovable = f3f1340363cf36b3dbef30e9f884637337b47df3, agentFinished=true. Reconfirmação antes do push documental registada no comentário da Issue.

Reserva #352 mantém-se até fecho do gate; QUADRO e estado ficam para Claude Code, sem escrita pelo Codex. Issue aberta. Este relatório contém apenas metadados, contagens e hashes; SQL e evidências detalhadas ficam no privado.
