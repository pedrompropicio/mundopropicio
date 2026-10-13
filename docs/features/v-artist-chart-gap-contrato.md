# Contrato — v_artist_chart_gap (cartão "Distância ao chart", chat 3)

Uma linha por artist_id × song_id × country (BR|PT) × chart_date. Só existe quando há streams S4A do país E o chart desse dia já foi recolhido.

| campo | tipo | significado |
| artist_id, song_id | uuid | artista / música |
| country | text | 'BR' ou 'PT' |
| chart_date | date | dia do chart = metric_date do S4A |
| top100_streams | bigint | streams da posição #100 do chart diário |
| top200_streams | bigint | streams da posição #200 |
| artist_best_position | int nulo | melhor posição da faixa nesse dia (null = fora do Top 200) |
| artist_streams_s4a | numeric | streams do dia no país (s4a_streams_day_br/_pt) |
| gap_top200 / gap_top100 | numeric | quanto falta para o limiar (0 se já lá está) |

Leitura: `supabase.from('v_artist_chart_gap').select('*').eq('artist_id', id).eq('song_id', s).order('chart_date', {ascending:false}).limit(10)`.
Acesso: RLS do artista (área songs), através de artist_song_metrics_daily. A faixa é ligada pelo artist_song_identifiers.external_id (platform spotify).
Actualização: diária às 21:00 UTC (dia D-1). O dia mais recente do S4A pode ainda não ter chart; nesse caso não há linha.
Avisos: os streams do chart são os da contagem pública do Spotify e os do S4A são os do artista. Podem diferir ligeiramente para a mesma faixa.
