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

## portal-track (#254)
REGRA: o IP de redirect_log/lead_capture captura-se no servidor via `portal-track`; o cliente nunca envia ip/geo.
- Edge function pública (`verify_jwt=false`, ABERTA por desenho), allowlist de Origin = molde geo-lookup (mundopropicio.com, coalafestival.pt, previews dos 2 portais); fora da lista → 403.
- POST text/plain (sendBeacon, sem preflight) ou application/json. Corpo `{kind:"redirect"|"lead", consent:boolean, payload}`; kind desconhecido → 400.
- payload redirect: event_slug, fbc, fbp, utm_source/medium/campaign/content, client_event_id, user_agent, referrer, destination_url.
- payload lead: name, email, phone, consent_email, consent_whatsapp, event_slug, source, utm_*, fbc, fbp, user_agent, client_event_id, raw.
- ip_inet/geo_* do corpo ignorados sempre. consent=true → 1.º IP do x-forwarded-for, isPrivateOrInvalid, lookupIpGeo (cache). consent=false → linha sem IP nem geo.
- Strings truncadas; client_event_id não-UUID descartado. Insert service role (Prefer: return=minimal); 200 {ok:true} / 500 {ok:false}.
- O gateway põe o IP real à frente no x-forwarded-for: um XFF forjado pelo cliente não passa.
- INSERT anon das duas tabelas mantém-se durante a transição do portal.
