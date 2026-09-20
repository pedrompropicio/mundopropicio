---
name: Retenção de identificadores de tráfego (180 dias)
description: anonymize_traffic_events + cron traffic-events-anonymize anulam IP/UA/fbc/fbp/gclid após 180 dias sem apagar linhas (#75, D-ERP115)
type: feature
---

`public.anonymize_traffic_events(_days integer default 180)` (SECURITY DEFINER, só
`service_role`, devolve `leads_anonymized` + `gclicks_anonymized`):

- `public.leads` com `kind='redirect_click'`: `ip_inet`, `user_agent`, `fbc`, `fbp`,
  `mp_click_id` → NULL
- `crm.google_click`: `gclid`, `gbraid`, `wbraid`, `user_agent` → NULL (não tem `ip_inet`)

Linhas NUNCA são apagadas; datas, evento, UTMs, país e região ficam. Cron
`traffic-events-anonymize` às 03:40 UTC. Primeira execução (20/09/2026): (0, 0).
Ver D-ERP115 em docs/DECISIONS.md.
