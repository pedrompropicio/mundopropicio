# #352 — insert_duplicate_superseded_by_ledger: prova e G1

Executor Codex; autorização Pedro; [parecer final Claude 6405104061](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6405104061). Reserva registada pelo Claude Code em b2f9ffa. Este relatório encerra a execução desta etapa com G1 vermelho; não fecha a Issue nem autoriza homologação.

## Resultado

**735 entradas concluídas, 736 tentadas de 1454; uma falhada e 718 não tentadas. Checkpoint 114/114 PASS. G2 não executado.** Avanço de 279 entradas face ao run anterior. Concluídas: 258 ledger, 470 órfãos, cinco repo-for-placeholder e dois seeds.

[Run 40246829514](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40246829514), de 25/10/2026 23:54:43 UTC a 26/10/2026 00:00:08 UTC (25/10, 20:54–21:00 Fortaleza). [Commit privado 03d9e418](https://github.com/pedrompropicio/mundopropicio-replay/commit/03d9e4188b833e0e27c9c3d85f7d08dabd5eb22a).

## Prova e implementação

SELECT em Live recolhido às 2026-10-25T23:51:17.571Z: três chaves encontradas; igualdade exacta nos quatro campos nomeados no INSERT do ledger. A comparação exclui colunas posteriores, como max_daily_budget_eur, conforme o parecer. Nenhuma escrita em Live.

Proveniência aceite: placeholder 20260510034045 e ficheiro repo-for-placeholder da mesma versão. O órfão 20260510034250 difere apenas em description, devido à redacção da cópia. A prova privada fica em proofs/insert-supersession.json; SHA256 `6e9ea7aa9aa25e24f6ba6244181a90998da5df597f47856d93d8ccc150e2ca2a`.

A implementação é por caso e chave comprovados. Recusa prova/hash alterados, origem inadequada, ledger posterior ao órfão, divergência fora de description/name e ausência de igualdade com Live. No erro 23505, exige ainda que a constraint e a chave sejam as previstas e que a linha local coincida exactamente com o INSERT do ledger. A linha tentada tem de coincidir com o órfão comprovado. A regra insert_duplicate_equal não foi alargada.

As 1454 entradas, SQLs, ordem e checkpoint permaneceram inalterados; plan.json apenas referencia a prova e o seu hash. SHA256 do plano: `cd644bf126ff6e6d9e0c86f5bc8fd770ef54ca628b4c4ae69ede930e799c507c`.

Cinco testes novos de validação passaram; bateria local com 33 testes PASS. No Postgres nativo, 35 testes PASS, incluindo quatro novos: caso real (três saltos), descrição local diferente (pára), limite numérico diferente (pára), sem autorização (pára). Seed isolado: 117 linhas, zero pais por resolver.

## Saltos e novo bloqueio

Três saltos insert_duplicate_superseded_by_ledger efectivamente registados nas linhas 34, 35 e 36 de 20260510034250, com versão concluída. Cada registo privado inclui chave, versão/ficheiro do ledger, colunas comparadas/divergentes e hashes original/executado das duas fontes.

Totais: 155 saltos destrutivos e 2103 idempotentes (1151 base, 595 policy_equal, 175 using_index, 168 trigger_equal, um insert_duplicate_equal, dez txn_control e três insert_duplicate_superseded_by_ledger). Sem tabela pública de metadados ou valores de Live.

**Primeira falha não coberta:** orphan/20260615195703_941616ba-4bda-4429-ab23-d4047dbc33eb.sql, linha 1, UPDATE em crm.google_user_list, **SQLSTATE 42P01: relação inexistente**. A versão foi interrompida; não foi ignorada como no-op. A pesquisa textual no checkout fixado de supabase/migrations encontrou apenas esse UPDATE; nenhuma referência foi encontrada nas cópias consultadas do ledger e de drizzle/migrations. Não foi identificado ficheiro criador nesse conjunto; isso não prova ausência em Live.

Para parecer Claude: determinar a origem e necessidade histórica dessa tabela/instrução antes de decidir tratamento. Nenhuma regra nova, tabela fictícia ou overlay adicional foi criado.

## Evidência e fecho

[Artefacto privado 12619121267](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40246829514/artifacts/12619121267), SHA256 do ZIP `0f291e6e3f7622277eecc135d27a8baeb73a9c519613f824b95fb36eaae6c086`, conferido após download. Inclui logs, provas, contagens, checkpoint e skipped-idempotent.json.

PII gate do workflow aprovado; novo relatório verificado sem ocorrências. Agendador desligado, firewall activo; nove crons exportados sanitizados antes do unschedule local e zero depois. Sem DSN, homologação, infraestrutura paga, deploy ou Publish. G2 não executado porque G1 permanece vermelho.

Fecho público limitado a este ficheiro novo e comentário na #352, com #329 reconfirmado antes do push. QUADRO não alterado; ao 0 cabe libertar a reserva no fecho desta etapa. estado-plataforma-e-infra.md fica para o Claude Code, usando este relatório. #352 permanece aberta.
