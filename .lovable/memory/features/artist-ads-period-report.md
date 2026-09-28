---
name: Relatório de tráfego pago por período + metas
description: artist_ads_period_report (jsonb, contrato fixo com chat 3), artist_ads_campaign_goals, edge artist-ads-period-analysis, pixel TikTok manual
type: feature
---
- Contrato jsonb fixo (chat 3). Null ≠ 0. Alcance nunca somado.
- Resultado por objetivo: views_6s / chegada_smart_link (song_link_events arrival por utm) / visitas_perfil→cliques_link (sem action nos insights) / impressoes (CPM).
- Meta: plano (resumo.meta) > artist_ads_campaign_goals (valido_desde ≤ fim).
- Prova 01–28/09 Litto: Meta 3.075,31; Google 3.036,89; TikTok 816,91; total 6.929,11 BRL.
- TikTok manual: view_content/button_click opcionais, nunca 0 inventado.
- Detalhe em docs/DECISIONS.md D-ERP147.
