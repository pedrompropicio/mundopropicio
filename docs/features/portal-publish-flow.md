# Publicar / Despublicar evento no Portal (MP CRM)

## Onde vive o controlo

Editor de evento do MP CRM — tab **Gestão**:
- Ficheiro: `src/pages/crm-admin/eventos/EventMarketingEditor.tsx` (componente `GestaoTab`).
- Rota: `/crm/eventos/:eventId`.

O toggle **Visível no portal** aplica-se **imediatamente** (não depende do botão "Guardar gestão"). O toggle **Destacado na homepage** continua a gravar no save genérico (UPDATE plano a `events.portal_featured`).

## RPCs usadas

Ambas em `public`, chamadas via `supabase.rpc(...)` do cliente (SECURITY INVOKER — respeitam a RLS de quem clica).

### `publish_event_to_portal(p_event_id uuid)`
- Gera `slug` se estiver vazio; **nunca** sobrescreve um slug já preenchido.
- Liga `events.portal_visible = true`.
- Se `event_type = 'multi_day'`, faz **cascata** para todas as cidades-filhas (`parent_event_id = p_event_id`).
- Devolve `setof { id, name, slug, portal_visible }` — 1 linha para o evento-mãe + N para as filhas.

### `unpublish_event_from_portal(p_event_id uuid)`
- Coloca `events.portal_visible = false` (mantém `slug`).
- Cascata análoga para cidades-filhas em turnês.
- Devolve `setof { id, name, portal_visible }`.

## Fluxo no cliente

1. `useMutation` `publishToggle` decide `publish_*` ou `unpublish_*` conforme o novo valor do Switch.
2. Toast (`sonner`) no sucesso:
   - Publicar: mostra "Publicado no portal" + acção "Abrir" com `https://www.mundopropicio.com/pt/eventos/{slug}`. Em turnês acrescenta `+N cidades`.
   - Despublicar: "Despublicado do portal" (+N cidades em turnês).
3. Invalida as queries:
   - `["crm-event", eventId]`
   - `["crm-event-marketing", eventId]`
   - `["crm-eventos-list"]`
4. Erro → `toast.error("Falha: …")`.

## O que **não** mudou

- `portal_featured`, `ticketing_url`, `location`, `vip_coupon_*`, `venue_map_url`, etc. — continuam a gravar via UPDATE no botão "Guardar gestão".
- Permissões: RPCs `SECURITY INVOKER`; quem já podia mexer no Switch antigo continua a poder.
- Slug editável no editor: comportamento inalterado. A RPC só preenche quando está vazio.

## Testar

1. Evento simples (não multi_day) sem slug → ligar o Switch → toast com "Ver no portal" já com slug gerado; `events.portal_visible=true`, `slug` preenchido.
2. Mesmo evento → desligar → toast "Despublicado"; `portal_visible=false`, `slug` mantém-se.
3. Turnê (`event_type='multi_day'`) com N cidades-filhas → ligar → toast "+N cidades"; verificar que todas as filhas ficam `portal_visible=true`.
4. Turnê → desligar → toast "+N cidades"; todas as filhas voltam a `false`.
5. Slug já preenchido à mão → publicar não sobrescreve.
6. Falha de permissão (utilizador sem role) → toast de erro; estado local não muda.
