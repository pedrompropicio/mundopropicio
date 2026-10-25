---
name: Carreira — origens Spotify e vídeos com o som
description: Captura diária S4A comprovada; categorias de origem desligadas; comparação por dia sem falsos zeros
type: feature
---
# Adenda 25/10/2026

Lidos D-ERP67/140/160/172, `s4a-daily-sync`, a cadeia `_shared/s4a.ts` e a comparação existente. Fontes e janelas não são intercambiáveis.

## Captura
- D vem de `s4x-insights-api/v1/meta/latest-date`; prova de 25/10: D=2026-10-23.
- Endpoint comprovado: `song-stats-view/v2/artist/{artist}/recording/{track}/top-playlists?time-filter=1day|7day|28day`. Provas autenticadas: HTTP 200 para as três janelas; 100 itens em 1day e 7day. Rádio: 36.634 / 152.489 / 274.939 respetivamente.
- `s4a-daily-sync` recolhe agora 1day e 28day em próximas corridas reais; `period_days=1|28`, snapshot D. 7day é apenas sonda em dry_run. Identidade URI, fallback título, máximo 100; duplicados conservam o maior valor, com nota.
- `dry_run` continua verdadeiro por omissão; não grava métricas/playlists. A cadeia existente pode renovar tokens e mantém o registo técnico `sync_runs`. Não é uma operação sem qualquer efeito de infraestrutura.
- Formas novas só devolvidas em dry_run, `formas.top_playlists.1day|7day`. Valores do preview diário também apenas no dry_run. Não registar tokens.
- Origem por categoria ainda NÃO implementada: não há endpoint observado comprovado. `SOURCE_ORIGIN_CAPTURE_ENABLED=false`, resposta `endpoint_unverified`. A flag não disfarça um parser fictício. É necessária a forma de um pedido real da página S4A para implementar categorias; depois, autorização própria para ligar escrita.
- Não há reenvio, backfill ou alteração ao smart link/D-ERP171/234. Dados 1day lidos em dry_run não foram gravados no histórico.

## Derivação
- `estimateDaily` implementa diário(D)=janela28(D)−janela28(D−1)+diário(D−28).
- Antes do lançamento, diário=0. Snapshot, predecessor ou semente D−28 em falta resulta em null. Não interpolar, promediar, inventar semente nem converter null para zero.
- Valor negativo contraditório fica null. A janela top-100 pode mudar de composição; uma diferença não prova contribuição diária de todo Spotify.
- Como 1day existe, não foi criada uma vista estimada. A função pura está testada para eventual derivação; o histórico sem base comprovada permanece indisponível.

## Comparação
- Migração `0241_s4a_daily_compare.sql`, aplicada: `artist_song_play_origins_compare` lê os últimos 14 dias do período com acesso canónico `artist_access_check(...,'songs')`; anon sem EXECUTE, authenticated/service_role autorizados após guarda.
- `artist_ads_compare` mantém todos os CTEs de gasto/chegadas e keys anteriores. Acrescenta `trafego_diario` (dia/plataforma/moeda/gasto/chegadas/custo_por_chegada) e `musica_daily`. Sem acesso a músicas, tráfego continua e a secção devolve `available=false,songs_access_required`.
- `musica_daily.days`: song_id/title/day/s4a_until/spotify_total/radio/radio_pct/other_spotify/listener_playlists/rest/source_categories/playlist_coverage/ugc_total/ugc_new/sound_count/ugc_drop/same_sounds/same_sources.
- Spotify/UGC são globais da música, não divididos pelo país das campanhas. Data da música é o dia fornecido pela fonte; tráfego usa o fuso escolhido na comparação.
- Playlists só por 1day efetivamente armazenado; sem leitura, campos null. `rest` é total menos top-100 observado, inclui playlists não listadas e outras origens; NÃO é a categoria «outras» do S4A. Categoria ausente no top-100 não prova ausência global de plays.
- UGC delta é diferença de dias consecutivos, signed; não atravessa um dia ausente. Uma queda alerta, mas nunca prova remoção de vídeos. Mesmo nº de sons não basta: comparar IDs e fontes.
- Evidência 18→19/10: 6.350→5.746, −604, 29/29 sons nos dois dias, mesmo ator `dzN8Pp8yxmp9Jzzyd`, precisão completa. Som principal 5.377→4.851 (−526). Prova de contagem menor devolvida; remoções ou versão do ator não demonstradas.

## Frontend proprietário
- O ecrã vive no projeto Gestão Artística, não no ERP. Snapshot apenas de leitura neste ambiente. Não criar um segundo ecrã aqui.
- Integrar no projeto proprietário: `src/lib/comparativa.ts`, `src/lib/comparativa-consulta.ts`, `src/components/trafego/VisaoComparativa.tsx` e testes correspondentes. Consumir as novas séries do mesmo RPC; não recalcular rácios de plataformas com denominadores globais.
- Pendente: colunas na mesma linha diária, etiquetas de cobertura/data, alerta UGC e correção do card de custo (atualmente chega de todas as plataformas com custo Meta). Nenhuma alteração visual foi aplicada; Publish continua pendente.

## Provas
- Baseline 2.464 PASS; final 2.485 PASS, 6 skip e 11 todo mantidos. 21 testes novos incluindo PostgreSQL local com a migração integral e fixtures sintéticas.
- Deno check limpo; verificação automática build OK. tsgo manual não executado por restrição do ambiente; CI remoto não verificado.
- Deploy apenas s4a-daily-sync; dry_run Litto HTTP 200, OPTIONS 200, autorização inválida 401. RPCs lidos com sessão real HTTP 200; 37 linhas tráfego diário e 28 linhas música (duas músicas ×14 dias). Nenhuma captura real disparada.
- Reverter código não desfaz as capturas feitas entretanto; recuperação de dados só com autorização própria.