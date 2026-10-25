# #352 — checkpoint com queries de referência e local separadas

Executor Codex; autorização Pedro/parecer Claude25/10/2026 nesta sessão. Run nativo UTC25/10,03:15:06–03:19:08 (00:15–00:19 Fortaleza). Sem nova consulta Live: referência já exportada preservada.

## Resultado

**G1 vermelho no checkpoint; G2 não executado.**382entradas tentadas e concluídas sem erroSQL (133ledger+247órfãos+2seeds),1072não tentadas de1454. CópiaCoala e20260430033938 concluíram com exit0. A comparação após essa versão retornou **111linhas locais contra114referência**. As 111 linhas presentes coincidem exactamente em code,name,parent_code; faltam3identidades. Execução parou,sem ignorar a diferença.

| Código | Campo divergente | Resultado |
|---|---|---|
| 10.7.01 | row_count | linha ausente localmente |
| 10.7.02 | row_count | linha ausente localmente |
| 10.7.03 | row_count | linha ausente localmente |

Nenhum nome ou valor de parent_code é publicado. Os códigos e campos acima são a lista integral devolvida pelo checkpoint.

[Run40157490655](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40157490655) · [código privado164a068a](https://github.com/pedrompropicio/mundopropicio-replay/commit/164a068af2491566708fb60c37d1a637df70dd8d) · [artefacto12585327350](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40157490655/artifacts/12585327350). ZIP SHA256 bd044213f4c4f63d651c0ebbfcdc6ac4b25419dee9073934cac96d4a2ad7dc08,verificado após download. [Anexo](checkpoint-dual-query-g1.json).

## Correcção aplicada

Referência114linhas inalterada,SELECT exportado2026-10-25T02:10:19.264Z. Hash da referência5a514c8b15fed0e6b0b7fee16370fb1cb625a4f3c9e4630d44fde94cafaa9b0f. A query original com filtro histórico foi preservada byte a byte em checkpoints/20260430033938-reference.sql; hash a484897ca17b8da32ffcfb5902f48967fcad109e1c31a68a268786ac827354bc.

Query local em checkpoints/20260430033938.sql: apenas empresaMP e códigos extraídos das114linhas,ordem por code,sem created_at. Hash fb21ce9cb5077e93587060431ea8cea234de6f9f8ae33e3d9dd0e32ff7d1eda0. SQL integral e dados permanecem privados.

Runner exige reference_query/local_query/reference com hashes próprios,queries SELECT e contagem/identidades da referência. Filtros temporais ficam apenas na referência. Compara listas ordenadas com igualdade exacta e exige114=114; nomes/case/pais não são normalizados. Diferença interrompe o run e regista apenas códigos/campos. Nenhuma migração,seed,overlay,ordem ou regra de salto foi alterada;1454entradas e seus hashes preservados.

Testes:9novos PASS (igualdade,nomes,pais,case,linha ausente,duplicação,ordem,contagem obrigatória,relatório sem valores);38anteriores PASS. Validação da referência real114e hashes PASS. Autotestes nativos anteriores28PASS. Seed isolado117linhas/0pais por resolver.

## Primeira falha e evidência para revisão

Paragem em checkpoint20260430033938,sem SQLSTATE. Não é falha da execução SQL; é divergência da reprodução perante o contrato Live.

Leitura das fontes sugere repetição da mesma transformação: orphan/20260430032104_ba05c786-ad03-4c20-bb0a-a8ef562a7a90.sql,L25–33 eL77–81 renomeia folhas e remove grupos; orphan/20260430033938_1cb98882-aca7-4af2-9920-aebde8e65611.sql,L29–37 eL70–75 repete a operação dentro de DO. A segunda remoção usa os códigos que a primeira transformação já atribuiu às folhas. Isto é uma hipótese causal apoiada pelo texto e pelas3ausências; não houve execução intermédia instrumentada para atribuir cada DELETE.

**Para parecerClaude,sem aplicação:** verificar se os dois ficheiros representam tentativas alternativas da mesma transformação e definir o tratamento histórico com prova. Não alterar a referência114,não inventar linhas,não criar overlay nem alargar regras nesta etapa.

## Saltos e controlos

100destrutivos;1012idempotentes:527base+74using_index+84trigger_equal+326policy_equal+1insert_duplicate_equal. Contagens por ficheiro/variante,linhas e hashes no anexo. Definições completas e linhas permanecem no privado. Sem nova classificaçãoG2 antes de G1verde.

check-pii:1229ficheiros de origem/0ocorrências;2queries de checkpoint verificadas separadamente/0. WorkflowPII PASS. Cronoff/firewall activos;2jobs exportados sanitizados e removidos apenas localmente,0depois. Sem Live novo,escritaLive,DSN,homologação,infraestrutura paga,deploy ouPublish.

check-pii docs/estudos/**:43ficheiros de base com hashesGit conferidos;12ocorrências preexistentes do scanner,sem valores expostos. Conteúdo novo/diff0ocorrências. Não se declara o histórico inteiro verde.

## Fecho

Reserva31f93311 libertada neste fecho;#329reconfirmada imediatamente antes do push. Estado actualizado,#352aberta,D-ERP309já registada. Próximo passo:parecer sobre os3códigos ausentes e a possível dupla transformação.
