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
- Provas SSR válida, browser após SSR e prefetch autenticado dependem do segredo. Estado de entrega não se infere de testes unitários.