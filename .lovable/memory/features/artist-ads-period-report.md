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

## Desempenho (29/09)
- Chegadas ao smart link: agrupar song_link_events por (utm_source, utm_campaign) num CTE `MATERIALIZED` ANTES de comparar com cada campanha. Sem MATERIALIZED o planner empurra o filtro com artist_ads_campaign_key para o seq scan e repete-o por campanha (8,3 s → 48 ms).
- fx_convert: uma chamada por linha diária (não duas).
