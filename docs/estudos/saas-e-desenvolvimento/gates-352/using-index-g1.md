# #352 — variante using_index e novo G1

24/10/2026. Executor Codex; R0 no privado. Autorização expressa de Pedro para SQLSTATE55000 condicionado à constraint existente. Sem escrita em Live, DSN, infraestrutura paga, deploy ou Publish. Plano v2 de1.452 entradas e todos os SQL/overlays originais inalterados.

## Implementação e testes

Commit privado [7afdc7bb](https://github.com/pedrompropicio/mundopropicio-replay/commit/7afdc7bba9ff04dc4e623c6dd63e376b52525b94). Apenas runner, classificador e novo teste unitário.

O parser aceita uma única instrução ALTER TABLE ADD CONSTRAINT com PRIMARY KEY/UNIQUE USING INDEX. Depois do erro e do rollback ao savepoint, verifica em pg_catalog.pg_constraint **conrelid da tabela pedida e conname exacto**, respeitando identificadores citados. Apenas55000 com forma compatível e existência confirmada pode saltar. ALTER misto, DO, nome ausente, constraint noutra tabela ou outro55000 continuam a parar. O registo idempotente recebe variante=using_index, nomes da tabela/constraint/índice e catalog_constraint_confirmed=true. Esta existência não certifica tipo/colunas equivalentes: comparação final com Live depende de G2.

19 testes unitários locais PASS. Teste SQL local adicional em PGlite (não usado como G1/G2): trechos reais do CREATE TABLE do órfão20260319225910 e linhas48/50 do ledger20260319231859, sem reescrever;42P07 seguido de55000 reproduzidos. Quatro verificações PASS: índice já existente, using_index com constraint presente, nome ausente recusado, mesmo nome noutra tabela recusado. Nenhum dado operacional usado.

No runner nativo, os testes incluem os trechos reais exactos antes das migrações, com rollback integral da fixture; preparação app_role mínima isolada. Também acrescentado SELECT local para guardar tipo/colunas/definição das constraints de cada salto using_index em using-index-constraints.json, sem mudar as seis consultas canónicas.

## Resultado G1

[Run40142310303](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40142310303), SHA7afdc7bb. 24/10/2026,23:20:32–23:22:45UTC. **14autotestes nativos PASS e teste nativo adicional com os trechos reais PASS**, fixture revertida antes das migrações. PIIremoto1.227ficheiros/0ocorrências. Agendador off/firewall;cron0antes/0depois do unschedule.

**45 entradas concluídas,46 tentadas,1falhada,1.406não tentadas**. G1vermelho. Primeira falha fora da classe: ledger20260321021238, ficheiro `ledger/20260321021238_20260321021236_publish_migration_from_pg_dump.sql`, **linha57**, CREATE TRIGGER `update_recurring_transactions_updated_at` em `public.recurring_transactions`, **SQLSTATE42710** (trigger já existe). O código42710 está autorizado só para os verbos listados; CREATE TRIGGER não está entre eles, portanto o runner parou. Origem anterior localizada no ficheiro órfão `supabase/migrations/20260321020811_5f5a03f4-b533-4a5d-9a04-488d45d3bab8.sql`,linha36. Não foi alargada a classe nem editado o SQL.

## Saltos destrutivos

0. [JSON privado](https://github.com/pedrompropicio/mundopropicio-replay/blob/2a51b0d325e7a22f31ab4c941c1b468c413e4842/ledger/skipped-destructive.json).

## Saltos idempotentes por versão e variante

23 eventos: **18base + 5using_index**. 15 em versões confirmadas e8na versão final revertida. [JSON privado](https://github.com/pedrompropicio/mundopropicio-replay/blob/2a51b0d325e7a22f31ab4c941c1b468c413e4842/ledger/skipped-idempotent.json). O anexo contém versão/ficheiro/linha/verbo/objecto/SQLSTATE/hash e estado do commit.

| Versão | Base | using_index | Versão confirmada? |
|---|---:|---:|---|
| 20260319231859 | 11 | 4 | True |
| 20260321021238 | 7 | 1 | False |

### Cada salto using_index — evidência local

Existência do nome na mesma tabela confirmada antes de saltar. Tipos/colunas recolhidos em pg_constraint local após o replay parcial. **Não comparados com Live**, G2bloqueado.

| Versão/linha | Tabela.constraint | Tipo | Colunas | Confirmação Live |
|---|---|---|---|---|
| 20260319231859:50 | role_permissions.role_permissions_pkey | p | id | Pendente G2 |
| 20260319231859:54 | role_permissions.role_permissions_role_permission_key | u | role, permission | Pendente G2 |
| 20260319231859:85 | user_permissions.user_permissions_pkey | p | id | Pendente G2 |
| 20260319231859:89 | user_permissions.user_permissions_user_id_permission_key | u | user_id, permission | Pendente G2 |
| 20260321021238:55 | recurring_transactions.recurring_transactions_pkey | p | id | Pendente G2 |

## G2 e próxima revisão

G2nãoexecutado; nenhuma consulta Live nova. As seis consultas locais e using-index-constraints.json estão no artefacto parcial, sem alegar equivalência com produção. [Artefacto12578908047](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40142310303/artifacts/12578908047),ZIPSHA9d54baf8efed178a69b803e45598b07fe8bb488263e713189216a758ed7fa18b conferido. [Anexo sanitizado](using-index-g1.json).

Próximo Claude: rever explicitamente CREATE TRIGGER duplicado, incluindo a definição existente e a pretendida, antes de decidir qualquer nova regra. Não autorizado nem aplicado neste despacho.

## #329 — fecho em branch documental; main suspenso

Durante o run, Pedro enviou o alerta Lovable das20:19Fortaleza/23:19UTC sobre trabalho substituído. A reserva desta etapa foi escrita às23:18:11UTC após main=Lovable5befe79c e agentFinished=true. O backup `lovable-sync-1792883945` aponta parabfa5c52c, plano da#358 guardado às23:18:54UTC. Leitura posterior mostrou main=Lovable84ff2ef6,mas história divergente:2commits exclusivos no backup/3emmain, ancestral5befe79c.

O backup altera apenas `.lovable/plan.md`, da#358Ticketline. O plano actual e o backup têm blobs diferentes. Não se confirmou perda de código; também não se descartou o conteúdo do plano guardado. Nenhum botão de restaurar/redefinir/manter foi accionado, nenhum reset/force/merge feito nesta frente. As duas linhas continuam preservadas.

Conforme #329, o relatório, estado e proposta de libertação da reserva ficam em branch documental separada. **A linha de reserva ainda permanece em main até integração autorizada após reconciliação**; execução privada terminada, agente não ocupado por esta frente. A Issue352 recebe comentário com resultado e bloqueio. #352aberta,G6Pedro. Não se modifica o plano da#358 para fechar esta demanda.
