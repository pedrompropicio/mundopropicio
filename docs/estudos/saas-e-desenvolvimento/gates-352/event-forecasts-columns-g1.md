#352 — reconstrução das colunas de event_forecasts e G1

Data: 26/10/2026, UTC. Executor: Codex. Autorização: despacho Pedro/Claude nesta sessão, extensão live_only_ddl_reconstructed a colunas.

SELECT de catálogo às 00:51:50 UTC confirmou ordering_partner_id e paying_partner_id em public.event_forecasts: duas colunas uuid opcionais, sem default, duas FKs e dois índices. A FK ordering_partner_id usa ON DELETE SET NULL. Foram verificados os 499 órfãos e dois seeds, com hashes do plano: zero referências a esses nomes. Nenhum ficheiro de origem foi substituído.

[Inventário](event-forecasts-columns-inventory.json): nomes, oid, limites, contagens e hashes, sem dados de negócio. Um único ficheiro privado reconstruído contém exclusivamente DDL. effective_at 2026-08-25T12:44:00Z, entre o ledger irmão 20260825124356 e a primeira referência 20260825133647, conforme intervalo autorizado. O manifesto privado inclui SELECT, hora, catálogo, digest e hashes das fontes dos limites.

[Commit privado 4cef1d7](https://github.com/pedrompropicio/mundopropicio-replay/commit/4cef1d77df5d003c25ab05e28aacc5da25fe4d09). Plano: 1458 entradas; todas as 1457 entradas anteriores intactas. Seis testes locais da extensão PASS. A nova verificação nativa compara as definições locais das colunas, defaults, nulabilidade, FKs e índices com o SELECT de referência; resultado: PASS, duas colunas. Os 40 testes nativos anteriores continuam PASS. Scanner completo do workflow PASS.

[G1 — run 40251703822](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40251703822), desde vazio, 00:56:10–01:02:52 UTC: VERMELHO. Concluídas 1015/1458; 1016 tentadas, uma falhada e 442 não tentadas. Avanço de 93 entradas concluídas, incluindo a nova reconstrução. A versão 20260825133647 passou. Checkpoint 20260430033938: 114/114, zero diferenças.

Saltos: 155 destrutivos; 2129 idempotentes, sendo base 1161, policy_equal 610, using_index 175, trigger_equal 169, insert_duplicate_equal 1, txn_control 10 e insert_duplicate_superseded_by_ledger 3. Registos por ficheiro e linha nos artefactos privados ledger/skipped-destructive.json e ledger/skipped-idempotent.json. Crons: 12 exportados sanitizados, zero após limpeza; agendador desligado.

Primeira falha não coberta: ledger/20260911145253_9401f450-7c4c-44a8-ac69-d0ccdfe4de9c.sql, linha 14, REVOKE, SQLSTATE 42883: função public.crm_auto_link_meta_campaigns_to_events(uuid) inexistente naquele ponto.

Proveniência verificada por leitura e manifesto de execução: orphan/20260511030000_meta_insights_and_event_link.sql cria a função na linha 145; ledger/20260511032125_20260511032123_publish_migration_from_pg_dump.sql remove-a na linha 3. Ambas as entradas foram concluídas neste run. A recriação identificada está em drizzle/migrations/0108_derp249_meta_autolink_safe.sql, linha 72, id 109, posterior e ainda não alcançada. A versão 20260911145419 também contém REVOKE sobre essa função, na linha 13, mas ainda não foi tentada.

A ocorrência é 42883 em REVOKE, não 42703 de coluna. Não foi ignorada nem convertida numa reconstrução de função. Para revisão: determinar se a função foi recriada fora do histórico antes dos REVOKE ou se estes não produziram efeito; só então decidir o tratamento. Nenhuma nova regra aplicada.

G2: NÃO EXECUTADO, condicionado a G1 verde. Live apenas SELECT de catálogo nesta etapa; nenhuma escrita, infraestrutura, DSN, deploy ou Publish.

Artefacto privado 12620953059; SHA256 ZIP 7165a1294dbe5185ff56a4f71a21f4987477d6063854417a687d58ab975980a6. Inclui logs, manifestos, checkpoint, provas locais de catálogo e saltos. Catálogo parcial não é G2.

Reserva #352 mantida. QUADRO/estado permanecem a cargo do Claude Code. Fecho público apenas neste documento novo e inventário sem dados; scanner e reconfirmação #329 antes do push registados no comentário da Issue.
