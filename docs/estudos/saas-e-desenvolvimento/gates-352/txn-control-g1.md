# #352 — controlo transacional de topo no runner

Executor Codex; autorização Pedro/parecer Claude25/10/2026 nesta sessão. Run UTC25/10,03:43:37–03:47:45 (00:43–00:47 Fortaleza). Sem novas consultas ou escritas Live.

## Resultado

**txn_control validado em Postgres nativo. Checkpoint20260430033938 PASS114/114,zero diferenças. G1 vermelho numa dependência posterior; G2 não executado.**452entradas concluídas (157ledger+293órfãos+2seeds),453tentadas,1falhada,1001não tentadas de1454. As concluídas incluem a entrada superseded já autorizada,semSQL de aplicação.

[Run40159254069](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40159254069) · [código privado71661330](https://github.com/pedrompropicio/mundopropicio-replay/commit/716613307746949b6adcfb302ffff3ea415034a6) · [artefacto12585975591](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40159254069/artifacts/12585975591). ZIP SHA2562b0e91f2b2b9f94acba42190d470c72c5c1710a02e1a1dca280d5dbd9ce34545 conferido após download. [Anexo](txn-control-g1.json).

## Implementação e testes

Instruções de topo BEGIN,START TRANSACTION,COMMIT,END não chegam ao PostgreSQL;registo txn_control no skipped-idempotent.json com versão,linha,comando e action=skip. ROLLBACK de topo também não é executado:regista action=stop,interrompe o ficheiro e a ligação fecha com a transação do runner por confirmar,revertendo-a. Corpos dollar-quoted não são afectados. Não se inventa SQLSTATE para estes registos deliberados (null).

Sem alteração do plano,overlays,seeds,SQL original ou hashes original/executado. O runner continua a controlar uma única transação efectiva por versão.

Seis testes locais novos PASS;33testes anteriores de instruções PASS usando o módulo novo. Testes nativos PASS:

| Caso | Resultado |
|---|---|
| BEGIN/COMMIT envolvendo dois DDL | tudo aplicado;2saltos txn_control;uma confirmação do runner |
| ROLLBACK de topo após CREATE TABLE | parou;nenhuma tabela persistiu;instrução seguinte não executada |
| Erro intermédio após CREATE TABLE | parou42P01;DDL revertido;nenhuma tabela persistiu |

28autotestes nativos anteriores também PASS. Seed isolado117linhas/0pais por resolver. Inventário confirmou6ficheiros/12delimitadores,de acordo comClaude. Neste run foram alcançados2deles:20260509140408,L1BEGIN/L7COMMIT e20260509221355,L1BEGIN/L238COMMIT —4saltos txn_control. Os restantes4ficheiros não foram alcançados,não se afirma execução dos12delimitadores.

## Primeira falha não coberta

orphan/20260510034250_cd86320c-2133-4a42-a2e2-7a51e9ad9c84.sql,L21,CREATE TABLE crm.role_budget_limits: **SQLSTATE3F000,schema crm inexistente**. A transação desta versão foi interrompida;nenhuma continuação após o erro. As duas migrações com controlo transacional que bloqueavam antes passaram.

Evidência de origem:ledger/20260510024841_20260510024841_crm_schema_and_ad_platform_connections.sql contém apenas comentário de backfill,sem DDL executável. O ficheiro homónimo de versão no checkout público fixado ad160ee9,supabase/migrations/20260510024841_8544fa7b-7eef-4f9e-ae2c-5daf2e88ac0b.sql,L2,cria crm. BlobGit454977acb47a14908d69f9f6655d30e79dfa429a reconfirmado pelo conector. A regra vigente de par exacto divergente faz prevalecer o ledger e exclui essa versão do repositório. No plano,há CREATE SCHEMA posterior em orphan/20260511200047_aabf13b1-04fc-4ac6-a578-5f9621e3b453.sql,L3,portanto não satisfaz a dependência anterior.

**Para parecerClaude,sem aplicação:** decidir o tratamento das entradas ledger de backfill que apontam para DDL no repositório,com prova de origem/efeito. Não acrescentei schema,ficheiro órfão,overlay ou excepção à regra de correspondência. Não saltar3F000;é falha construtiva.

## Saltos e controlos

119destrutivos;1298idempotentes:703base+104using_index+113trigger_equal+373policy_equal+1insert_duplicate_equal+4txn_control. Uma entrada superseded separada. Ficheiros,linhas,comandos e hashes no anexo;SQL/valores apenas no privado.

check-pii SQL1230ficheiros/0ocorrências no workflow. Cronoff/firewall activos;2jobs exportados sanitizados e removidos localmente,0depois. Sem Live novo,DSN,homologação,infraestrutura paga,deploy ouPublish.

check-pii docs/estudos/**:47ficheiros de base,hashesGit conferidos;12ocorrências preexistentes do scanner. Conteúdo novo/diff0ocorrências. Não se declara o histórico inteiro verde.

## Fecho

Reserva6079271f libertada neste fecho;#329reconfirmada imediatamente antes do push. Estado actualizado;#352aberta;D-ERP309já registada. Próximo passo:parecer sobre backfillCRM e precedência ledger/repositório. Nenhuma regra alargada além de txn_control autorizado.
