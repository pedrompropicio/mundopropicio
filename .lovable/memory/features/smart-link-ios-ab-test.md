---
name: Teste A/B botão iPhone smart link
description: ios-btn-v1 — 7 dias desde o deploy, só iOS, ?ab=A|B forçado fora da taxa
type: feature
---
- Duração: 7 dias a contar do deploy da song-link-event (janela fixa no código, preenchida no deploy).
- Sorteio estável por ip_hash, só iOS, 50/50. A = página atual; B = botão Spotify grande/fixo no topo.
- ?ab=A|B força a variante para teste manual e grava A_forcado/B_forcado (fora da consulta da taxa).
- Android e payloads Meta/TikTok inalterados. SQL e deploy só com "Sim"/OK do Pedro.
