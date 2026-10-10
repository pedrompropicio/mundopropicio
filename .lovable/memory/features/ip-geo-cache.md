---
name: Cache de geo por IP (ipinfo)
description: #254 — ipinfo nunca se chama sem passar por public.ip_geo_cache (TTL 30d); geo-backfill para linhas com IP e sem país
type: feature
---

REGRA: o ipinfo nunca se chama sem passar pela cache. Único ponto: `lookupIpGeo` em
`supabase/functions/_shared/geo.ts` (usado por geo-lookup e song-link-event — mexer
ali obriga a reimplantar as duas, e também geo-backfill).

- `public.ip_geo_cache` (ip PK, country, city, region, resolved_at): só service_role;
  RLS ligada sem policies; anon recebe 42501.
- Hit fresco (<30d) → não toca no ipinfo. Miss → ipinfo + upsert, também com
  country null (não martelar IPs que o ipinfo não resolve). Erro HTTP do ipinfo
  (ex.: 429) não se guarda. Falha da tabela → fail-soft.
- `geo-backfill` (verify_jwt=true, só service_role): redirect_log + lead_capture,
  7 dias, ip_inet preenchido e geo_country null, 200 por tabela. Default dry_run=TRUE —
  quem chamar tem de mandar `{"dry_run":false}`.
- crm.google_click não guarda IP; fica de fora.
- 10/10/2026: os "sem geo" do redirect_log (335/1.676) e lead_capture (54/187) são
  todos linhas SEM IP — o backfill não as consegue encher (1.ª corrida: 0 candidatos).
