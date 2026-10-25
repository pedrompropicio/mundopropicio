# #352 — tentativa superseded e efeito final; checkpoint aprovado

Executor Codex; despacho Pedro/Claude25/10/2026 nesta sessão. Execução UTC25/10,03:33:42–03:37:29 (00:33–00:37 Fortaleza). Origem: SELECT agregadoLive, fontes do plano e artefacto nativo.

## Resultado

**Checkpoint20260430033938 PASS:114/114,zero diferenças**, com igualdade exacta de code,name,parent_code e referência preservada. O problema do par de tentativas ficou ultrapassado.

**G1 vermelho numa falha posterior do runner; G2 não executado.**439entradas concluídas (151ledger+286órfãos+2seeds),440tentadas,1falhada,1014não tentadas de1454. As 439 incluem1entrada superseded que executa zero SQL de aplicação. A versão final executou SQL intacto.

[Run40158646792](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40158646792) · [código privadoc284343e](https://github.com/pedrompropicio/mundopropicio-replay/commit/c284343e4ff28689670548c0b5ae963f5d2e84dd) · [artefacto12585094772](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40158646792/artifacts/12585094772). ZIP SHA2563c7a35a7c648d0ae8abd240d95746b8d6bad2fdfa6364097c01ddca49c1ebf84 verificado após download. [Anexo](superseded-pair-g1.json).

## Alteração autorizada e prova

20260430032104 permanece no plano,source orphan,variante superseded,superseded_by20260430033938. Overlay integral vazio,zero bytes;hash executado e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855. Hash original cb86959c1c9d4a630d638a7deaa8e9f571a0b54d67a8f742ff4764aacec59528 preservado. Motivo e prova no manifesto privado superseded.json;versão registada pelo replay.

20260430033938 ganhou effective_at2026-04-30T04:19:00Z;ordenação pelo efeito,sem posição manual. SQL original/executado com mesmo hash39dc88b29569c03c0488ebf68896f884f29845430e27fdbcb04f3192293aa835. README documenta execução única da tentativa final no efeito provado;anteriores ficam superseded com prova. Nada é suprimido automaticamente por semelhança.

Dois SELECT agregados confirmaram2grupos criados e6folhas actualizadas em2026-04-30T04:19:00.771413Z. Query,hora UTC,resultados e hashes nos manifestos privados. A afirmação de ausência de efeito às03:21/03:39 provém do parecerClaude;as consultas desta etapa medem o estado actual dos carimbos,não um histórico de auditoria.

Cinco testes novos PASS:overlay autorizado vazio,recusa de entrada não aprovada,manifesto alterado,SQL final alterado eoverlay não vazio.47testes anteriores PASS;28autotestes nativos PASS. Seed isolado117linhas/0pais por resolver. Nenhuma mudança no contrato114,queries de checkpoint,seeds ou originaisSQL.

## Primeira falha não coberta

Ficheiro orphan/20260509140408_b726e518-1c42-48e8-8ca1-f5cbe2b8851a.sql:BEGIN naL1,cinco ALTER FUNCTION SECURITY INVOKER nasL2–6,COMMIT naL7. O runner abre a sua própria transação e savepoints. O COMMIT do ficheiro encerra-a; o RELEASE SAVEPOINT seguinte falha com **SQLSTATE25P01**. Aviso25001 anterior corresponde ao BEGIN aninhado; não é o erro final.

O artefacto não identificou statement_index/linha automaticamente;L7foi atribuída por leitura do ficheiro e do wrapper. É incompatibilidade de controlo transacional no runner,não prova de SQL funcional inválido. **O COMMIT local já ocorreu:**não se afirma rollback integral da versão falhada. O run parou e os catálogos resultantes são parciais;G2não foi iniciado.

**Para parecerClaude,sem aplicação:** definir tratamento explícito dos delimitadores transacionais de topo no runner,preservando os ficheiros originais e uma transação efectiva por versão. Incluir teste nativo desta migração e teste de erro intermédio com rollback. Não saltar25P01 nem tratarCOMMITcomo erro idempotente. Nenhuma regra foi alargada nesta etapa.

## Saltos e controlos

117saltos destrutivos;1288idempotentes:701base+104using_index+113trigger_equal+369policy_equal+1insert_duplicate_equal. A supressão superseded é1entrada separada,não um salto por erroSQL. Contagens por ficheiro/variante,linhas e hashes no anexo;definições/dados apenas no privado.

check-pii SQL1230ficheiros/0ocorrências;workflowPASS. Cronoff/firewall activos;2jobs exportados sanitizados antes do unschedule local,0depois. Live só2SELECT agregados;sem escritaLive,DSN,homologação,infraestrutura paga,deploy ouPublish.

check-pii docs/estudos/**:45ficheiros de base,hashesGit conferidos;12ocorrências preexistentes do scanner,sem valores publicados. Conteúdo novo/diff0ocorrências. Não se declara o histórico inteiro verde.

## Fecho

Reservaab79b39d libertada neste fecho;#329reconfirmada imediatamente antes do push. Estado actualizado;#352aberta;D-ERP309já registada. Próximo passo:parecer sobre delimitadores transacionais no runner. Checkpoint114/114 permanece comprovado neste run.
