---
name: Teste A/B botão iPhone smart link
description: ios-btn-v1 — 7 dias desde o deploy, só iOS, ?ab=A|B forçado fora da taxa
type: feature
---
- Duração: 7 dias a contar do deploy da song-link-event (janela fixa no código, preenchida no deploy).
- Sorteio estável por ip_hash, só iOS, 50/50. A = página atual; B = botão Spotify grande/fixo no topo.
- ?ab=A|B força a variante para teste manual e grava A_forcado/B_forcado (fora da consulta da taxa).
- Android e payloads Meta/TikTok inalterados. SQL e deploy só com "Sim"/OK do Pedro.
- Janela reiniciada na publicação da página B: 2026-10-25T22:07:00Z a 2026-11-01T22:07:00Z (UTC).
- Consulta da taxa de toque:
  arrivals WHERE event='arrival' AND os='ios' AND created_at >= '2026-10-25T22:07:00Z' AND created_at < '2026-11-01T22:07:00Z'
  AND ab_variant IN ('A','B') AND coalesce(utm_content,'') NOT LIKE 'teste_%';
  toque = existe choice com arrival_event_id = arrival.event_id.
