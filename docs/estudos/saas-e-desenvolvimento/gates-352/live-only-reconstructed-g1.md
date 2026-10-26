# #352 — três relações reconstruídas e G1

Executor Codex; parecer Claude 6405248457 e complemento do Pedro/Claude nesta sessão para relações sem created_at. Reserva #352 confirmada por leitura; QUADRO/estado não escritos.

## Resultado

**G1 vermelho: 857 entradas concluídas, 858 tentadas de 1457; uma falhada e 599 não tentadas. Checkpoint 114/114 aprovado. G2 não executado.** Das concluídas: 352 ledger, 497 órfãos, cinco repo-for-placeholder, dois seeds e uma reconstruída. Avanço de 122 entradas concluídas face ao run anterior, incluindo a nova reconstrução.

[Run 40248643692](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40248643692), de 26/10/2026 00:17:56 a 00:23:48 UTC (25/10, 21:17–21:23 Fortaleza). [Commit privado a52b0a5d](https://github.com/pedrompropicio/mundopropicio-replay/commit/a52b0a5d34bb991c06e98c34aa121be961b52a28).

## Reconstruções e limites

Três ficheiros em reconstructed/, cada um com cabeçalho de origem, hora UTC, OID e digest do catálogo serializado. Sem DML. Reproduzem colunas/tipos/defaults/nulabilidade, constraints, índices, RLS, policies, triggers, grants e comentários existentes. Os comentários adicionais de constraints/índices/triggers/policies foram consultados e não existem nestes três objectos. Defaults de privilégios locais são removidos antes de reproduzir os grants do catálogo.

| Relação | OID | effective_at UTC | Prova e execução |
|---|---:|---|---|
| crm.google_user_list | 143856 | 2026-06-14 16:57:00 | Antes de min(created_at) 16:57:23.681547 e da referência 20260615195703; aplicada, catálogo igual |
| crm.ads_insights_breakdown_daily | 240229 | 2026-09-19 20:09:00 | Antes de min(created_at) 20:09:32.943101 e da referência 20260921180146; materializada, não alcançada |
| crm.google_ad | 241420 | 2026-09-19 20:09:01 | OID reconstruído imediatamente inferior 240229, effective_at + um segundo; antes da referência 20260921180146; materializada, não alcançada |

A âncora adicional é crm.artist_ads_budget_caps_history, OID 239024, criada pelo ledger 20260919115403 às 11:54:03. O MD5 do ficheiro foi conferido com statements[1] por SELECT. public.br_estados, OID 240113, foi incluída no inventário; sem CREATE nas fontes pesquisadas e referida pelo Drizzle id 13. Não foi reconstruída: a autorização limita este lote às três relações CRM.

[Inventário atualizado](live-only-crm-inventory-v2.json), SHA256 `3e964da30b0bf917556c25e75f7fb15128504a98d051fa2b730875e9f8179e1d`. Abrange 67 relações CRM e a relação pública adicional; sete sem CREATE no CRM, mais br_estados. Mantém nomes, OIDs, limites, referências e hashes, sem linhas de dados. As quatro relações CRM sem referência identificada continuam apenas inventariadas.

As 1454 entradas anteriores, SQLs e ordem relativa ficaram intactos; três entradas source=reconstructed foram acrescentadas. Manifesto privado reconstructed/manifest.json, SHA256 `bd5bd58833d7dd6dede39a1fb9f5a91f4fc4037bf95dd992a00416433727fab4`. O runner valida limites, vizinho OID, digests e DDL determinístico; não insere reconstruções nos ledgers históricos. Ordena por effective_at, com OID como desempate entre reconstruídas.

## Validação

Seis testes locais PASS. Os 35 autotestes nativos anteriores também passaram. Seed isolado: 117 linhas, zero pais por resolver. Após cada reconstrução, o runner compara o catálogo local com o snapshot de Live e pára perante diferença.

A primeira reconstrução passou essa comparação completa, sem campos divergentes. O UPDATE 20260615195703 que bloqueava anteriormente passou. Não se declara validação nativa das outras duas: o run parou antes das suas datas.

## Primeira falha não coberta

Versão 20260814221539, com overlay/20260814221539_c29025c8-49fb-4c65-a4d5-2a24dae88daa.sql: **SQLSTATE 42601, erro de sintaxe junto ao RELEASE SAVEPOINT emitido pelo runner**. O artefacto não atribuiu linha/statement, porque o último comando ficou incompleto.

Inspecção: o overlay termina nas linhas 63–64 com CREATE TRIGGER e BEFORE UPDATE ON public.bol_sync_config. Falta a linha 61 do ledger original, que completa o trigger. O original tem o trigger nas linhas 59–61 e o INSERT operacional nas linhas 63–66. O hash do overlay coincide com o plano: `6e8c5615c700034f8db71cf189eade8d422cd77704963810fd9e0cec3a65bc90`. É um problema do overlay preexistente, não do DDL reconstruído.

**Proposta para o próximo parecer, sem aplicação:** corrigir o intervalo do overlay para conservar integralmente as linhas 59–61 do ledger e retirar apenas o INSERT operacional das linhas 63–66; atualizar hashes e manifestos correspondentes. Nenhuma edição foi feita no original ou no overlay nesta etapa. Não se acrescentou regra para ignorar 42601.

## Artefactos e fecho

[Artefacto privado 12620286055](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40248643692/artifacts/12620286055), SHA256 do ZIP `6276e6f35fbb78a6efc44d66e7b6450f7d8691256dbfc5843e26a76319ca7a92`, verificado após download. Contém a prova da reconstrução 143856, logs e saltos.

155 saltos destrutivos; 2126 idempotentes: 1158 base, 610 policy_equal, 175 using_index, 169 trigger_equal, um insert_duplicate_equal, dez txn_control e três insert_duplicate_superseded_by_ledger. Agendador desligado/firewall activo; dez crons exportados sanitizados e abatidos localmente, zero depois.

Scanner agora inclui reconstructed/; quatro ficheiros SQL novos verificados, zero ocorrências. Gate PII do workflow aprovado; novos documentos também sem ocorrências. Sem DML Live, DSN, homologação, infraestrutura paga, deploy ou Publish.

Fecho público apenas com este relatório, inventário novo e comentário na #352; #329 reconfirmada antes do push. Reserva mantida. QUADRO/estado ficam para Claude Code. #352 permanece aberta; G2 só com G1 verde.
