# #352 — Gates G1–G5 (R0)

> Retoma 24/10/2026: [preparação revista para Claude](gates-352/revisao-r0-20261024.md). Não houve novo replay; gates bloqueados mantidos. O fecho administrativo anteriormente pendente foi resolvido nesta entrega conjunta de documentação, estado e libertação da reserva.

Data: 24/10/2026. Executor: Codex. Revisor: Claude (0 - Cowork), por leitura. **Fecho documental com bloqueios; não é conclusão dos gates nem autorização R2.**

Leituras iniciais: [revisão 6385109891](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6385109891) e [verificacoes-352.md](verificacoes-352.md). Decisão A preservada; G6 fica exclusivamente com Pedro, sem valores preenchidos.

## Resultado

| Gate | Estado | Evidência / falta |
|---|---|---|
| G1 | **VERMELHO** | Replay Supabase nativo executado: 31/1012 migrações aplicadas; falha SQL real na 32.ª, 980 não tentadas. Não há lista fechada de todas as falhas. |
| G2 | **VERMELHO** | Seis consultas executadas em Live e no nativo parcial. Comparação anexada, mas classificação integral bloqueada pelo replay incompleto. Duas colunas comprovadamente classe (c); papel Drizzle esclarecido. |
| G3 | **VERMELHO** | Nenhuma migração promovida: não há diff completo classificado nem prova para gerar DDL exacto de todos os itens (b)/(d). Nenhum segundo replay com propostas alegado. |
| G4 | **VERDE — proposta preparada** | 81 crons com nome, horário, estado actual, comando redigido e proposta individual; nenhum activo proposto na homologação. A aprovação operacional continua com Pedro. |
| G5 | **VERMELHO** | 14 nomes Vault classificados; faltam exclusivamente os nomes das edge functions, a fornecer por Pedro no painel Lovable. |

## Origem, SHA e execução

Reserva em QUADRO antes do trabalho: commit `8f1dd5154210620243da55d35ef89d511f8df791`; preflight #329 com GitHub/Lovable `da001af9536458e970c0a5ca2a44071c4772df37`, agente livre. Branch `study/352-schema-replay` criada a partir de main já com a reserva. Antes das escritas documentais em main, HEAD GitHub/Lovable confirmado igual e agente livre.

Workflow e executor exclusivamente na [branch de estudo](https://github.com/pedrompropicio/mundopropicio/tree/study/352-schema-replay): `.github/workflows/schema-replay.yml`, `tools/schema-replay/run.py`. SHA ensaiado: `77d1398f587eab5e8417543bfd03048aa71e5215`. Nenhuma migração existente alterada, nenhum workflow ou SQL novo colocado em main.

[Run nativo 40101763848](https://github.com/pedrompropicio/mundopropicio/actions/runs/40101763848), 24/10/2026 14:16:44–14:18:01 UTC. Supabase CLI 2.84.2, PostgreSQL 17.6, Docker no runner ubuntu-latest. [Artefacto 12563241815](https://github.com/pedrompropicio/mundopropicio/actions/runs/40101763848/artifacts/12563241815), SHA256 ZIP `be5b96eb84296e27490d81439cecb07bfd5505ef214daa582dde096c37f0c589`, retenção 30 dias. Conteúdo JSON e log preservados também no [anexo permanente](gates-352/replay-e-proveniencia.json).

Push só da branch de estudo; permissions contents: read; checkout persist-credentials: false; setup-cli; init/start sem código de edge functions; bootstrap real Auth/Storage; cópia só de supabase/migrations; db reset --local --no-seed. manual/ e drizzle/ excluídos. Agendador local desligado antes do SQL da aplicação e saída externa dos containers bloqueada por firewall. Nenhum segredo remoto nem GitHub environment secret fornecido; autenticação administrativa apenas com credencial padrão descartável da CLI local, não uma credencial do ERP.

Dois runs anteriores falharam exclusivamente antes das migrações: [40101146500](https://github.com/pedrompropicio/mundopropicio/actions/runs/40101146500), permissão do papel postgres para configurar cron; [40101600994](https://github.com/pedrompropicio/mundopropicio/actions/runs/40101600994), autenticação local do papel supabase_admin. Corrigido só o executor para conexão administrativa local da CLI; o terceiro run provou bootstrap, isolamento e execução SQL. Não se confundem essas duas falhas com migrações defeituosas.

## G1 — falha real e proposta, sem aplicação

Ordem integral e hashes dos **1012** ficheiros em `native.migration-order` do anexo; versões realmente aplicadas em `native.applied`. A migração de ordem 32 é:

`supabase/migrations/20260318234226_f2f475fc-98eb-4588-8b5e-2fb64205897b.sql`, linhas 7–9, statement 1 (índice CLI a partir de zero).

Mensagem: `insert or update on table "events" violates foreign key constraint "events_city_id_fkey"`; **SQLSTATE 23503**. O INSERT exige uma cidade ausente da base vazia. As linhas 12–14 também referem cidade/venue fixos, e a linha 17 remove reservas por conteúdo de notes. A pesquisa dos dois city IDs na sequência Supabase encontra somente este ficheiro: não há migração anterior a criá-los. É migração de dados operacionais dependente de estado prévio, não falha do runner. A transacção falhou; não foi ignorada, editada nem repetida com dados inventados.

**Correcção proposta, não executada:** rever a separação deste DML operacional da sequência reproduzível de schema, com um caminho explicitamente aprovado para instalações novas. Não copiar cidades/eventos reais nem inserir placeholders apenas para passar. Uma migração nova no fim da cadeia não corrige uma falha que acontece antes dela. É necessária decisão sobre como reconstruir este trecho histórico antes de retomar o replay. Depois, executar novamente desde vazio para descobrir eventuais falhas posteriores; esta é a primeira falha conhecida, não uma lista fechada.

Pesquisa case-insensitive: zero `CONCURRENTLY` em supabase/migrations. O único caso encontrado em manual é `supabase/manual/20261017_issue333_normalized_uniqueness.PROPOSTA.sql:10`, CREATE UNIQUE INDEX CONCURRENTLY, com rollback comentado na linha 18. Fica fora do replay. **25001 não ocorreu neste run**; o risco referido por Claude não se materializou na sequência seleccionada.

## G2 — catálogo e Drizzle

Live recolhido novamente por query_database, SELECT apenas, em 24/10/2026, janela 14:09–14:10 UTC, com HEAD de referência `8f1dd5154210620243da55d35ef89d511f8df791`. Seis consultas separadas, não snapshot transaccional único. Conteúdo das consultas de [catalogo-queries.json](verificacoes-352/catalogo-queries.json) usado sem alterações também no runner; saída CSV convertida em JSON. Comparador normaliza booleanos, nulos e representação textual dos campos; não modifica SQL.

| Categoria | Live | Nativo parcial |
|---|---:|---:|
| Relações | 515 | 76 |
| Colunas | 6512 | 695 |
| Funções | 1112 | 116 |
| Políticas | 1308 | 69 |
| Triggers | 404 | 12 |
| Extensões | 11 | 7 |

[JSON da comparação parcial](gates-352/catalogo-diff-parcial.json): chaves dos objectos só em cada lado, alterados e iguais, hashes das recolhas Live, duas atribuições comprovadas (c), `classification_complete=false`. **Não satisfaz o critério de zero divergências por classificar.** Objectos ausentes porque 980 migrações não foram tentadas não devem ser classificados artificialmente como drift (d), nem todos os objectos em schemas geridos podem ser excluídos sem verificar ownership/proveniência. Listas definitivas (a)/(b)/(d) pendentes de G1; nenhuma exclusão ampla foi usada para fazer o gate passar.

Drizzle: `drizzle.config.ts` configura dialect PostgreSQL, schema drizzle/schema.ts, saída drizzle/migrations e ligação por variável LOVABLE_DB_MIGRATION_URL (valor não consultado). A tabela Live `drizzle.__drizzle_migrations` contém 240 registos. SHA256 dos **239/239 ficheiros** encontra correspondência no histórico Live, representando **238 hashes distintos**: 0016 e 0017 têm bytes iguais. Dois hashes históricos, IDs 17 e 165, não têm ficheiro actual correspondente; ficam registados para investigar versões anteriores, sem inventar o seu conteúdo. Os created_at do histórico são metadados da migração, não prova independente da hora em que foi aplicada.

Prova concreta de DDL por este caminho: `drizzle/migrations/0238_event_forecasts_revenue_split.sql`, SHA256 `408bf42f49e2a891a3d40dea69f9aa116186d1625ebb9d164d8e4dc7d5bb2bcc`, coincide com registo Live id 240; SELECT às 14:11:18 UTC confirma `public.event_forecasts.revenue_split_mode` e `revenue_split_params`. Não há criação destas colunas em supabase/migrations; em manual só existe rollback_0238.sql, que as remove. Estas duas colunas têm classe **(c)**. Portanto Drizzle não pode ser tratado como registo redundante de uma sequência Supabase completa. A evidência prova o caminho registado e os objectos, não identifica qual pessoa/processo o invocou. A regra documental antiga de DDL exclusivo via Supabase precisa de reconciliação com este facto; não foi alterada nesta etapa.

## G3 — bloqueado

Não foram criados ficheiros candidatos com DDL presumido nem datas de aplicação inventadas. Depois de resolver G1 e classificar G2, obter definições exactas por SELECT, verificar dependências, origem e data documental de cada (b)/(d), criar ficheiros idempotentes somente na branch e repetir G1/G2. Não aplicar em Live. Neste fecho não há prova de replay verde nem de redução do diff por promoções.

## G4 — proposta por cron

Fonte: SELECT cron.job, 24/10/2026 **14:08:42.282093 UTC**. O comando foi substituído integralmente por `<redigido>` no próprio SELECT, antes de sair da base; não houve leitura do comando bruto. Apenas nomes qualificados de funções foram extraídos separadamente para apoiar a proposta. Redacção integral intencionalmente conservadora: não certifica que o corpo foi auditado. Não houve consulta a cron.job_run_details.

**Todas as propostas mantêm homologation_active=false.** “Recriar desligado” exige posterior verificação da função e uso exclusivo de dados sintéticos. “Não recriar” refere-se a esta homologação inicial; integrações futuras exigem teste isolado e autorização próprios. Nenhuma proposta activa ou apontada à homologação antes de existir destino aprovado. Dados estruturados no [inventário](gates-352/inventario.json).

| ID | Cron | Schedule | Active Live | Comando | Proposta | Justificação |
|---:|---|---|---|---|---|---|
| 5 | cleanup-old-backups | `0 4 * * 0` | true | `<redigido>` | não recriar | cleanup-old-backups: depende de operação/integração de produção; não copiar nesta etapa. |
| 6 | monthly-backup-test | `0 5 1 * *` | true | `<redigido>` | não recriar | monthly-backup-test: depende de operação/integração de produção; não copiar nesta etapa. |
| 11 | coala-sync-regular | `0 7 */3 * *` | false | `<redigido>` | não recriar | coala-sync-regular: depende de operação/integração de produção; não copiar nesta etapa. |
| 12 | coala-sync-festival | `0 7-21 * * *` | false | `<redigido>` | não recriar | coala-sync-festival: depende de operação/integração de produção; não copiar nesta etapa. |
| 13 | fever-sync-regular | `0 8 * * *` | false | `<redigido>` | não recriar | fever-sync-regular: depende de operação/integração de produção; não copiar nesta etapa. |
| 14 | fever-sync-festival | `0 8,12,16,20 28-31 5 *` | false | `<redigido>` | não recriar | fever-sync-festival: depende de operação/integração de produção; não copiar nesta etapa. |
| 15 | fever-sync-festival-jun | `0 8,12,16,20 1-2 6 *` | false | `<redigido>` | não recriar | fever-sync-festival-jun: depende de operação/integração de produção; não copiar nesta etapa. |
| 19 | crm-measure-action-impact | `0 4 * * *` | true | `<redigido>` | não recriar | crm-measure-action-impact: depende de operação/integração de produção; não copiar nesta etapa. |
| 20 | crm-pause-replaced-originals | `0 5 * * *` | true | `<redigido>` | não recriar | crm-pause-replaced-originals: depende de operação/integração de produção; não copiar nesta etapa. |
| 23 | fever-refresh-token | `15 */3 * * *` | false | `<redigido>` | não recriar | fever-refresh-token: depende de operação/integração de produção; não copiar nesta etapa. |
| 25 | whatsapp_dispatcher_minute | `*/5 * * * *` | true | `<redigido>` | não recriar | whatsapp_dispatcher_minute: depende de operação/integração de produção; não copiar nesta etapa. |
| 27 | ticketline-sync-daily | `5 * * * *` | true | `<redigido>` | não recriar | ticketline-sync-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 35 | crm-meta-audiences-daily-sync | `0 4 * * *` | true | `<redigido>` | não recriar | crm-meta-audiences-daily-sync: depende de operação/integração de produção; não copiar nesta etapa. |
| 41 | crm-meta-sync-creatives | `*/3 * * * *` | false | `<redigido>` | não recriar | crm-meta-sync-creatives: depende de operação/integração de produção; não copiar nesta etapa. |
| 42 | crm-google-lead-conversion-enqueue | `*/15 * * * *` | true | `<redigido>` | não recriar | crm-google-lead-conversion-enqueue: depende de operação/integração de produção; não copiar nesta etapa. |
| 43 | crm-google-conversion-upload | `7-59/15 * * * *` | true | `<redigido>` | não recriar | crm-google-conversion-upload: depende de operação/integração de produção; não copiar nesta etapa. |
| 87 | bilheteira-sync-daily | `0 8 * * *` | true | `<redigido>` | não recriar | bilheteira-sync-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 88 | bol-sync-daily | `25 * * * *` | true | `<redigido>` | não recriar | bol-sync-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 89 | vip-coupon-reminder-daily | `30 8 * * *` | true | `<redigido>` | não recriar | vip-coupon-reminder-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 90 | ticketline-capture-day-hourly | `15 * * * *` | true | `<redigido>` | não recriar | ticketline-capture-day-hourly: depende de operação/integração de produção; não copiar nesta etapa. |
| 91 | ticketline-capture-day-seal | `25 0 * * *` | true | `<redigido>` | não recriar | ticketline-capture-day-seal: depende de operação/integração de produção; não copiar nesta etapa. |
| 92 | leads-capi-health | `7 * * * *` | true | `<redigido>` | recriar desligado | Validar public.check_leads_capi_health apenas com dados sintéticos; manter active=false. |
| 93 | crm-meta-insights-hourly | `40 * * * *` | true | `<redigido>` | não recriar | crm-meta-insights-hourly: depende de operação/integração de produção; não copiar nesta etapa. |
| 94 | carreira-suamusica-sync-diario | `0 9 * * *` | true | `<redigido>` | não recriar | carreira-suamusica-sync-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 96 | carreira-instagram-sync-diario | `20 9 * * *` | true | `<redigido>` | não recriar | carreira-instagram-sync-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 97 | carreira-soundcharts-sync-diario | `10 9 * * *` | true | `<redigido>` | não recriar | carreira-soundcharts-sync-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 99 | carreira-song-sync-diario | `40 9 * * *` | true | `<redigido>` | não recriar | carreira-song-sync-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 100 | carreira-shorts-sync-diario | `50 9 * * *` | true | `<redigido>` | não recriar | carreira-shorts-sync-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 101 | carreira-song-report-diario | `0 10 * * *` | true | `<redigido>` | não recriar | carreira-song-report-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 102 | carreira-tiktok-sync-diario | `55 9 * * *` | true | `<redigido>` | não recriar | carreira-tiktok-sync-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 107 | carreira-reference-songs-semanal | `35 9 * * 0` | true | `<redigido>` | não recriar | carreira-reference-songs-semanal: depende de operação/integração de produção; não copiar nesta etapa. |
| 131 | invariant-checks-daily | `10 7 * * *` | true | `<redigido>` | recriar desligado | Validar public.run_invariant_checks_and_log apenas com dados sintéticos; manter active=false. |
| 207 | daily-database-backup | `0 3 * * *` | true | `<redigido>` | não recriar | daily-database-backup: depende de operação/integração de produção; não copiar nesta etapa. |
| 217 | ticketing-sync-health | `45 * * * *` | false | `<redigido>` | recriar desligado | Validar public.check_ticketing_sync_health apenas com dados sintéticos; manter active=false. |
| 241 | crm-meta-campaigns-hourly | `25 * * * *` | true | `<redigido>` | não recriar | crm-meta-campaigns-hourly: depende de operação/integração de produção; não copiar nesta etapa. |
| 242 | crm-google-sync-campaigns-3h | `10 */3 * * *` | true | `<redigido>` | não recriar | crm-google-sync-campaigns-3h: depende de operação/integração de produção; não copiar nesta etapa. |
| 249 | fx-rates-daily | `10 0,16 * * *` | true | `<redigido>` | não recriar | fx-rates-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 261 | carreira-song-report-stale | `*/15 * * * *` | true | `<redigido>` | não recriar | carreira-song-report-stale: depende de operação/integração de produção; não copiar nesta etapa. |
| 262 | cron-purge-run-details | `15 3 * * *` | true | `<redigido>` | recriar desligado | Validar cron-purge-run-details apenas com dados sintéticos; manter active=false. |
| 267 | carreira-tiktok-sync-catalogo-semanal | `10 4 * * 0` | true | `<redigido>` | não recriar | carreira-tiktok-sync-catalogo-semanal: depende de operação/integração de produção; não copiar nesta etapa. |
| 268 | carreira-instagram-sync-catalogo-semanal | `40 4 * * 0` | true | `<redigido>` | não recriar | carreira-instagram-sync-catalogo-semanal: depende de operação/integração de produção; não copiar nesta etapa. |
| 269 | carreira-meta-breakdowns-diario | `20 10 * * *` | true | `<redigido>` | não recriar | carreira-meta-breakdowns-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 270 | carreira-google-breakdowns-diario | `25 10 * * *` | true | `<redigido>` | não recriar | carreira-google-breakdowns-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 276 | crm-google-video-metrics-3h | `20 */3 * * *` | true | `<redigido>` | não recriar | crm-google-video-metrics-3h: depende de operação/integração de produção; não copiar nesta etapa. |
| 300 | ticketline-sync-runs-retention | `20 3 * * *` | true | `<redigido>` | recriar desligado | Validar public.ticketline_sync_runs_compact_audit apenas com dados sintéticos; manter active=false. |
| 301 | traffic-events-anonymize | `40 3 * * *` | true | `<redigido>` | recriar desligado | Validar public.anonymize_traffic_events apenas com dados sintéticos; manter active=false. |
| 305 | meta-creatives-retention | `10 4 * * 0` | true | `<redigido>` | não recriar | meta-creatives-retention: depende de operação/integração de produção; não copiar nesta etapa. |
| 349 | onebox-sync-hourly | `35 * * * *` | true | `<redigido>` | não recriar | onebox-sync-hourly: depende de operação/integração de produção; não copiar nesta etapa. |
| 602 | carreira-tiktok-artists-sync-diario | `40 9 * * *` | true | `<redigido>` | não recriar | carreira-tiktok-artists-sync-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 645 | carreira-tiktok-sounds-daily | `30 9 * * *` | true | `<redigido>` | não recriar | carreira-tiktok-sounds-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 1142 | carreira-s4a-daily-sync | `30 8 * * *` | true | `<redigido>` | não recriar | carreira-s4a-daily-sync: depende de operação/integração de produção; não copiar nesta etapa. |
| 1382 | carreira-youtube-purge-revogados-diario | `0 4 * * *` | true | `<redigido>` | recriar desligado | Validar public.purge_revoked_youtube_data apenas com dados sintéticos; manter active=false. |
| 1640 | ticketline-crosscheck-daily | `50 6 * * *` | true | `<redigido>` | não recriar | ticketline-crosscheck-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 1646 | system-reminders-daily | `30 7 * * *` | true | `<redigido>` | não recriar | system-reminders-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 1805 | carreira-youtube-sync-diario | `5 9 * * *` | true | `<redigido>` | não recriar | carreira-youtube-sync-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 1808 | carreira-youtube-public-diario | `0 7 * * *` | true | `<redigido>` | não recriar | carreira-youtube-public-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 1835 | carreira-s4a-audience-diario | `45 8 * * *` | true | `<redigido>` | não recriar | carreira-s4a-audience-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 1853 | carreira-song-link-health-diario | `30 6 * * *` | true | `<redigido>` | recriar desligado | Validar public.song_link_health_run apenas com dados sintéticos; manter active=false. |
| 1867 | carreira-tiktok-ads-sync | `20 7,13,19 * * *` | true | `<redigido>` | não recriar | carreira-tiktok-ads-sync: depende de operação/integração de produção; não copiar nesta etapa. |
| 1875 | carreira-soundcharts-sync-referencias-diario | `30 9 * * *` | true | `<redigido>` | não recriar | carreira-soundcharts-sync-referencias-diario: depende de operação/integração de produção; não copiar nesta etapa. |
| 2001 | ticketline-capture-ticket-types-daily | `30 6 * * *` | true | `<redigido>` | não recriar | ticketline-capture-ticket-types-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 2068 | portal-error-log-retention | `25 3 * * *` | true | `<redigido>` | recriar desligado | Validar public.purge_portal_error_log apenas com dados sintéticos; manter active=false. |
| 2155 | carreira-instagram-stories-1h | `15 * * * *` | true | `<redigido>` | não recriar | carreira-instagram-stories-1h: depende de operação/integração de produção; não copiar nesta etapa. |
| 2177 | newgang-club-welcome-5m | `*/5 * * * *` | true | `<redigido>` | não recriar | newgang-club-welcome-5m: depende de operação/integração de produção; não copiar nesta etapa. |
| 2189 | carreira-s4a-daily-sync-2030 | `30 20 * * *` | true | `<redigido>` | não recriar | carreira-s4a-daily-sync-2030: depende de operação/integração de produção; não copiar nesta etapa. |
| 2190 | carreira-s4a-audience-diario-2045 | `45 20 * * *` | true | `<redigido>` | não recriar | carreira-s4a-audience-diario-2045: depende de operação/integração de produção; não copiar nesta etapa. |
| 2193 | carreira-spotify-charts-2100 | `0 21 * * *` | true | `<redigido>` | não recriar | carreira-spotify-charts-2100: depende de operação/integração de produção; não copiar nesta etapa. |
| 2197 | carreira-dbip-city-mensal | `20 4 3 * *` | true | `<redigido>` | não recriar | carreira-dbip-city-mensal: depende de operação/integração de produção; não copiar nesta etapa. |
| 2234 | carreira-ads-saldo-12h | `0 0,12 * * *` | true | `<redigido>` | não recriar | carreira-ads-saldo-12h: depende de operação/integração de produção; não copiar nesta etapa. |
| 2235 | carreira-ads-entrega-parada | `0 13,16,20 * * *` | true | `<redigido>` | não recriar | carreira-ads-entrega-parada: depende de operação/integração de produção; não copiar nesta etapa. |
| 2256 | newgang-portal-quente | `*/4 * * * *` | true | `<redigido>` | não recriar | newgang-portal-quente: depende de operação/integração de produção; não copiar nesta etapa. |
| 2281 | newgang-wallet-sync | `*/10 * * * *` | true | `<redigido>` | não recriar | newgang-wallet-sync: depende de operação/integração de produção; não copiar nesta etapa. |
| 2398 | crm-ingest-lead-captures | `*/5 * * * *` | true | `<redigido>` | recriar desligado | Validar public.crm_ingest_lead_captures apenas com dados sintéticos; manter active=false. |
| 2494 | coala-eb27-audience-sync | `30 4 * * *` | true | `<redigido>` | não recriar | coala-eb27-audience-sync: depende de operação/integração de produção; não copiar nesta etapa. |
| 2499 | ng27-clube-audience-sync | `35 4 * * *` | true | `<redigido>` | não recriar | ng27-clube-audience-sync: depende de operação/integração de produção; não copiar nesta etapa. |
| 4667 | ugc_watchdog_1400 | `0 14 * * *` | true | `<redigido>` | não recriar | ugc_watchdog_1400: depende de operação/integração de produção; não copiar nesta etapa. |
| 4668 | ugc_watchdog_2000 | `0 20 * * *` | true | `<redigido>` | não recriar | ugc_watchdog_2000: depende de operação/integração de produção; não copiar nesta etapa. |
| 7110 | artist-ads-refresh-twice-daily | `0 1,15 * * *` | true | `<redigido>` | não recriar | artist-ads-refresh-twice-daily: depende de operação/integração de produção; não copiar nesta etapa. |
| 7111 | artist-ads-hourly-retention | `0 4 * * *` | true | `<redigido>` | recriar desligado | Validar artist-ads-hourly-retention apenas com dados sintéticos; manter active=false. |
| 7243 | song-link-arrivals-hourly-reconcile | `20 4 * * *` | true | `<redigido>` | recriar desligado | Validar public.song_link_arrivals_hourly_reconcile apenas com dados sintéticos; manter active=false. |

## G5 — nomes, nunca valores

Fonte: SELECT name FROM vault.secrets, 24/10/2026 **14:08:49.659267 UTC**, 14 nomes. Valores não consultados. Qualquer credencial real fica excluída; se uma integração hoje excluída vier a ser testada, usar mock ou credencial sandbox exclusiva com autorização futura.

| Nome | Destino | Finalidade / razão |
|---|---|---|
| `bol_master` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `email_queue_service_role_key` | precisa de valor de teste | Chave exclusiva do futuro projecto de teste; fila sem entregas externas. |
| `fever_b2b_token_coala_2026` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `fever_credentials_coala_2026` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `IPINFO_TOKEN` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `META_CAPI_ACCESS_TOKEN` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `META_WA_PHONE_NUMBER_ID` | precisa de valor de teste | Identificador de número sandbox, se futuramente autorizado; nunca o número real. |
| `META_WA_SYSTEM_TOKEN` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `ticketline_3def1b85-0ed0-4166-b45d-3a4561564e15` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `ticketline_4fca2381-1db9-4ff5-9dc0-91068de88a02` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `ticketline_56e431e8-adcc-4f87-99fd-545c9bb1aefa` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `ticketline_95051bc2-8580-405c-a1ad-f2526ddf9bd4` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `ticketline_fdfb39fe-45f2-43f5-9ec9-7cb536360ae1` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |
| `ticketline_master` | não entra na homologação | Credencial de produção; integração desactivada ou simulada. Não copiar o valor existente. |

### Nomes das edge functions — a preencher por Pedro

Pedro: colar abaixo **só os nomes dos segredos** apresentados no painel Lovable. Não colar valores, tokens, capturas que mostrem valores ou ficheiros .env. Secção deliberadamente vazia; G5 permanece vermelho até este inventário ser revisto.

<!-- Pedro: apenas nomes, um por linha. -->

## Resposta à revisão do Claude

1. Concordo: PGlite não mede drift válido; não usado como prova G1/G2. O novo run é nativo, mas incompleto por falha SQL comprovada.
2. Concordo: Actions removeu o bloqueio do runtime local sem criar projecto remoto. Workflow executado e artefactos preservados.
3. Concordo: manual/ não é sequência; excluído integralmente, incluindo propostas e rollbacks. Promoções exigem prova individual e não aconteceram neste fecho.
4. Esclarecido com contraprova à hipótese de redundância: histórico/hash e colunas exclusivas de 0238 demonstram caminho Drizzle aplicado. Lacunas históricas IDs 17/165 explicitadas.
5. Risco revisto com prova: nenhum CONCURRENTLY em supabase/migrations; ocorrência em proposta manual excluída. Falha observada é 23503, não 25001.
6. Concordo: retenção de assets/12 diferenças de tamanho e infra.json histórico não são gates desta etapa; ficam nas frentes anteriores, sem reescrever o laboratório.

## Fecho e retoma

Entregues workflow, replay nativo com falha identificada, seis catálogos locais, comparação parcial, prova Drizzle, proposta dos 81 crons e classificação dos 14 nomes. **Pendentes: G1 completo/lista fechada, G2 integral, G3 e nomes edge em G5.** A falha SQL impede avançar dentro da regra de não editar/ignorar migrações; revisão do Claude deve tratar primeiro o DML histórico dependente de dados. Não se pede nem presume Sim de R2. G6 continua com Pedro.

Sem projecto/conta criado, contratação, DDL/DML Live, deploy ou Publish; somente SELECT Live e execução efémera no runner. Nenhuma alteração ao laboratório. #352 permanece aberta; reserva libertada no fecho e estado da plataforma actualizado. Evidências permanentes nos três anexos deste directório; logs originais do Actions têm a retenção indicada acima.
