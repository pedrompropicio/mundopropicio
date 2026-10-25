# #352 — cinco placeholders e exceção explícita do enum

Executor Codex; despacho Pedro/Claude25/10/2026 nesta sessão. Run UTC25/10,04:05:52–04:09:39 (01:05–01:09 Fortaleza). Nenhuma nova consulta ou escrita Live.

## Resultado

**Checkpoint114/114 PASS. G1 vermelho:450entradas concluídas,451tentadas,1falhada,1003não tentadas de1454. G2 não executado.** Concluídas:154ledger+292órfãos+2seeds+2repo-for-placeholder. A contagem não é directamente comparável à execução anterior:agora dois placeholders semDDL foram substituídos porSQL real e a falha ocorre numa terceira substituição anterior à que bloqueava antes.

| Versão | Fonte | Resultado |
|---|---|---|
| 20260510024841 | repo-for-placeholder | PASS;schemaCRM criado |
| 20260510025749 | repo-for-placeholder | PASS |
| 20260510033845 | ledger,no-op | PASS;exceção intacta |
| 20260510034045 | repo-for-placeholder | Falhou22P02,L41 |
| 20260511120000 | repo-for-placeholder | Não alcançada |
| 20260511120100 | repo-for-placeholder | Não alcançada |

[Run40160614580](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40160614580) · [código privadodc9ba22e](https://github.com/pedrompropicio/mundopropicio-replay/commit/dc9ba22ef37793a40afa94852744ae446078ff6a) · [artefacto12586567086](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40160614580/artifacts/12586567086). ZIP SHA25623ada1822481e7118f52f3ecfb4f9eccd265923533cd28711eb2803a8ce055b7 verificado após download. [Anexo](placeholders5-g1.json).

## Alteração autorizada

Plano com706ledger+5repo-for-placeholder+499órfãos+242Drizzle+2seeds,1454posições preservadas. Os cinco ficheiros são lidos do checkout público fixado ad160ee9fbc5b7c5a73f0a63fc44b0c1c86a2708,sem copiar SQL para o repositório público. Manifesto privado placeholders.json contém o texto exacto do placeholder,hash correspondente,ficheiro/hashGit/hashSHA256 do repositório e proveniência. Runner valida a lista exacta dos cinco e os bytes antes deSQL.

20260510033845 permanece source=ledger com bytes e hash inalterados. Manifesto regista a nota autorizada:DDL aplicado por20260510041732(ledger);ficheiro do repositório não executado. Sem enum_value_exists. Não foram alteradosSQL de origem,overlays,seeds,ordem,queries ou referência do checkpoint.

Quatro testes novos PASS:cinco substituições aceites;exceção indevidamente substituída,manifesto alterado e ficheiro alterado recusados.31autotestes nativos anteriores PASS. Seed117linhas/0pais por resolver. O bloqueio documental anterior fica resolvido pela exceção explícita,sem apagar o seu registo histórico.

## Primeira falha não coberta

public-source/supabase/migrations/20260510034045_crm_permissions_and_budget_limits.sql,L41,INSERT VALUES em public.role_permissions: **SQLSTATE22P02,valor marketing_manager inexistente em app_role**. É a primeira tupla que precisa desse valor. A versão foi interrompida e revertida;nenhuma continuação.

Evidência de ordem:orphan/20260510034212_95430243-6220-45fb-9248-28c4e9a4e982.sql,L1–2,e ledger/20260510041732_20260510041730_publish_phase1_migration_from_pg_dump.sql,L1,adicionam o valor,mas ambas aparecem depois de 20260510034045. A entrada20260510033845foi executada exactamente como no-op,conforme despacho.

**Para parecerClaude,sem aplicação:** decidir a precedência histórica entre a criação do valor do enum e o ficheiro de permissões,com prova de efeito. Não reordenei,não executei o ficheiro excluído,não acrescentei seed/overlay e não criei variante de enum. A regra enum_value_exists também não resolveria uma referência a valor ausente:numa inserção,o erro é22P02,não42710.

## Saltos e controlos

119destrutivos;1298idempotentes:703base+104using_index+113trigger_equal+373policy_equal+1insert_duplicate_equal+4txn_control. Uma entrada superseded separada. Ficheiros/linhas/hashes no anexo;SQL integral e linhas apenas no privado.

Workflow check-pii1230ficheiros/0ocorrências. Os cinco ficheiros adicionais do checkout foram varridos separadamente:3candidatos de texto livre em 20260510034045,L69–71,lidos e classificados como descrições técnicas de papéis de acesso,não pessoas;nenhuma redação nem alteração ao scanner. Não se declara zeroocorrências brutas nesses cinco. Manifesto regista classificação por tipo/linha.

Cronoff/firewall activos;2jobs exportados sanitizados e abatidos localmente,0depois. Sem Live novo,DSN,homologação,infraestrutura paga,deploy ouPublish. check-pii docs/estudos/**:50ficheiros de base,hashesGit conferidos,12ocorrências preexistentes;conteúdo novo/diff0. Histórico não declarado verde.

## Fecho

Reservaec178e52 libertada neste fecho;#329reconfirmada antes do push. Estado actualizado;#352aberta;D-ERP309já registada. Próximo passo:parecer sobre a ordem da dependência do enum. G2 sócomG1verde.
