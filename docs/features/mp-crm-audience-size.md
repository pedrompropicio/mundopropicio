# Dimensão real dos públicos Meta (MP CRM)

Ecrã: `/crm/meta-audiences` → `src/pages/crm-admin/meta-audiences/MetaAudiencesList.tsx`.
Pertence ao **MP CRM** (contactos, leads, públicos). O schema `crm.*` é do MP Audience (campanhas) — não usar o nome do schema para decidir módulo.

## Backend
`supabase/functions/crm-meta-list-audiences/index.ts` (BUILD_VERSION `list-audiences-v2`):
- Para cada público, GET `/act_{id}/delivery_estimate?optimization_goal=REACH&targeting_spec={geo PT + custom_audiences:[id]}`.
- Grava em `filters.delivery_estimate = { lower, upper, checked_at, error }`. **Sem alterações de schema.**
- `total_records_meta` mantém-se (vem dos `approximate_count_*`, que a Meta já devolve a 20/-1 para públicos de site — não é fiável).
- Body opcional: `only_audience_ids: string[]` (só processa/escreve esses) e `skip_estimates: true` (só listar).
- Throttle 120ms, teto ~50s; devolve `estimated`, `estimate_errors`, `pending_estimates`. Idempotente — correr de novo até `pending_estimates = 0`.

## Frontend
Colunas: Nome (+ Meta ID), Tipo (subtype traduzido), **Dimensão** (número ou intervalo `lower – upper`, "—" se não houver), Estado de entrega (`filters.delivery_status.description`; `code = 300` → "demasiado pequeno"), Local/Meta, Sync, Última leitura (`delivery_estimate.checked_at`).
Ordenação por dimensão desc, pesquisa por nome, botão "Sincronizar da Meta".
`crm_meta_audiences_dashboard` não devolve `filters` → query direta a `meta_custom_audiences (id, filters)`.

## Validado 27/08/2026
- `120255378777320595` (Semelhante 1% ticketline): 67.300 – 79.200
- `120253192020230595` ([SITE] Visitantes 30D Ivete Clareou): 2.300 – 2.700 (antes: 20)
