# Ajustes S4A — contrato para Gestão Artística

## Validação histórica
Vista read-only artist_song_playlist_daily; não altera linhas históricas.
diário(D)=janela28(D)−janela28(D−1)+diário(D−28).
Pré-lançamento=0; sem snapshot/predecessor/seed=null; negativo contraditório=null; sem interpolação.
Real1day tem prioridade; depois do primeiro real por playlist, lacuna não volta a estimativa.

Radio mudou de chave name:Radio para spotify:playlist:radio. A vista liga apenas essa identidade especial de Spotify sem URI à atual, sem alteração dos registos.
23/10: 274.939−241.241+2.936=36.634; 2.936=30.775−27.839 no dia25/09, D−28. Real1day dry_run=36.634. Desvio absoluto0; percentual0,00%, PASS ±3%.
10–20/10:null (sementes/snapshots ausentes);21/10:37.469;22/10:33.432;23/10:36.634. Etiqueta estimado em valores derivados, não preencher lacunas.

## Classificação persistida nas próximas capturas
playlist_kind: algorithmic | algotorial | editorial | listener; nullable no histórico.
1. isAlgorithmic=true, ou identidade Spotify e Radio/Mixes/Daily Mix/Descobertas da Semana/Radar de Novidades => algorithmic. Exemplo Radio, URI especial spotify:playlist:radio.
2. isAlgotorial=true => algotorial. Exemplo sintético: Editorial personalizada, author Spotify, isAlgorithmic=false,isAlgotorial=true.
3. author=Spotify, sem regras anteriores => editorial. Exemplo pisa e sofre ou This Is Synthetic.
4. Restantes => listener. Exemplo sintético Minha seleção, author nãoSpotify, flagsfalse.
Se ambas flagstrue, algorithmic prioritário. Não classificar playlist de ouvinte pelo título Radio. Históricos sem flags não se tornam editoriais por suposição; permanecem desconhecidos.

## RPC e tipos JSON reais
RPC principal EXISTENTE: artist_ads_compare(p_artist_id:uuid,p_from:date,p_to:date,p_country:text,p_tz:text) -> jsonb.
Novas secções mantêm os campos antigos intactos. Outra RPC: artist_song_play_origins_compare(p_artist_id:uuid,p_from:date,p_to:date) -> musica_daily diretamente.
Período máximo62dias; musica_daily últimos14dias desse intervalo. Acesso canónico songs; se negado: {available:false,reason:'songs_access_required'}, sem impedir tráfego.

```typescript
type PlaylistCoverage = 'unavailable' | 'incomplete_missing_seed_or_snapshot'
  | 's4a_top100_estimated_28day' | 's4a_top100_1day';
type OriginColumn = 'radio' | 'other_algorithmic' | 'editorial' | 'algotorial' | 'listener_playlists';
type MusicDay = {
  song_id: string; title: string; day: string; s4a_until: string | null;
  spotify_total: number | null; radio: number | null; radio_pct: number | null;
  other_algorithmic: number | null; editorial: number | null; algotorial: number | null;
  listener_playlists: number | null; other_spotify: number | null; rest: number | null;
  estimated: boolean | null;
  estimated_fields: Partial<Record<OriginColumn, boolean | null>>;
  source_categories: Record<string, number>; playlist_coverage: PlaylistCoverage;
  ugc_total: number | null; ugc_new: number | null;
  ugc_days_covered: number | null; ugc_previous_capture_day: string | null;
  ugc_source: 'ios_shortcut'; ugc_precision: 'centena'; ugc_capture_missing: boolean;
  ugc_drop: boolean;
  apify_total: number | null; apify_new: number | null; apify_drop: boolean;
  sound_count: number | null; same_sounds: boolean | null; same_sources: boolean | null;
};
type MusicDaily = {available: true; source_origin_capture_enabled: false;
  scope: 'global_song_not_ad_country'; playlist_note: string; estimated: boolean; days: MusicDay[]}
  | {available: false; reason: 'songs_access_required'};
type TrafficDay = {day: string; platform: string; currency: string | null;
  gasto: number | null; chegadas: number; custo_por_chegada: number | null};
// artist_ads_compare: {...keysAntigas, musica_daily: MusicDaily, trafego_diario: TrafficDay[]}
```

Spotify/UGC globais, não repartir por país/plataforma. Join de apresentação por day+song_id para música e day+platform+currency para tráfego; não multiplicar/somar música por cada plataforma. Custo da chegada já calculado pelo servidor por plataforma/moeda; não usar chegadas globais com gasto Meta. Valores null não são zero. Rest só se toda cobertura de playlists for conhecida e diferença não negativa. Top100 nunca equivale a todas as origens. source_categories permanece vazio: endpoint bloqueado, flagfalse.

## Ficheiros Gestão Artística a alterar pelo agente desse projeto
- src/lib/comparativa.ts: tipos acima e parser defensivo de musica_daily/trafego_diario preservando null.
- src/lib/comparativa-consulta.ts: consumir o mesmo RPC e intervalo, sem segunda fórmula de custos.
- src/components/trafego/VisaoComparativa.tsx: linha diária com gasto/chegadas/app-open existente e Spotify/Rádio/%/outrasalgorítmicas/editorial/algotorial/ouvintes/resto/publicações iOS/novas/dias cobertos; etiquetas estimado e dadosS4AatéD, precisão: centena. Dia iOS ausente vazio e assinalado; alerta principal só ugc_drop. Sons acompanhados, Apify em coluna secundária, nunca substitui iOS.
- src/lib/comparativa-compare.test.ts: parser das novas séries, null/real/estimado, custo por plataforma/moeda, música não duplicada.
- src/lib/comparativa.test.ts: regressão do card que antes combinava chegadas globais e gastoMeta.
Não foi alterado código desse projeto nem feito Publish.

## Provas e limites
Correção Pedro25/10 12:09: ugc_total/ugc_new agora exclusivamente metric=ugc_videos,source=ios_shortcut,platform=tiktok. Usa última captura válida por dia (captured_at/id), diferença à última data com captura, mesmo fora do intervalo visível; ugc_days_covered indica extensão e não divide a diferença. Nunca interpolar ou transportar total para dia sem captura. Apify tem campos próprios; apify_drop é nota técnica, não alerta principal. Não limita UGC à dataS4A: cada fonte mantém seu dia.
Leituras iOS confirmadas:20/10=17.500;24/10=19.300;23/10=18.800, portanto24/10 novas500 cobrindo1dia.19/10 iOS=17.300 acima de18/10=16.200: nenhum alerta principal por quedaApify19/10.
Migração0244 só substitui a função de leitura; sem alteração a capturas/histórico/edgefunctions/Publish. Testes PostgreSQL sintéticos incluem17.500→19.300 em4dias com lacunas vazias, quedaApify sem alertaiOS e quedaiOS−300.
Validação final correçãoUGC: suite2.500PASS,6skip/11todo mantidos; RPC autenticadoHTTP200.13/10=13.600,+1.400 cobrindo3dias desde10/10;11/10 vazio apesar de Apify5.324.24/10=19.300,+500/1dia,Apify6.234.19/10 ugc_drop=false e apify_drop=true. Frontend ainda não alterado aqui.
34 testes focados PASS; Deno check limpo. RPC autenticado HTTP200,28linhas e novos campos presentes. OPTIONS200/auth inválida401 após deploy somente s4a-daily-sync.
Suite inicial2497PASS/1falha: índice memória não regenerado; corrigido pelo gerador. Resultado da repetição registado na conversa. Verificação automática inclui typecheck e build; tsgo manual/CI remoto não executados.
Sem escrita de captura real, backfill, alteração ao smartlink ou Publish. Reversão de código não reverte dados recolhidos depois; recuperação exige autorização própria.