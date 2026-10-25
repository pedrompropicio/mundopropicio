---
name: Chegada SSR dos smart links
description: D-ERP234; autenticação partilhada, prefetch só diagnóstico e unicidade antes de Meta/TikTok
type: feature
---
- D-ERP234, decisão Pedro 10/10/2026: SSR do Portal regista arrival porque muitas visitas Meta não executam JavaScript.
- POST song-link-event sem Origin, x-song-link-ssr-key = SONG_LINK_SSR_KEY; secret ausente/errado dá 401 sem escrita. Pedro configura o mesmo valor nos dois projectos; nunca gerar o segredo por ele.
- SSR usa client_ip/client_ua, guarda origin ssr; browser guarda browser. event_id é gerado no servidor e reutilizado no browser.
- Adenda D-ERP234 (Pedro): client_ip ausente, null ou inválido nunca recusa SSR autenticada; gravar sem ip_hash/geo, enviar Meta/TikTok sem IP e console.warn com o motivo (sem valor). client_ua vazio é aceite e classificado other. Validação SSR obrigatória: event_id, event e tipos ssr/prefetch; sem DDL.
- Prefetch/bots: só song_link_diag kind prefetch, detail purpose ou bot cortado a 60 caracteres; sem eventos nem Meta/TikTok.
- Claim atómico com índice parcial event_id/event desde 10/10/2026 UTC ANTES de enviar. Duplicado não reenvia; browser pode completar cookie em falta. Duplicados históricos anteriores não se apagam.
- Relatórios de período, estatísticas e saúde contam arrival das duas origens; não acrescentar filtros só browser.
- Provas SSR válida, browser após SSR e prefetch autenticado dependem do segredo. Estado de entrega não se infere de testes unitários.- Adenda 2 (11/10/2026): browser com event_id já gravado por SSR faz UPDATE da linha (opened/destination/mode se null; in_app/device/os do browser); nunca event_id/origin/created_at/ip_hash/geo/utm; sem reenvio CAPI/TikTok; diag kind redirect detail ssr_enrich.
- Adenda 3 (11/10/2026): log "[song-link-event] req" por pedido; duplicado sem linha do link grava com event_id novo sem reentrega; beacon sem Origin aceite se o Referer for do Portal. A perda rs-meta está a montante (Portal), não na função.
- Adenda 4 (11/10/2026): portal-track aceita kind song_link_client_fail (consent false, sem IP/UA) e grava em song_link_diag kind redirect, detail client_fail:<reason>; reasons válidos: send_failed, left_before_confirm; slug obrigatório, in_app cortado a 40.
- Adenda 4 (13/10/2026): geo da chegada = client_geo do SSR (CDN do Portal) → cache ip_hash 24 h (ip_geo_cache "h:<hash>") → ipinfo limitado (20/min, pausa 15 min após 429). Nunca ipinfo pedido a pedido. Browser preenche país em falta na linha SSR.
- Adenda (25/10/2026, Pedro): app_open e choice com arrival_event_id herdam exclusivamente fbclid/ttclid da chegada do mesmo link. Meta fbc = fb.1.<created_at da chegada em ms>.<fbclid>; TikTok recebe ttclid herdado. Linha app_open nova copia ambos os IDs. IP, UA, fbp, external_id e page_url continuam a vir do pedido atual; não guardar novos sinais pessoais nem alterar D-ERP171/234, consentimento, slots ou IDs de deduplicação. Sem backfill/reenvio histórico. Sem chegada válida, a resolução de click IDs devolve ausência: choice mantém o envio sem IDs; app_open mantém a guarda SSR existente (chegada inválida → 403), sem afrouxar autenticação/vínculo.
