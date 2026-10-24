# #352 — sanitização integral publicada; primeiro replay privado

24/10/2026. Executor Codex; revisão Claude 6389570097/6389766357; autorização Pedro ampliada para varredura dos711 ficheiros e publicação por mês. Repositório [privado](https://github.com/pedrompropicio/mundopropicio-replay); código executado [4f249a8e](https://github.com/pedrompropicio/mundopropicio-replay/commit/4f249a8ee3772a8f4d5907a2874cae3b3244703c); checkout público fixado ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708.

## Publicação e PII

Publicação concluída, sem recusas nesta etapa. Os730 ficheiros do pacote foram conferidos por hash Git na árvore remota. 711ledger +242Drizzle no plano;240Drizzle do checkout público conferidos,2históricos privados,9overlays. Originais Live preservados por hash; nenhuma migração original editada. Público recebe apenas documentação.

Varredura integral dos711:149 registos candidatos —10emails (incluindo técnicos),1telefone,1IBAN,1NIF/NIPC,136textos em matched_by/notes/description. São147 literais distintos, porque categorias se sobrepõem; todos dentro de literais e sem linhas partidas. Mais1texto livre redigido no overlay0205 para cumprir a mesma verificação; intervalos de remoção operacional dos9overlays mantidos. A contagem de10emails foi confirmada por uma segunda expressão regular: os17ficheiros citados para o repositório público não equivalem ao conjunto do ledger exportado.

[REDACTIONS.md](https://github.com/pedrompropicio/mundopropicio-replay/blob/6c9621d8d188d01b10b2fa72d10b664094712d3a/REDACTIONS.md) contém versão/tipo/linha e hashes original→publicado, sem valores. check-pii varre ledger/ e overlay/, incluindo os2históricos; sai não-zero ao encontrar padrão. Testes positivos e placeholders passaram; email sintético provocou saída não-zero sem imprimir o valor. Placeholders conhecidos e exclusões UUID/hash/data/máscaras numéricas estão explícitos; detecção de nomes é conservadora, não certificação semântica de anonimização.

Validação cumulativa verde antes de cada lote. No GitHub Actions: **722ficheiros,0ocorrências**, hora **2026-10-24T22:03:07.126884+00:00**, etapa PII gate concluída com sucesso. README/REDACTIONS receberam depois uma correcção documental de contagens e a prova remota em 6c9621d8d188d01b10b2fa72d10b664094712d3a; sem alterar SQL/plano/runner e sem novo replay, usando skip ci exclusivamente nesse commit documental. check-pii local repetido nessa correcção:722/0.

| Lote | Commit privado |
|---|---|
| 00-checker | [1c2a8ba0](https://github.com/pedrompropicio/mundopropicio-replay/commit/1c2a8ba00c86d67a298ce88f4c5fbc119948105d) |
| 202603 | [40594022](https://github.com/pedrompropicio/mundopropicio-replay/commit/4059402281a09c71e64396fc9965e9f81bd6da7b) |
| 202604 | [8ce969f3](https://github.com/pedrompropicio/mundopropicio-replay/commit/8ce969f352c818019f0b810230a358f0cf3dd12b) |
| 202605 | [5e84f9a9](https://github.com/pedrompropicio/mundopropicio-replay/commit/5e84f9a9c130e8c756dce2a81235e12d5b3800c0) |
| 202606 | [ec2138f4](https://github.com/pedrompropicio/mundopropicio-replay/commit/ec2138f4f34ebe9182c4ffa2a29c59ab7884c35a) |
| 202607 | [b80ba77e](https://github.com/pedrompropicio/mundopropicio-replay/commit/b80ba77efde4e0c472a4e832df80138b7df3b51b) |
| 202608 | [7b79ff3a](https://github.com/pedrompropicio/mundopropicio-replay/commit/7b79ff3ad766e3dc61dce0358dc1eee30b09a214) |
| 202609 | [e93192aa](https://github.com/pedrompropicio/mundopropicio-replay/commit/e93192aa1a06a2a50fc9cbfb661dd10429aebc3f) |
| 202610 | [77931bfe](https://github.com/pedrompropicio/mundopropicio-replay/commit/77931bfe039e83b91a3da0894221e04ac3c9678c) |
| 99-runner | [4f249a8e](https://github.com/pedrompropicio/mundopropicio-replay/commit/4f249a8ee3772a8f4d5907a2874cae3b3244703c) |

## G1 — vermelho: primeira falha SQL desconhecida

[Run40136853522](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40136853522), job121000074918; início22:03:07UTC, fim do runner22:05:39UTC. Bootstrap nativo Supabase CLI2.84.2; PII gate verde. **116migrações aplicadas;117.ª falhou;836entradas seguintes não executadas. Nenhuma Drizzle executada.**

- Ficheiro: ledger/20260425135233_20260425135230_publish_migration_from_pg_dump.sql.
- Versão:20260425135233; linha3 do ficheiro.
- SQLSTATE:**42P01**; mensagem: table "account_categories_snapshot_v7" does not exist.
- Hash original/publicado/executado igual:c457381664d179d9e2fbc8aaa5aa3d35dc4d7102dc27016a8dde8cdb796cd02c. Esta versão não foi redigida; a falha não resulta de uma redacção.
- Leitura dos711ficheiros: única ocorrência desse nome é a remoção na linha3; não há criação nessa sequência. O ficheiro contém apenas controlo check_function_bodies e a remoção da tabela. É falha SQL reproduzível na sequência vazia, não evidência de falha do runner.

**Correcção proposta, não aplicada:** overlay adicional desta versão que torne a remoção da tabela condicional à sua existência, preservando o resto e o hash original. Rever com Claude antes de acrescentar ao conjunto aprovado. Não criar tabela/dados fictícios para satisfazer a remoção. A lista de falhas observadas neste run contém este único ficheiro; não é lista exaustiva de falhas das836entradas por executar. Não se marcou G1 verde nem se alteraram originais para prosseguir.

## Isolamento e artefactos

Artefacto [schema-replay-352,12577815913](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40136853522/artifacts/12577815913),22ficheiros,ZIP159645bytes,SHA256 e05edc58332a2996ae73cc1ae959598fa1dbee793d194694743a93d307347da6 (download e hash conferidos). Logs,manifesto,failure.json,cron,isolamento e seis consultas preservados no privado. Retenção reportada até23/11/2026.

Provas: cron.launch_active_jobs off depois do reset e durante o replay; egress dos containers REJECT. Inventário antes de unschedule0jobs; depois0. Nenhuma função de aplicação copiada. Catálogo parcial pelas seis consultas originais:126relações,1250colunas,176funções,239políticas,42triggers,9extensões. Estes números não são diff de G2.

## G2 — não executado

Dependia de G1 verde. Nenhuma nova consulta Live realizada; nenhum diff integral produzido. G6 continua com Pedro. Sem escrita Live, DSN de produção, segredos configurados, infraestrutura paga, contas, custos contratados, deploy ou Publish.

Fecho: reserva própria criada em e5fcc2c1; #329 HEADs iguais/agente livre reconfirmados antes das escritas públicas; reserva libertada com este relatório. Restantes frentes preservadas; branch study/352-schema-replay intacta; #352 permanece aberta. Próximo passo: revisão do overlay proposto e da nova sanitização pelo Claude, depois retomar G1 sob âmbito aprovado.
