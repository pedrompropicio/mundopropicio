# #352 — g9b admitido; g9c devolvido por escrita

26/10/2026. Executor: Codex. Origem: [parecer 6407915784](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6407915784) e autorização expressa do Pedro. R0 privado. Nenhuma nova consulta de dados de Live, escrita em Live, semente operacional, alteração de baseline, deploy ou Publish nesta etapa. **G2 não executado, conforme pedido.**

## Resultado

**G1 vermelho num bloco posterior fora do predicado.** A versão `20260913134707` concluiu: o g9b permaneceu inteiro, com o salto de data_volume_assertion registado e as restantes instruções executadas normalmente.

- Plano: 1.464 entradas; **1.072 concluídas**, 1 falhada, 391 não tentadas.
- Checkpoint de cidades **47/47**; categorias **114/114**; zero diferenças em ambos.
- **59/59 testes nativos PASS**; **17/17 testes locais da classe PASS**.
- PII: **1.242 ficheiros SQL, zero ocorrências e zero JSON inválido**.
- Ledger, órfãos, overlays, seeds e gémeos inalterados por comparação de bytes. Nenhum evento, fechamento ou fornecedor foi semeado.
- Crons: 12 exportados com comando redigido, 0 após limpeza local; agendador desligado. Compensação final de ACL não alcançada.

## Predicado e manifesto

O ponto 2 passou a abranger literais de dados de produção: contagens ou identificadores/valores de linhas concretas em tabelas que não são de referência semeada. Pontos 1, 3 e 4 mantidos. Os dois blocos aprovados continuam vinculados a hashes exatos; nenhum bloco novo é admitido automaticamente.

Aplicações confirmadas em `ledger/skipped-reviewed.json`:

| Versão | Linhas do bloco | SHA-256 do bloco publicado |
| --- | --- | --- |
| 20260913132000 | 83–131 | f73d41106083f6e5e1685a711b22839c3ffe3c3e8a3f05d82471280bcb7685e9 |
| 20260913134707 | 392–462 | ff91c873e1b602fc1c9cf0052e8ab2c4e558a5a7270e1c1ab8049dd884624c51 |

Manifesto: `proofs/data-volume-assertions.json`, apenas no privado. O g9b não foi dividido ou editado. A prova original é tentada numa subtransacção; só a falha concreta previamente comprovada é aceite e revertida, permitindo concluir o resto da versão. Falhas de referência, de autorização e erros inesperados continuam a parar, com testes nativos negativos. Não se afirma equivalência de catálogo ou isolamento completo: G2/G3 não foram realizados nesta etapa.

Saltos totais: 155 destrutivos; 2.133 idempotentes (1.161 base, 610 policy_equal, 175 using_index, 169 trigger_equal, 1 insert_duplicate_equal, 10 txn_control, 3 insert_duplicate_superseded_by_ledger, 4 grant_revoke_missing_object); 3 revistos (2 data_volume_assertion, 1 orphan_dml_without_effect).

## Caso devolvido — g9c fora do ponto 1

Ficheiro `ledger/20260913140128_fcb81f7a-f317-46ad-b2a1-cade700b375e.sql`, bloco DO iniciado na **linha 80**. Primeira falha no **UPDATE da linha 96**, SQLSTATE **23503**: `profiles_linked_supplier_id_fkey`, ligação a um fornecedor inexistente no replay.

Este bloco **contém DML sobre public.profiles** e, portanto, não cumpre o ponto 1, mesmo que a simulação pretenda reverter posteriormente. Não foi saltado, dividido ou editado; o fornecedor não foi semeado e a FK não foi alterada. A versão falhada não concluiu. Execução interrompida e caso devolvido na #352.

## Evidências e coordenação

- [Commit privado 3078ead9](https://github.com/pedrompropicio/mundopropicio-replay/commit/3078ead9446f7d5edb0011b3db538a498b65df3b).
- [Run 40268727529](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40268727529), **01:22:42–01:29:44 de 26/10, Fortaleza (UTC−3)**; evidência UTC 04:22:42–04:29:44.
- Artefacto privado `schema-replay-352`, id `12627133273`; SHA-256 do ZIP reconferido: `a386fe28f88daf3394525349aa691416c8cc6da56844fe09e4d4b469b69eedf5`.
- SHA-256 do plano: `6571ba10e793b7838dee2c1b004b0b5e409c2471976713d6004835e87fe5f2ec`.
- SHA-256 do manifesto da classe: `42bbaa6ade6f5e1ea5a8cce10d3ee4f35bf1fa4ebb2cb2f0bcb9d97e5443766b`.

#329 reconfirmada antes do push privado: GitHub main = Lovable = `20180fee16f97ce4b8332c7aeabe9310dfed9051`, agentFinished=true, às 04:22:08 UTC. Reserva #352 mantida. QUADRO e estado ficam para Claude Code, sem escrita pelo Codex. Issue aberta. Documento público sem SQL integral, identidades ou dados de pessoas.
