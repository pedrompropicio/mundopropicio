# #352 — data_volume_assertion: aplicação e limite do predicado

26/10/2026. Executor: Codex. Origem: [parecer 6407712528](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6407712528) e autorização expressa do Pedro nesta sessão. R0 privado; sem novas consultas de dados de Live nesta etapa, sem escrita em Live, sem seeds adicionais, sem alteração de baselines, sem deploy ou Publish. **G2 não autorizado e não executado.**

## Resultado do G1

**G1 vermelho por novo bloco fora do predicado.** A versão `20260913132000` concluiu normalmente; só o bloco DO de prova teve o salto autorizado, registado com versão, linhas e hash. A versão seguinte `20260913134104` também concluiu, assim como os dois grupos dos gémeos sintéticos.

- Plano: 1.464 entradas; **1.071 concluídas**, 1 falhada, 392 não tentadas.
- Checkpoint de cidades: **47/47**, zero diferenças.
- Checkpoint de categorias: **114/114**, zero diferenças.
- **56/56 testes nativos PASS**, incluindo aceitação da falha operacional e rejeição de falha de referência e erro estranho.
- **9/9 testes locais da nova regra PASS**, incluindo rejeição de escrita misturada, baseline alterado, origem não-ledger e versão não aprovada; preservação das restantes instruções.
- PII: 1.242 ficheiros SQL, zero ocorrências e zero JSON inválido. SQL histórico, seeds, overlays e gémeos sem alterações.
- Crons: 12 exportados com comandos redigidos, 0 após limpeza local; agendador desligado. Compensação final de ACL não alcançada.

## Aplicação da classe

Única aplicação: `20260913132000`, **linhas 83–131**, SHA-256 do bloco executável publicado `f73d41106083f6e5e1685a711b22839c3ffe3c3e8a3f05d82471280bcb7685e9`.

Os quatro pontos do predicado estão registados e vinculados ao hash em `proofs/data-volume-assertions.json`: bloco de leitura sem DDL/DML; baseline literal operacional; proveniência no ledger Live; execução inalterada do resto da migração. Nenhum outro bloco é admitido automaticamente.

Para não ocultar uma falha de referência, o runner tenta a prova original numa subtransacção: só a falha operacional já comprovada de events é aceite; esse bloco é revertido e registado. Erros diferentes ou de referência são propagados. Não se reduziram números nem se acrescentaram linhas. Resultado comprovado em `ledger/skipped-reviewed.json`: **1 data_volume_assertion**, com a transacção da versão confirmada, mais o salto orphan_dml_without_effect já existente.

Restantes saltos: 155 destrutivos; 2.133 idempotentes — 1.161 base, 610 policy_equal, 175 using_index, 169 trigger_equal, 1 insert_duplicate_equal, 10 txn_control, 3 insert_duplicate_superseded_by_ledger, 4 grant_revoke_missing_object.

## Caso devolvido ao revisor — fora do predicado

Ficheiro `ledger/20260913134707_c390d480-344f-4c09-a8fc-7a5eb5311ef0.sql`: DO nas linhas **392–462**; primeira falha no RAISE da **linha 444**, SQLSTATE **P0001**, esperado **1 fechamento**, observado **0**. A leitura envolve `public.event_settlement_participants` e `public.event_settlements`.

O bloco **não cumpre o ponto 1** do parecer: além das contagens, obtém um identificador de fechamento nas linhas 446–451, compara identificadores nas linhas 452–453 e soma percentagens nas linhas 456–459; também verifica funções de autorização nas linhas 414–417. Não é exclusivamente a prova de volume prevista no predicado. Não foi saltado, repartido ou alterado. A transacção desta versão não concluiu. Execução interrompida e caso devolvido na #352, conforme pedido.

## Evidências e coordenação

- [Commit privado 51f51019](https://github.com/pedrompropicio/mundopropicio-replay/commit/51f51019f8cd75e08eee4746b12ca825e80fe0c6).
- [Run 40265850177](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40265850177): **00:48:29–00:54:03 de 26/10, Fortaleza (UTC−3)**; evidência UTC: 03:48:29–03:54:03.
- Artefacto privado `schema-replay-352`, id `12625764800`; SHA-256 do ZIP reconferido: `ffe6519c72acb4473027dd6ecf4eaa78af40bd9d1bed2f8a70cc7eb09c94e23c`.
- SHA-256 do plano: `3ffc14d74e5f56f550b54032c41fcfdb230f4376e2755145371def4d11761a1a`.
- SHA-256 do manifesto da classe: `302adfd19c691d6bfe948eeffb1d48fb2342201386aab2055a7dbe5ed3728a96`.

#329 reconfirmada antes do push privado: GitHub main = Lovable = `cb0739b5247751692f247faa96ad9973efce186e`, agentFinished=true, às 03:48:03 UTC. Reserva #352 mantida; QUADRO e estado ficam para Claude Code, sem escrita pelo Codex. Issue aberta. Documento público só com contagens, hashes e referências, sem SQL integral ou dados de pessoas.
