---
name: MP Audience — Page/Instagram reconcile no Atualizar
description: Reconciliação automática de selected_instagram_id quando IG é ligado à Page DEPOIS da 1ª conexão Meta
type: feature
---

## Bug original
`crm.ad_platform_connections.selected_instagram_id` ficava NULL quando o Instagram Business era associado à Page no Meta **depois** da conexão/seleção inicial. `Atualizar` e `Reconectar` em /crm/connections não resolviam — só uma re-seleção manual da Page chamava `handleSelectPage`, que é o único sítio que gravava `selected_instagram_id`.

Caso real Live: Siriguella (company `f0f21410-…`), Page 106895597787, IG 17841401190947957 — `selected_instagram_id=NULL` apesar do IG existir na Page.

## Fix
`src/pages/crm/Connections.tsx` → `fetchPagesInternal`: após receber pages de `crm-meta-fetch-pages` (que já devolve `instagram_business_account{id,username}`), se houver `selected_page_id`, comparar IG retornado com `selected_instagram_id` gravado e fazer `UPDATE` se diferente. Aplica-se a:
1. Clique manual em **Atualizar** (silent=false) — toast confirma associação.
2. Auto-hidratação silenciosa em `useEffect` ao carregar a página (silent=true) — resolve transparentemente após **Reconectar** ou primeira visita pós-mudança no Meta.

`null→id`, `id→outro id` e `id→null` (caso o IG seja desassociado) são todos reconciliados.

## Invariante
`crm-meta-fetch-pages` é a fonte de verdade para o vínculo Page↔IG. `selected_instagram_id` na conexão é apenas cache — qualquer leitura recente das pages deve reconciliar.
