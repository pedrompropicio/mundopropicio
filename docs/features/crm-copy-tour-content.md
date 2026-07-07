# Copiar conteúdo entre cidades de um tour (CRM)

Componente: `src/pages/crm-admin/eventos/CopyTourContentDialog.tsx`
Usado em: `EventMarketingEditor` (header, ao lado do botão Publicar).

## Quando aparece

Só para eventos que fazem parte de um tour:
- Evento com `parent_event_id != null` (é uma cidade-filha), OU
- Evento com `event_type = 'multi_day'` (é a mãe do tour).

Caso contrário, o botão não é renderizado.

## Fluxo

1. `tourParentId = event.parent_event_id ?? event.id`.
2. Query `events` por `parent_event_id = tourParentId`, ordenada por `date`, excluindo o próprio `event.id`.
3. Diálogo mostra:
   - Aviso claro de que **SOBRESCREVE** o destino.
   - 3 checkboxes de conteúdo (todos ON por defeito): Marketing, FAQ, Line-up.
   - Lista de cidades-destino com checkboxes (todas ON por defeito).
4. Ação: `supabase.rpc('copy_event_tour_content', { p_source, p_targets, p_include_marketing, p_include_faqs, p_include_lineup })`.
5. Toast com contadores devolvidos (`targets`, `marketing_rows`, `faq_rows`, `lineup_rows`) e invalida `["crm-eventos-list"]` + `["crm-event-marketing"]`.

## RPC

`copy_event_tour_content(p_source uuid, p_targets uuid[], p_include_marketing bool, p_include_faqs bool, p_include_lineup bool) returns jsonb` — já em Live.

Copia `event_marketing` + `event_faqs` + `event_lineups` da origem para os destinos, sobrescrevendo.
**Não toca** em campos próprios do evento (data, venue, ticketing, slug, portal_visible, etc.).

## Guard

Botão desabilitado se não houver destinos selecionados ou se todos os tipos de conteúdo estiverem OFF.
