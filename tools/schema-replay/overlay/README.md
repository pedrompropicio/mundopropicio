# Overlays #352 — revisão 6387254548

https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6387254548

Somente replay descartável, não Live/db push. Originais preservados. Hash original e executado separados em plan.json. G3/seed fora desta etapa. Os overlays83/84/109 são provisorio_catalogo_only. 0016 conserva bytes históricos exactos; proveniência aqui, sem cabeçalho adicional.

| Versão/ficheiro | Motivo | Prova | Intervalo retirado |
|---|---|---|---|
| 20260318234226_f2f475fc-98eb-4588-8b5e-2fb64205897b.sql | versão fora do ledger Live; sem efeito de schema; DML operacional ausente de Live (SELECT 24/10 17:04 UTC); overlay reproduz o estado de Live | parecer 6387254548; SELECT agregado anterior 17:04 UTC, sem conteúdo de linhas | [[3, 4], [7, 9], [12, 14], [17, 17]] |
| 20260324035801_115c5b3e-ab42-41f5-9c90-60025dcaf818.sql | versão fora do ledger Live; sem efeito de schema; DML operacional ausente de Live (SELECT 24/10 17:04 UTC); overlay reproduz o estado de Live | parecer 6387254548; SELECT agregado anterior 17:04 UTC, sem conteúdo de linhas | [[6, 7], [10, 11], [14, 15], [18, 19], [22, 23], [26, 27]] |
| 20260324035826_ca2ba0c8-0fea-488c-a69c-34e4c1b49443.sql | versão fora do ledger Live; sem efeito de schema; DML operacional ausente de Live (SELECT 24/10 17:04 UTC); overlay reproduz o estado de Live | parecer 6387254548; SELECT agregado anterior 17:04 UTC, sem conteúdo de linhas | [[4, 7], [10, 11], [14, 15], [18, 19], [22, 24], [27, 28]] |
| 20260324035849_5b7af418-e4e0-4131-a9f0-8b472602d608.sql | versão fora do ledger Live; sem efeito de schema; DML operacional ausente de Live (SELECT 24/10 17:04 UTC); overlay reproduz o estado de Live | parecer 6387254548; SELECT agregado anterior 17:04 UTC, sem conteúdo de linhas | [[3, 10]] |
| 20260408095142_424ff4e0-37da-4779-89b7-69f7ee04f5e9.sql | provisorio_catalogo_only; filhos do plano de contas substituídos futuramente pelo seed oficial; nenhum teste funcional sem seed | raízes presentes=2 no SELECT 24/10 17:04 UTC; versão fora do ledger actual | [[3, 6], [9, 11], [14, 16], [18, 21], [24, 27], [30, 32], [35, 38]] |
| 20260408111916_8baef1fa-b052-4ac0-aec8-910547c23917.sql | provisorio_catalogo_only; filhos do plano de contas substituídos futuramente pelo seed oficial; nenhum teste funcional sem seed | raízes presentes=2 no SELECT 24/10 17:04 UTC; versão fora do ledger actual | [[3, 3], [4, 4], [7, 15]] |
| 20260411120205_d9b969db-165f-4aa0-86e3-6e549305beda.sql | provisorio_catalogo_only; filhos do plano de contas substituídos futuramente pelo seed oficial; nenhum teste funcional sem seed | raízes presentes=2 no SELECT 24/10 17:04 UTC; versão fora do ledger actual | [[2, 12]] |
| 20260814221539_c29025c8-49fb-4c65-a4d5-2a24dae88daa.sql | só DDL; remover INSERT operacional | versão no ledger Live; SELECT 2026-10-24 17:58:41.361067+00: linhas=3 | [[63, 66]] |
| 20260924202758_ed08efce-1944-4b70-b975-cd4d0996a981.sql | só DDL; remover INSERT operacional | versão no ledger Live; SELECT 2026-10-24 17:58:41.361067+00: linhas=1 | [[296, 305]] |
| 0205_ugc_ios_watchdog.sql | retirar apenas INSERT operacional ugc_watchdog_config; preservar DDL, templates e controlos de segurança | remoção aprovada no comentário6387254548; nenhum dado operacional copiado | [[52, 53]] |
| 0200_capi_v2_consent_events.sql | retirar apenas INSERT operacional capi_v2_targets; preservar DDL, templates e controlos de segurança | remoção aprovada no comentário6387254548; nenhum dado operacional copiado | [[33, 36]] |
| 0016_derp178_tiktok_sync_status_per_connection.sql | 0016 histórico exacto; 0016 actual é gémeo de0017 e não é aplicado | commit c075613c65affa494d83cf080cbc995e2fe73fe8; hash Live id17 | substituição integral pelos bytes históricos; sem cabeçalho para preservar o hash |

0205: linhas efectivas52–53 neste snapshot; o parecer referia50–51. A selecção é o INSERT em ugc_watchdog_config, mantendo integralmente notification_templates.
Nenhum overlay de homologação gerida materializado; --target=homolog é recusado.

## Correcção iterativa após run40119163318

20260408191828: 42710, trigger igual ao criado em20260317122916. Adicionado DROP TRIGGER IF EXISTS antes da recriação, preservando a função e o original. Iteração local autorizada pelo passo5 do Pedro; correcção Codex pendente da revisão final Claude.

20260420192118: 42703, zone_id inexistente no replay. Pré-requisito mínimo zone_id uuid nullable, definido no snapshot de catálogo do repositório e confirmado na recolha24/10. Apenas coluna necessária antes do índice; não copiar tabela nem placeholders issue335_dropped, não seed. FK/CHECK/index adicional não presumidos; diferenças remanescentes para G2. Correcção Codex pendente de revisão final.

20260420204859: 42703 formula_type no INSERT SELECT operacional de event_closing_costs para event_forecasts. Retirado apenas backfill (linhas9–50); is_overhead, índice e comentários preservados. Não adicionar colunas de fórmula presumidas. Correcção iterativa local pendente de revisão final.
