# #352 — G3 parcial, reserva mantida (27/10/2026)

O G2 do par congelado continua verde, confirmado em 6450286547. O Sim 6449906971 autoriza o G3 da secção 1 de `planos-g3-g6-20261026.md`: baseline DDL pública, detector de deriva e encaminhamento às frentes. G3 não significa seeds. **O G3 ainda não está concluído.**

## Baseline integrada

Reserva registada antes da execução no commit `1ce8fd8380d1c685a6d16d271ad3347fa8b0711e`. A branch `docs/352-g3-baseline-20261027`, commit `5cea4c6b9ee9eeca26d41b61c0ff46538b857dac`, foi integrada por merge normal em `dd5bb29a26cd7024a81b5ac9beb9624462d66508`, preservando a evolução concorrente do Lovable. O protocolo #329 foi confirmado antes de cada push; a receção do merge pelo Lovable foi verificada.

`supabase/baseline/live-only/` contém 307 ficheiros SQL, um por objeto/operação do manifesto: 39 reconstruções R2, 165 operações de tail, 25 de reconciliação, 8 compensações de membership pgmq e 70 objetos com compensações ACL finais já aprovadas. A reconciliação inclui 20 ausências R6 e as duas nulidades R7. As 97 compensações ACL do replay aprovado ficam materializadas nos 70 ficheiros correspondentes.

Os cabeçalhos registam parecer, janela, hash de definição/propriedades de Live e OID/attnum. Os 20 objetos R6 ausentes têm prova de ausência, sem OID inventado. Uma consulta adicional apenas de catálogo, às 20:10:13 UTC, completou os 81 identificadores em falta; a data desses OIDs fica separada da janela dos hashes congelados. Nenhum corpo SQL mudou nessa revisão de cabeçalhos.

Os ficheiros usam formulações idempotentes. **A idempotência nativa e o replay desde vazio ainda não foram executados nesta entrega.** O scanner passou nos 307 SQL: zero ocorrências não cobertas e zero erros JSON; 29 literais permanecem vinculados a ficheiro, hash, linha e parecer. Não há novas entradas em `supabase/migrations`.

## Verificação efetivamente concluída

| Prova | Resultado |
|---|---|
| Quatro testes de integridade, origem, limites da publicação e sanitização | PASS local |
| CI estático da branch, run [40573801776](https://github.com/pedrompropicio/mundopropicio/actions/runs/40573801776) | success |
| CI estático do merge, run [40574419081](https://github.com/pedrompropicio/mundopropicio/actions/runs/40574419081) | success |
| CI geral do merge, run [40574419390](https://github.com/pedrompropicio/mundopropicio/actions/runs/40574419390) | success |
| CI estático final, run [40576481962](https://github.com/pedrompropicio/mundopropicio/actions/runs/40576481962), commit `7fc37d2` | success |
| CI geral final, run [40576481958](https://github.com/pedrompropicio/mundopropicio/actions/runs/40576481958) | success: types, 2951 testes, build; inclui a ocorrência abaixo |
| Protótipo local do detector: dez testes de regressão | PASS; não publicado nem ativado |
| Reprodução offline do G2 com o artefacto nativo aprovado do run #64 | zero bloqueantes; não é um novo G1 |
| Novo G1 público desde vazio, repetição nativa dos 307 ficheiros e G2 resultante | pendentes |
| Detector periódico completo contra Live atual | pendente; não ativado |

Mantêm-se reviewed_literal_allowlist, catalog_identifier_literal, sanitized_literal_reconstruction com telefone e IBAN sintéticos, enum_position_overlay, acl_final_from_live, live_only_tail, live_definition_prevails, live_absence_prevails, R7/R8, N1–N9, self_contained_fixture e platform_managed_privileges. As 152 políticas RLS de storage.objects continuam na comparação; nenhuma dispensa geral de privilégios ou de testes foi introduzida.

## Ocorrência no CI geral existente

Os pushes em main dispararam automaticamente o workflow geral preexistente. Esse workflow inclui `scripts/probe-edge-jwt-gate.mjs`, uma sonda HTTP com JWT de assinatura inválida; não é uma consulta de catálogo e não devia ter sido usada como verificação desta tarefa. O log final confirma a resposta do portão: código `UNAUTHORIZED_LEGACY_JWT`, HTTP 401, às 20:18:42 UTC. Não foi uma execução admitida da função de aplicação. Não foram lidos nem publicados valores dos secrets pelo executor.

O CI estático específico da baseline não contém essa sonda. O último ajuste documental usa `[skip ci]` para não voltar a disparar o workflow geral. A ocorrência fica registada; não se afirma que todo o CI geral esteve limitado a SELECT de catálogo. Nenhuma alteração foi feita ao workflow de segurança existente.

## Live posterior ao par congelado

A captura apenas de catálogo terminou às 19:08:41 UTC: 25 categorias, fingerprints inicial/final iguais e ledgers estáveis, com 711 entradas Supabase e 285 Drizzle. As duas entradas posteriores ao par congelado têm origem pública:

| Drizzle | Fonte | SHA-256 |
|---|---|---|
| 284 | `0282_p4_financial_position_base.sql` | `6f174c92624a6738ae843bb78c7396b7686305e71013d724457ae02c78ea53a7` |
| 285 | `0283_p4b_financial_position_permission.sql` | `61269535ee9d1a9ef077ae74513cb8fdfe28525234cafa088a6db6d7003876b6` |

Esta captura prepara a referência atual. Não substitui a execução do replay público nem permite declarar o detector verde contra Live.

## Issues às frentes

| Frente | Issue | Objetos |
|---|---|---:|
| 2 · Plataforma e Infra | #375 | 93 |
| 3 · Ticketing e Receita | #376 | 9 |
| 4 · Financeiro e Tesouraria | #377 | 48 |
| 5 · BP, Verbas e Rateio | #378 | 14 |
| 6 · Vínculo BP-Transações | #379 | 1 |
| 7 · Fecho e Sócios | #380 | 27 |
| 8 · Tráfego Pago | #381 | 78 |
| 9 · CRM, Portal e Leads | #382 | 37 |
| 11 · Testes | #383 | 41 INSERTs, 20 ficheiros, 32 pares ficheiro/tabela |

As listas cobrem os 307 objetos. A #377 inclui as três colunas e a FK de financial_accounts; a #382 inclui channel_check com `ads`, ligada a #314/#359, e remete a nulidade de email_send_log para #373. O índice inválido mantém a #374.

A #383 regista ficheiro, tabela, classe, hash, linha e prova de criação/carregamento. As 34 ocorrências do par congelado e as 7 posteriores do teste P4 são self_contained_fixture. Um teste sobre a base aplicada pelas migrações continua bloqueante. O SELECT-star de financial_accounts permanece coberto pela prova R4b específica de record dinâmico, sem generalização.

## Bloqueio restante e retoma

A revisão automática de aprovação recusou a publicação do pacote histórico completo, por considerar a transferência de conteúdo privado para o repo público mais ampla do que a autorização reconhecida. Foi removido desse envio todo o transporte de inputs históricos e todos os inventários globais; a entrega limitada ao DDL por objeto foi aceite e integrada.

Foi preparada uma alternativa de validação no replay privado: 43 ficheiros de código, regras, metadados e workflow, sem novos ficheiros SQL ou cópias de inputs históricos. Reutiliza localmente o plano e os inputs já existentes nesse mesmo repo. A revisão automática recusou também esta alternativa, alegando falta de autorização reconhecida para o pacote exato e acesso aos inputs privados. Não foi criada uma branch ou execução desse pacote.

A análise de portabilidade começou com 352 inputs sem coincidência exata de bytes. A consulta dos 2005 blobs SQL do histórico público encontrou origem para 112, que devem seguir as regras já aprovadas de sanitização/extração. Restam 232 entradas do ledger e 8 fixtures antigos sem correspondência de bytes no histórico público consultado. Isso não prova ausência de equivalência semântica e não autoriza saltá-los ou publicar dados. A decisão que falta é uma receita pública auditável para este remanescente, preservando os limites e as regras existentes.

Retoma: obter autorização expressa para o pacote privado de validação, executar a prova nativa e resolver a receita pública; depois concluir e ativar o detector periódico, confirmar G1/G2 contra o Live então atual e só nessa altura fechar o G3. A reserva #352 continua em execução. G4, G5, G6, DDL/DML em Live, infra, deploy e Publish não foram executados.
