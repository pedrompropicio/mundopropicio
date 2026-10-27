# #352 — G3 bloqueado na idempotência, reserva mantida (27/10/2026)

O G2 do par congelado continua verde, confirmado em 6450286547. O Sim 6449906971 autoriza o G3 da secção 1 de `planos-g3-g6-20261026.md`: baseline DDL pública, detector de deriva e encaminhamento às frentes. G3 não significa seeds. **O G3 ainda não está concluído.**

## Baseline integrada

Reserva registada antes da execução no commit `1ce8fd8380d1c685a6d16d271ad3347fa8b0711e`. A branch `docs/352-g3-baseline-20261027`, commit `5cea4c6b9ee9eeca26d41b61c0ff46538b857dac`, foi integrada por merge normal em `dd5bb29a26cd7024a81b5ac9beb9624462d66508`, preservando a evolução concorrente do Lovable. O protocolo #329 foi confirmado antes de cada push; a receção do merge pelo Lovable foi verificada.

`supabase/baseline/live-only/` contém 307 ficheiros SQL, um por objeto/operação do manifesto: 39 reconstruções R2, 165 operações de tail, 25 de reconciliação, 8 compensações de membership pgmq e 70 objetos com compensações ACL finais já aprovadas. A reconciliação inclui 20 ausências R6 e as duas nulidades R7. As 97 compensações ACL do replay aprovado ficam materializadas nos 70 ficheiros correspondentes.

Os cabeçalhos registam parecer, janela, hash de definição/propriedades de Live e OID/attnum. Os 20 objetos R6 ausentes têm prova de ausência, sem OID inventado. Uma consulta adicional apenas de catálogo, às 20:10:13 UTC, completou os 81 identificadores em falta; a data desses OIDs fica separada da janela dos hashes congelados. Nenhum corpo SQL mudou nessa revisão de cabeçalhos.

A prova nativa foi executada no run privado 40580037584 e encontrou uma falha de idempotência na segunda aplicação de public.song_link_diag: a identidade da coluna id é criada sem guarda. **A baseline ainda não satisfaz a aceitação nativa do G3.** O scanner passou nos 307 SQL: zero ocorrências não cobertas e zero erros JSON; 29 literais permanecem vinculados a ficheiro, hash, linha e parecer. Não há novas entradas em `supabase/migrations`.

## Verificação efetivamente concluída

| Prova | Resultado |
|---|---|
| Quatro testes de integridade, origem, limites da publicação e sanitização | PASS local |
| CI estático da branch, run [40573801776](https://github.com/pedrompropicio/mundopropicio/actions/runs/40573801776) | success |
| CI estático do merge, run [40574419081](https://github.com/pedrompropicio/mundopropicio/actions/runs/40574419081) | success |
| CI geral do merge, run [40574419390](https://github.com/pedrompropicio/mundopropicio/actions/runs/40574419390) | success |
| CI estático final, run [40576481962](https://github.com/pedrompropicio/mundopropicio/actions/runs/40576481962), commit `7fc37d2` | success |
| CI geral final, run [40576481958](https://github.com/pedrompropicio/mundopropicio/actions/runs/40576481958) | success: types, 2951 testes, build; inclui a ocorrência abaixo |
| Dez testes de regras e detector no pacote privado | PASS no run 40580037584; detector periódico não ativado |
| Reprodução offline do G2 com o artefacto nativo aprovado do run #64 | zero bloqueantes; não é um novo G1 |
| Novo G1 no privado, com fontes públicas e inputs privados, e repetição nativa da baseline | FAIL de idempotência após 1274 entradas; checkpoints 114/114 e 47/47 PASS |
| Novo G2 N1–N9 resultante desse replay | não executado; depende do G1 completo |
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

Esta captura é a referência de 19:08 UTC. Não substitui a execução do replay nem permite declarar o detector verde contra Live posterior; a documentação concorrente já regista a entrada 0284 depois dessa janela. A retoma deve recolher catálogo atual e reconciliar as migrações posteriores pelas regras existentes.

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

## Aceitação corrigida e execução autorizada

O parecer [6452933096](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6452933096) corrige a fonte de construção: repo público mais baseline e inputs históricos já existentes no replay privado. G1 desde vazio e G2 N1–N9 correm no privado. Portabilidade pública integral deixa de ser gate do G3. A #387 da frente 2 regista 232 entradas e 8 fixtures apenas com contagens e hashes; a #388 regista a retirada ou isolamento da sonda HTTP de produção do CI geral.

O Sim [6452948208](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6452948208) autorizou exatamente g3-validation-proposal.zip: 43 ficheiros, 270709 bytes de fontes, SHA-256 `e4fef34051db251e3578d16791c5495c22cfe7ecf6401efb2ad66e6cf587cca9`. Os 43 ficheiros foram conferidos contra o ZIP e publicados byte a byte no replay privado, sem novos ficheiros SQL ou cópias dos inputs históricos.

- Commit privado: `70a79285cfdc6a860a334da12ef75347fe4d3f1d`, branch `docs/352-g3-native-e4fef340-20261027`, pai `9ed9941e95e7e626c0c5d8be15399fb13e3f2b59`. A main privada não foi movida.
- #329 imediatamente antes do push: GitHub e Lovable em `e8f4312e166ffac86619964f33914f72b2876920`, agente livre.
- Só CI específico: run [40580037584](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40580037584), job `122456654147`, conclusão failure.
- Montagem de 1547 entradas e 307 operações: PASS. Dez testes: PASS. Scanner: 1534 ficheiros, zero ocorrências e zero erros JSON, 32 literais revistos.
- Isolamento observado: reset local desde vazio, cron.launch_active_jobs off, egress externo do contentor REJECT, alvo remoto não suportado.
- Checkpoints: 114/114 e 47/47 PASS. Foram concluídas 1274 entradas, índices 0–1273.
- Na entrada de índice 1274, a segunda aplicação da operação `public.song_link_diag` falhou: column id is already an identity column. O ficheiro público contém ADD GENERATED ALWAYS AS IDENTITY sem guarda na linha 94.
- Novo G1 incompleto, novo G2 não executado e detector periódico não ativado. O G2 aprovado do par congelado não muda de estado.

O artefacto privado `12769961586`, g3-private-native-probe, contém as provas de isolamento, checkpoints e verificações preparatórias. SHA-256 do ZIP do artefacto: `8b561c1b18b422e8391d0b684e253e0f5a94c3930e99c1e2e86c0932698c3c5c`. O conteúdo privado não foi transposto para este relatório.

## Correção preparada e limite de autorização

A correção local proposta muda apenas o ficheiro DDL de public.song_link_diag e os seus hashes no manifesto. Consulta pg_attribute.attidentity: cria a identidade apenas quando ausente, aceita a repetição do modo ALWAYS já existente e falha se o modo encontrado for diferente. Não remove ou reinicia a sequência, não apaga dados e preserva origem, janela, OID e hash de Live. A pesquisa dos 307 ficheiros encontrou um único ADD GENERATED AS IDENTITY desta forma.

Patch de revisão `g3-song-link-identity-proposal.patch`, SHA-256 `35303479fe0796b7178ab27d43f65f6d9e411ee480c0474c941816b4c9c3e23f`. Scanner da proposta: 307 ficheiros, zero ocorrências; quatro testes estáticos PASS. A proposta não foi publicada nem executada em PostgreSQL. Testes estáticos não certificam idempotência nativa.

O ZIP autorizado permanece intacto. O workflow fixa a baseline pública em 7fc37d2; consumir a correção requer atualizar esse pin, mudando o hash do pacote. A instrução de Pedro em 6452948208 exige nova confirmação para essa mudança. Não se reaplica o mesmo run por ser uma falha determinística, nem se altera um input fora do pacote para contornar o pin.

Após confirmação da correção e do pacote revisto: publicar apenas o âmbito aprovado, repetir a prova nativa completa, G1 e G2 N1–N9, recolher catálogo atual e concluir o detector periódico em CI específico. O workflow autorizado tem push e execução manual, sem schedule; a referência de catálogo fixa não constitui um detector periódico atual. Não é declarada ativação nem aceitação verde.

A documentação deste resultado usa skip ci. Com agente Lovable ocupado, fica em branch documental separada conforme #329; a integração exige nova verificação dos heads e agente livre. Reserva #352 mantida. Sem DDL/DML em Live, G4/G5/G6, infra, deploy ou Publish.
