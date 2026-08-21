---
name: Dashboard pago unificado (Meta + Google)
description: /audience/dashboard agrega Meta e Google na mesma tabela via platform="meta"|"google"; regras de moeda, métricas ausentes e meta de ROAS por evento
type: feature
---

Fase 3B do redesenho do MP Audience.

- Fonte única: `crm.meta_*_insights_daily` + `crm.google_campaign_insights_daily`, normalizados para `CampaignRow`/`InsightRow` com `platform: "meta" | "google"` (`src/lib/crm/google-queries.ts`). `aggregate()` serve as duas.
- Filtro de plataforma (Todas · Meta · Google) manda em KPIs, gráficos, funil, cards por evento e tabela. Cor: `--chart-1` Meta, `--chart-2` Google — nunca sozinha, sempre com o nome em texto.
- Métricas que o Google não fornece (alcance, frequência, cliques únicos, ViewContent, AddToCart, InitiateCheckout) mostram "—", NUNCA zero. Controlado pelas flags `has*` do `Aggregate`.
- `computeUniqueCtr` = cliques únicos ÷ **alcance** (definição do Meta); agregado é aproximado porque `reachSum` não é deduplicado.
- CTR é sempre **fracção** nas duas plataformas (o sync Google não multiplica por 100).
- Consolidação por evento (Meta · Google · Consolidado) só soma quando as moedas coincidem; moedas diferentes nunca são convertidas.
- Meta de ROAS vem de `public.events.target_roas`; NULL ⇒ fallback `DEFAULT_TARGET_ROAS` (8x). Editável no card do evento.
- Frescura por plataforma no cabeçalho (max `last_synced_at`); >48h fica em alerta com nº de dias. "Sincronizar agora" corre Meta + Google.
- Acções (pausar/activar, editar, drill-down de conjuntos, IA, testar funil) são só Meta; linhas Google são acompanhamento.
- A aba "Campanhas" da página `/audience/google-ads` foi removida (duplicava o dashboard e tinha EUR fixo); a página fica só com Conversões offline.
