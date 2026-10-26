# #352 — G1 verde; G2 com 448 diferenças em 12 famílias

Parecer 6429178426, 26/10/2026. Reserva mantida. O ciclo de execução e comparação terminou; o G2 continua vermelho e requer parecer sobre os residuais. Nenhuma alteração em Live.

## Execução e admissão do lote

- [Run privado 40420513489](https://github.com/pedrompropicio/mundopropicio-replay/actions/runs/40420513489), main privado d3c006118d89bf8c7a5b1b1c643df2866a55e52a.
- **1.538/1.538 entradas**, todas com exit 0. Checkpoints **47/47** e **114/114**; pgmq **1.5.1** confirmado no catálogo final.
- Lote #335 admitido: **286 objectos verificados, zero diferenças**. As sete entradas DDL incluem os cinco manuais pendentes e os dois complementos com definições de Live. Corpos substituídos preservados exactamente; hashes do script, do statement e da definição de Live em hashes-funcoes.json e no manifesto privado.
- A correcção do indicador, N8 e testes foram promovidos para main antes deste run. **14 testes de regressão passaram**, incluindo sucesso e falha do contrato. `manual_probe.passed=false` devolve saída diferente de zero e bloqueia a recolha G2. Neste run, passed=true.
- ACL final: **66 compensações por objecto/beneficiário**, em **55 objectos**, **102 comandos locais**, todos verificados. **18 objectos ausentes** continuam bloqueantes no G2: 12 funções, duas relações e quatro tipos. Nenhuma coluna existente foi tratada como objecto ausente. Default ACL e ownership não foram modificados; N8 mantém a sua delimitação.
- Saltos privados: 2.135 idempotentes, 156 destrutivos e 10 saltos já sujeitos a parecer. O manifesto de execução e o plan.json coincidem por ordem, origem e hash. A legenda estática `metadata.scope` ainda refere um contador Drizzle antigo; os contadores aqui usados foram verificados no plano e no manifesto de execução, que contêm **274** entradas Drizzle.

## Par consistente

GitHub main = Lovable = 7c6c0f4f5f020275c36f54121668bfd95800be2e, agente livre, reconfirmado imediatamente antes do push. As escritas foram adiadas enquanto o agente esteve ocupado; não houve force nem escrita concorrente.

Live: **711 Supabase + 274 Drizzle**, todas representadas por identidade e hash. As 0271 e 0272 chegaram durante a preparação e foram incorporadas após aplicação comprovada no ledger. As alterações posteriores do HEAD até ao SHA fixado eram documentais. Os **25 fingerprints** e os **985 registos dos ledgers** permaneceram iguais entre a recolha usada e a confirmação após o run. Horas UTC em resumo.json.

## Triagem attnum_window

Quatro colunas entraram em duas reconstruções com limites provados: public.artist_ads_alert_log.notified_at e public.song_link_events.capi_fbc, capi_fbp, capi_external_id. A análise de dependências não encontrou consumidor construtivo anterior que invalidasse essas janelas.

Sete colunas continuam pendentes: crm.meta_publish_plan.platform, crm.meta_publish_plan.external_campaign_id, public.artist_songs.tiktok_hashtags, public.artist_songs.tiktok_song_id, public.artist_audience_demographics.unit, public.song_links.artist_line e public.song_links.link_type. Em cinco casos falta um limite superior demonstrado; nos outros dois há CHECKs dependentes cuja janela ainda não foi provada. Não se usaram corpos PL/pgSQL como limites nem se reordenaram colunas existentes por conveniência. Restam diferenças de ordem lógica em 21 tabelas, depois de N7; o inventário e a prova por coluna estão no privado.

## Normalizações e classificação

| Regra | Antes | Depois |
|---|---:|---:|
| N1 | 8874 | 2312 |
| N2 | 2312 | 1458 |
| N3 | 1458 | 1242 |
| N4 | 1242 | 454 |
| N5 | 454 | 454 |
| N6 | 454 | 454 |
| N7 | 454 | 451 |
| N8 | 451 | 448 |

**448 residuais**, contra 793 no diagnóstico intermédio anterior: redução de **345**. Classificação final: **(a) 176**, **(b) 216**, **(c) 56**; **zero sem classe**. O grupo (b) inclui propriedades e presenças com origem conhecida/candidata no repo, identificadas no anexo privado. restore_shadow permanece em (b), como determinado. Cada diferença continua a ser bloqueio; não houve correcção automática das propriedades residuais.

| Família | Diferenças | Causa/estado |
|---|---:|---|
| Encontro de contas e guardas financeiras (#335) | 5 | Cinco triggers só em Live, com referência candidata em scripts do repo; fora dos 286 objectos do contrato admitido. |
| Consentimento, Clube e captação | 1 | Uma definição de função difere por hash; nenhuma normalização de corpo foi aplicada. |
| Carreira artística e relatórios de tráfego | 36 | Presenças, três ordens de coluna, nulidade e hashes de funções/opções de views; janelas pendentes identificadas na triagem. |
| CRM e integrações publicitárias | 105 | Predominam 96 presenças; cinco ordens de coluna e quatro hashes de propriedades restantes. Objectos sem janela provada ficam a parecer. |
| Finanças, BP e fecho restantes | 47 | 34 diferenças de ordem lógica de colunas, oito presenças e cinco hashes de definição/predicado. |
| Portal, eventos e conteúdo público | 20 | 17 diferenças de ordem lógica de colunas e três índices só em Live. |
| pgmq e filas de email | 26 | 24 relações de pertença à extensão só no replay e dois triggers só em Live; pgmq é 1.5.1 nos dois lados. |
| Exceções de aplicação em schemas geridos | 46 | Excepções da aplicação preservadas por N4: 43 presenças, duas propriedades de grants e uma validade de índice. |
| Papéis e privilégios globais | 8 | Quatro ACL de objectos ausentes, uma default ACL, duas memberships e uma configuração de papel; permanecem visíveis após N8. |
| Outras funções e vistas | 31 | 23 hashes de definição, quatro de configuração e quatro funções só em Live. |
| Estrutura e isolamento restantes | 121 | 48 ordens lógicas, 43 presenças, nulidade/default, FKs, predicados e enumeração ainda distintos; não houve reordenação por conveniência. |
| restore_shadow — origem no ledger | 2 | Função e respectiva ACL ausentes; origem no ledger confirmada, mantidas no grupo b. |

## Outras funções e vistas — dez objectos

- public.delete_email(pg_catalog.text,pg_catalog.int8)
- public.enqueue_email(pg_catalog.text,pg_catalog.jsonb)
- public.move_to_dlq(pg_catalog.text,pg_catalog.text,pg_catalog.int8,pg_catalog.jsonb)
- public.read_email_batch(pg_catalog.text,pg_catalog.int4,pg_catalog.int4)
- public._cache_cancel_contract(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text)
- public._revert_event_to_version(pg_catalog.uuid,pg_catalog.uuid,pg_catalog.uuid,pg_catalog.text,pg_catalog.bool)
- public._run_invariant_checks_cards()
- public._tmp_rollback_probe()
- public.apply_supplier_credit(pg_catalog.uuid,pg_catalog.uuid,pg_catalog."numeric",pg_catalog.uuid)
- public.auto_create_initial_bp_version()

## Estrutura e isolamento — dez objectos

- public.app_role
- public.backup_runs_ok_unico_por_dia_alvo
- public.ticket_sales.ticket_sales_lot_id_fkey
- public.ticket_sales.ticket_sales_zone_id_fkey
- pg_graphql:pg_event_trigger:event trigger graphql_watch_ddl
- pg_graphql:pg_event_trigger:event trigger graphql_watch_drop
- public.camarim_items.approved_without_document
- public.camarim_items.approved_without_document_reason
- public.camarim_items.pending_review_reason
- public.camarim_sessions.spent_total

## Evidência e limites

Evidência completa de comparação e compensações no [commit privado 73b9503](https://github.com/pedrompropicio/mundopropicio-replay/tree/73b9503007ccfa718f2d5a96784a7d845f02e688/evidence/acl-final-20261026); artefacto do run e SHA-256 em resumo.json. O scanner passou sobre 1.311 SQL: zero ocorrências de PII, 961 literais JSON válidos. Três candidatos lexicais eram descrições técnicas fixas, não nomes pessoais; a disposição foi vinculada a ficheiro, linha e hash no manifesto privado. Não se alterou o SQL para os esconder. Os documentos públicos passaram o scanner separado.

A frente 2 tem o seguimento não bloqueante na [#370](https://github.com/pedrompropicio/mundopropicio/issues/370), apenas por referência ao parecer. A primeira tentativa de reproduzir detalhes de segurança foi recusada pela revisão automática; a issue aceite não os reproduz.

Live foi usado apenas para SELECT de catálogo e dos registos de migração. Sem dados novos, seeds novos, segredos, infraestrutura, deploy ou Publish. QUADRO e estado ficam com Claude Code. A reserva mantém-se porque o G2 não está verde. Próximo passo: parecer por família sobre os residuais e as janelas ainda não demonstradas; nenhuma criação de homologação está autorizada por este fecho.
