# #352 — efeito provado dos três placeholders

Executor Codex; autorização Pedro/parecer Claude de 25/10/2026 nesta sessão. Origem: placeholders exportados do ledger, checkout público fixado em `ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708` e artefactos do replay nativo. Nenhuma nova consulta ou escrita em Live.

## Resultado

**G1 vermelho; checkpoint 114/114 aprovado. G2 não executado.** Foram concluídas 449 entradas (154 ledger, 293 órfãos e 2 seeds); 450 tentadas, uma falhada e 1004 não tentadas, num plano de 1454. A contagem não é directamente comparável ao run anterior: três entradas passaram para uma posição posterior à primeira falha actual.

[Run 40161921145](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40161921145), executado de 04:27:32 a 04:31:33 UTC em 25/10/2026. [Commit privado f1e9523a](https://github.com/pedrompropicio/mundopropicio-replay/commit/f1e9523a660c442d74761df4240d510feff88424). [Artefacto 12587250155](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40161921145/artifacts/12587250155), ZIP SHA256 `a0dbfa8c3a045c9a87fc69ecf718ddab12865153a0f5d12766e86a0c549194e5`, verificado após download. [Anexo de contagens, hashes e saltos](placeholder-effect-g1.json).

## Alteração executada

As entradas `20260510024841`, `20260510025749` e `20260510034045`, todas `repo-for-placeholder`, têm `effective_at=2026-05-11T00:00:00Z`, com desempate pela versão original. O manifesto privado `effective-order.json` conserva o texto e hash do placeholder como prova. A prova textual indica o dia; meia-noite é o ponto de ordenação expressamente autorizado, não uma hora de execução medida em Live.

Ficam depois de todas as entradas de 10/05 e antes de `20260511002657`. A entrada `20260511001305` mantém a posição natural entre o trio e `20260511002657`. As entradas `20260511120000` e `20260511120100` continuam às 12:00 e 12:01. A exceção `20260510033845` continua ledger/no-op. Nenhuma variante `enum_value_exists` foi acrescentada.

Validação: somente os três campos effective_at mudaram nas entradas; hashes do SQL, restantes campos, ordem relativa das outras entradas e checkpoint inalterados. Quatro testes locais novos passaram (ordem, posições do meio-dia, recusa de data alterada e recusa de prova alterada); 31 autotestes nativos passaram. Seed isolado: 117 linhas, zero pais por resolver.

## Primeira falha não coberta

`orphan/20260510034250_cd86320c-2133-4a42-a2e2-7a51e9ad9c84.sql`, linha 21: criação de `crm.role_budget_limits` falhou com **SQLSTATE 3F000: schema crm inexistente**. O runner parou e reverteu a versão. Nenhuma regra foi alargada.

A criação do schema está na linha 2 de `supabase/migrations/20260510024841_8544fa7b-7eef-4f9e-ae2c-5daf2e88ac0b.sql`, fonte repo-for-placeholder, agora posicionada em 11/05. O órfão consumidor continua em 10/05. As três entradas reposicionadas não foram alcançadas; não se declara que o bloqueio anterior do enum esteja resolvido por execução.

**Para revisão Claude:** determinar, com prova, a precedência histórica entre a criação do schema CRM e este órfão consumidor. A evidência actual não autoriza criar um schema antecipado, mover outro ficheiro ou suprimir a instrução. Essas alternativas não foram executadas.

## Saltos e controlos

119 saltos destrutivos; 1298 idempotentes: 703 base, 373 policy_equal, 104 using_index, 113 trigger_equal, um insert_duplicate_equal e quatro txn_control. Uma entrada superseded permanece separada. O anexo lista ficheiros, linhas, contagens e hashes; definições SQL e linhas de dados permanecem no privado.

Check-pii do workflow aprovado. Agendador desligado, saída de rede dos containers bloqueada; dois crons exportados sanitizados antes do unschedule local e zero depois. Sem DSN, homologação, infraestrutura paga, deploy ou Publish. Não houve catálogo Live novo nem G2, porque G1 não ficou verde.

Varredura documental: 52 ficheiros existentes, hashes Git conferidos, 12 candidatos preexistentes; novo relatório/anexo e alteração de estado sem ocorrências. Não se declara o histórico limpo. Reserva `6f00377f` libertada no fecho, com #329 reconfirmada imediatamente antes do push. Estado actualizado; #352 permanece aberta; D-ERP309 já registada.
