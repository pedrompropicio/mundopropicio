---
name: Geo-lookup leads & cliques
description: Edge function geo-lookup + colunas geo_country/city/region em redirect_log/lead_capture/leads para estatísticas de origem geográfica (por IP)
type: feature
---

# Geo-lookup de leads e cliques

## Objetivo
Permitir estatísticas por país/cidade/região dos leads (newsletter, interesse
em evento) e dos cliques de redirect no portal mundopropicio.com.

## Arquitetura
1. Portal (mundopropicio.com), após consentimento, chama `GET /functions/v1/geo-lookup`
   sem corpo. A função lê o IP dos headers (`x-forwarded-for` → `x-real-ip` →
   `cf-connecting-ip`), consulta `ipinfo.io` e devolve `{ ip, country, city, region }`.
2. Portal grava `ip_inet` + `geo_country/city/region` no insert em
   `public.redirect_log` ou `public.lead_capture`.
3. Os cron-batches `process_redirect_logs_batch` e `process_lead_captures_batch`
   (SECURITY DEFINER) copiam esses 4 campos para `public.leads` ao criar a linha
   correspondente.

## Colunas novas (text)
`geo_country` (ISO-2, ex. "PT", "BR"), `geo_city`, `geo_region` — em:
- `public.redirect_log`
- `public.lead_capture`
- `public.leads`

## Edge function `geo-lookup`
- `verify_jwt = false` (público); CORS com Origin allowlist
  (`mundopropicio.com`, `www.mundopropicio.com`, `propicio-stage-portal.lovable.app`
  + previews `*--26b95793-...lovable.app`).
- Só método `GET`. Não escreve em BD.
- IPs privados/reservados (10/8, 127/8, 192.168/16, 172.16/12, 169.254/16, ::1,
  fc00::/7) e IPs vazios/invalidos → devolve nulls com status 200 (degradação suave).
- Token via `IPINFO_TOKEN` no Vault. Lê com fallback `Deno.env` → `get_vault_secret`
  (mesmo padrão da `capi-meta-events`, porque neste projeto edge functions não
  acedem a secrets diretamente).
- Qualquer falha de rede/parse → nulls com 200 (o portal nunca falha por isto).
- Logs nunca registam o IP completo — só país e booleans.

## Dependência
Secret `IPINFO_TOKEN` no Vault (já existente).

## Notas de fiabilidade
- **País**: fiável (>95%) mesmo em tráfego móvel.
- **Cidade/região**: pouco fiável em tráfego móvel (devolve a cidade do gateway
  da operadora, não a do utilizador). Em desktop/Wi-Fi residencial a precisão
  é razoável. Usar com este caveat nos dashboards.
