# #352 — g9c com reversão por sentinela; nova dependência estrutural

26/10/2026. Executor: Codex. Origem: [parecer 6412268859](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6412268859) e autorização expressa do Pedro. R0 privado. Nenhuma consulta de dados de Live nesta etapa, escrita em Live, novo seed, alteração de baseline, deploy ou Publish. **G2 não executado.**

## Resultado

**G1 vermelho numa instrução posterior fora do predicado.** A versão `20260913140128` concluiu, com salto integral do g9c aprovado e execução das restantes instruções. O replay avançou até `20260915004441`.

- Plano: 1.464 entradas; **1.087 concluídas**, 1 falhada, 376 não tentadas.
- Checkpoints: cidades **47/47**, categorias **114/114**, zero diferenças.
- **62/62 verificações do job nativo PASS**, incluindo salto do g9c sem fixtures e rejeição de handler alterado ou sentinela removida antes de enviar SQL.
- **26/26 testes locais da classe PASS**.
- PII: **1.242 ficheiros SQL**, zero ocorrências e zero JSON inválido.
- Ledger, órfãos, overlays, seeds e gémeos inalterados por comparação de bytes. Não foi acrescentado qualquer seed de fornecedor, perfil, evento ou fechamento.
- Crons: 12 exportados com comandos redigidos, 0 após limpeza local; agendador desligado. Compensação final de ACL não alcançada.

## Prova e registo do g9c

Ponto 1 actualizado: DO sem DDL; DML apenas numa subtransacção cujo único fim normal é uma RAISE sentinela e cujo handler relança tudo o que não é a sentinela. Pontos 2, 3 e 4 mantidos.

- Versão: `20260913140128`; bloco inteiro **L80–145**.
- SHA-256 do bloco publicado: `5da519e3ec69b6575a42f2403dd2e9e41f59e930d1cab07f1be94fae6c8f17d2`.
- Subtransacção: **L94–137**; DML: **L96**.
- Sentinela: `PROVA_G9C_ROLLBACK`, **L134**.
- Handler: **L135–137**, aceita apenas a sentinela e relança os outros erros.

Prova por leitura vinculada ao hash exacto; saídas antecipadas, sentinela removida, DML fora da subtransacção e handler que engole outros erros são rejeitados. Manifesto privado: `proofs/data-volume-assertions.json`. Registo da aplicação em `ledger/skipped-reviewed.json`, incluindo sentinela, linhas do handler e transacção da versão confirmada.

O runner **salta o g9c inteiro antes de executar o DML**. Não divide nem edita o bloco histórico e não adiciona uma regra genérica para ignorar SQLSTATE 23503. O teste nativo confirmou o salto sem fixtures de aplicação e a continuação da instrução seguinte. A reversão do DML original é prova estática do parecer; não se afirma ter executado esse UPDATE com dados operacionais.

Saltos totais: 155 destrutivos; 2.133 idempotentes (1.161 base, 610 policy_equal, 175 using_index, 169 trigger_equal, 1 insert_duplicate_equal, 10 txn_control, 3 insert_duplicate_superseded_by_ledger, 4 grant_revoke_missing_object); 4 revistos (3 data_volume_assertion, 1 orphan_dml_without_effect).

## Caso devolvido — fora do predicado

Versão `20260915004441`, criação de `public.artist_ads_daily`, instrução iniciada na **linha 123**. SQLSTATE **42703**: `i.campaign_name` inexistente, na leitura de Meta na **linha 144**.

O catálogo local recolhido no artefacto confirma: `crm.google_campaign_insights_daily` tem campaign_name; `crm.meta_campaign_insights_daily` tem 35 colunas e não tem campaign_name. É uma dependência estrutural na criação de função, não um bloco de prova de dados. A versão falhada não concluiu. **Parei e devolvi o caso na #352**, sem ignorar o erro, reconstruir a coluna ou assumir a sua origem. Não foi feita nova comparação com Live.

## Evidências e coordenação

- [Commit privado adb4bb26](https://github.com/pedrompropicio/mundopropicio-replay/commit/adb4bb261f0aa16f81fdedbddfcfcaac39ebfe88).
- [Run 40298602626](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40298602626), **06:19:25–06:26:02 de 26/10, Fortaleza (UTC−3)**; evidência UTC 09:19:25–09:26:02.
- Artefacto privado `schema-replay-352`, id `12639686703`; SHA-256 do ZIP reconferido: `e99f624f277c273993ae6d8846b0330a22ce3d525aac13a7be36d30d03117963`.
- SHA-256 do plano: `5ee1fcf60ea8ed9dddd2a1f7b6e7ca54815ec545ed70349b32356a75376d790f`.
- SHA-256 do manifesto da classe: `f93af04cf271b2daece7cff78728c93212f8e039a3bf285fda4875e2c8f54517`.

O push aguardou o agente Lovable ficar livre. Uma recusa automática exigiu nova confirmação de HEAD/agente; os três estados foram reconferidos às 09:18:51 UTC: público = Lovable = `cbc38d11fc118d920776fdde0a283269719f735d`, agentFinished=true; privado = `3078ead9446f7d5edb0011b3db538a498b65df3b`. Push com comparação de SHA, sem force, aceite em seguida.

Reserva #352 mantida. QUADRO e estado ficam para Claude Code, sem escrita pelo Codex. Issue aberta. Documento público sem SQL integral ou dados de pessoas.
