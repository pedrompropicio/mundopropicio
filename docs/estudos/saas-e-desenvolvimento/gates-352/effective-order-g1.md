# #352 — ordenação por efeito provado; checkpoint de30/04

Executor Codex. Despacho Pedro/Claude25/10/2026, corrigido nesta sessão: effective_at prevalece; nenhuma posição manual. Execução UTC25/10/2026,03:00:08–03:03:54 (00:00–00:03 Fortaleza).

## Resultado

**G1 vermelho no checkpoint; G2 não executado.**382entradas tentadas e concluídas sem erro SQL (133ledger+247órfãos+2seeds);1.072não tentadas de1.454. A cópia Coala20260429225802 agora passou. O checkpoint após20260430033938 foi alcançado e parou a execução: **0linhas locais contra114na referência Live**,114apenas na referência,0apenas local. Não houve continuação após a diferença.

[Run40156547812](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40156547812) · [código privado0dbe73a1](https://github.com/pedrompropicio/mundopropicio-replay/commit/0dbe73a104fbd04190e13f40a076cad74f844950) · [artefacto12584513680](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40156547812/artifacts/12584513680). ZIP SHA256 baeda446358946521074eb6bb5ce93e1deb393e71428127c4f8792fa2f173b67, conferido após download. [Anexo de metadados](effective-order-g1.json).

## Alteração e prova

A entrada orphan/20260429225802 ganhou effective_at2026-04-29T23:49:50Z; o timestamp de origem foi preservado. Ordenação natural:20260429233657 →20260429234508 →20260429225802 →20260430015540. Sem dependência/posição manual. SQL original e executado mantêm hash d66a82f968bec1643913aaa9c089b90caaeeac5ff7ea4bcee6e9a10e37d72c07. Nenhum SQL,seed,overlay ou checkpoint foi alterado.

Dois SELECT agregados em Live confirmaram183categorias Coala no total e mínimo23:49:50.008786UTC;158linhas têm esse segundo. Não se afirma que todas as 183 tenham o mesmo created_at. Query, hora UTC de recolha, resultados agregados e hash da fonte estão no manifesto privado effective-order.json. O plano fixa o hash desse manifesto. README documenta a regra: ordem por efeito provado só com created_at de Live e registo de prova, nunca por conveniência.

Runner usa effective_at quando presente, senão timestamp de origem; valida prova/manifesto/hash antes de iniciar SQL. Cinco testes novos PASS: ordem natural, timestamp preservado, ausência de prova recusada, efeito alterado recusado, hash alterado recusado.33testes anteriores PASS. Autotestes nativos anteriores28PASS (14base+1using_index+3trigger_equal+3policy_equal+7insert_duplicate_equal).

## Primeira falha não coberta

Paragem de validação, sem SQLSTATE: checkpoint20260430033938. A própria migração concluiu com exit0. Não é uma falha SQL nem motivo para nova regra de salto.

Evidência: seed/20260317221550_account_categories_raizes.sql,L3–119 omite created_at; ledger/20260317112301_.sql,L21 define o default now(); checkpoints/20260430033938.sql,L1 selecciona apenas linhas anteriores a08/04/2026. O seed executado agora não preserva os carimbos históricos exigidos pelo filtro. O artefacto confirma0linhas filtradas; isto não significa ausência de categorias na base. Seed isolado continua117linhas/0pais por resolver. O limite já constava do relatório policy-equal-g3-v3.md.

**Para parecer Claude, não aplicado:** definir como preservar a população histórica do checkpoint — por carimbos de origem autorizados no seed ou por um conjunto explícito de identidades de referência. Não remover simplesmente o filtro nem atribuir datas fictícias. Igualdade final de códigos/nomes/pais permanece não demonstrada; G2 aguarda G1verde.

## Saltos e controlos

100destrutivos;1.012idempotentes:527base+74using_index+84trigger_equal+326policy_equal+1insert_duplicate_equal. Contagens por ficheiro/variante, linhas e hashes no anexo; definições e dados apenas no artefacto privado. Nenhuma classe foi alargada.

check-pii SQL:1.229ficheiros/0ocorrências. Cron mantido off/firewall activos;2jobs exportados sanitizados antes do unschedule local,0depois. Live apenas dois SELECT agregados para a prova do efeito; catálogo novoG2 não recolhido. Sem escrita Live,DSN,targethomolog,infraestrutura paga,deploy ouPublish.

check-pii sobre docs/estudos/**:41ficheiros de base,hashes Git conferidos,12ocorrências preexistentes do scanner; valores não expostos. Conteúdo novo/diff:0ocorrências. O conjunto histórico não é declarado verde. Apenas metadados públicos; SQL e linhas ficam no privado.

## Fecho

Reserva3d1e6a16 libertada neste fecho;#329 reconfirmada imediatamente antes do push. Estado actualizado;#352aberta. D-ERP309 já registada, sem duplicação. Próximo passo: parecer sobre o critério histórico do checkpoint.
