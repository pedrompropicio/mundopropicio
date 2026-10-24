# #352 — regra de classe destrutiva e G1 privado

24/10/2026. Executor Codex; autorização Pedro: saltar apenas instruções DROP/ALTER DROP com SQLSTATE 42P01/42703/42704/42883. [Código privado 25ca0209](https://github.com/pedrompropicio/mundopropicio-replay/commit/25ca020973ca4f8189de27d0c4677b735f933d46); [run 40138529654](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40138529654); checkout público fixado em ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708. Nenhum overlay para 20260425135233 foi criado.

## Implementação e testes

Cada versão mantém uma transacção. O runner separa instruções respeitando comentários, literais e corpos dollar-quoted. Cada instrução tem savepoint; se falhar, desfaz só essa instrução antes de decidir. Só os quatro SQLSTATE autorizados e os verbos destrutivos da lista podem continuar. Instruções construtivas, comandos mistos com acções construtivas, DO/corpos de funções e outros erros param o run. Uma versão só é registada no ledger local depois de todas as instruções terminarem; falha posterior reverte a versão. Saltos registam também se a versão foi confirmada.

7 testes locais passaram. 5 testes no PostgreSQL nativo descartável passaram antes de começar o ledger: quatro erros destrutivos autorizados saltados na mesma transacção; erro construtivo42P01 bloqueado; ALTER misto42703 bloqueado; erro42P01 em DO bloqueado; erro sintáctico42601 bloqueado. Os4 saltos sintéticos destes testes não entram no inventário do replay. PII gate remoto verde; ledger/plano/overlays originais inalterados neste commit.

## G1 — vermelho, paragem construtiva correcta

**128 entradas tentadas,127 concluídas,1 falhada;825 entradas seguintes não executadas. Nenhuma Drizzle executada.** Run iniciado22:26:19UTC, runner terminado22:28:59UTC. A versão117 anteriormente bloqueada passou com um salto.

Primeira falha construtiva:

- Versão20260429203825; ficheiro ledger/20260429203825_20260429203822_publish_migration_from_pg_dump.sql.
- Linha487; instrução ALTER TABLE de adição de uma restrição CHECK na tabela public.account_categories, dependente de company_id.
- SQLSTATE **42703**; mensagem: column "company_id" does not exist.
- Objecto em falta: **public.account_categories.company_id**. A instrução não é destrutiva e não foi saltada; a versão falhada foi revertida.
- Hash original Live:063652a03ea8909ce54ce7f5ed7038631ac28902e230b64d1accdc56c8b61b5a. Hash publicado/executado:37b066159072d342d02465c07f73368b34d6ae7dc77a5746a5245ef2dbfbc19b. As redacções estão noutras linhas; não adicionam nem removem esta coluna.

**Existe origem órfã no repositório:** supabase/migrations/20260429023935_9cabcd96-9609-4764-8ca4-7ec57c4123e1.sql, linha16. Versão ausente das711 entradas. Ficheiro conferido contra o checkout público fixado: Git blob9c0845e217953c72ddfae1a139de6ce5e423b549; SHA2563d672ae7766eac730a3c0abf0926ea6f56c1f9d85668db6e28d9aa0865927512. Nome/proveniência registados; nenhum conteúdo SQL copiado para este relatório. Não foi executado ou incorporado no plano. A revisão deve decidir como recuperar essa dependência construtiva preservando proveniência; a regra destrutiva não autoriza saltá-la nem inventar a coluna.

## Saltos destrutivos — secção própria

**1 salto real**, persistido em [ledger/skipped-destructive.json](https://github.com/pedrompropicio/mundopropicio-replay/blob/b99c180f70c2a8c3ce16668cb023466f949a5406/ledger/skipped-destructive.json) e no mesmo caminho relativo do artefacto. Commit documental b99c180f70c2a8c3ce16668cb023466f949a5406, sem novo replay.

| Versão | Linha | Verbo | Objecto | SQLSTATE | Hash da versão | Versão confirmada |
|---|---:|---|---|---|---|---|
| 20260425135233 | 3 | DROP TABLE | public.account_categories_snapshot_v7 | 42P01 | c457381664d179d9e2fbc8aaa5aa3d35dc4d7102dc27016a8dde8cdb796cd02c | sim |

Ficheiro de origem: ledger/20260425135233_20260425135230_publish_migration_from_pg_dump.sql. Hash original/publicado/executado iguais. O runner não alterou esse ficheiro. A versão20260604014707 e as seis remoções citadas pelo Claude **não foram alcançadas**; não se contam como saltos executados. A existência do ficheiro órfão portal_sprint1_recovery foi conferida por leitura, sem aplicação.

## Provas e G2

[Artefacto12577013406](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40138529654/artifacts/12577013406):24ficheiros,166713bytes; ZIP SHA2564666f019c952bc6b60d044473fb8cc031da082839dbcf8c76ea33693a302113d, download/hash conferidos. Inclui manifesto,failure.json,destructive-rule-selftest.json,ledger/skipped-destructive.json,logs e seis catálogos parciais. Cron off e firewall de saída mantidos; inventário cron0 antes/0 após unschedule. Catálogo parcial:129relações,1303colunas,204funções,250políticas,48triggers,9extensões.

**G2 não executado:** depende de G1 verde; nenhum catálogo Live novo nem diff integral. Nenhuma consulta ou escrita Live nesta etapa. Sem DSN, infraestrutura paga, contas, deploy ou Publish; G6 continua com Pedro. Estes resultados não certificam as825 entradas posteriores.

Fecho documental no público, sem SQL: reserva14d78d88 antes; #329 HEADs iguais/agente livre reconfirmados; libertação da reserva própria no fecho, restantes frentes preservadas. #352 aberta; branch study/352-schema-replay intacta. Próximo passo é revisão da origem órfã construtiva pelo Claude/Pedro.
