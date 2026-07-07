# Copiar conteúdo entre cidades de um tour (CRM)

Componentes:
- `src/pages/crm-admin/eventos/CopyTourContentDialog.tsx` — copiar (escrita).
- `src/pages/crm-admin/eventos/TourCreativesAudit.tsx` — conferir criativos (só leitura).

Usados no header do `EventMarketingEditor`, ao lado do botão Publicar.

## Quando aparecem

Só para eventos que fazem parte de um tour:
- Evento com `parent_event_id != null` (cidade-filha), OU
- Evento com `event_type = 'multi_day'` (mãe do tour).

## Copiar — fluxo

1. `tourParentId = event.parent_event_id ?? event.id`.
2. Query `events` por `parent_event_id = tourParentId`, ordenada por `date`, excluindo o próprio `event.id`.
3. Diálogo mostra:
   - Aviso de que **SOBRESCREVE** apenas os campos selecionados no destino (o resto é preservado).
   - 4 checkboxes de conteúdo (todos ON por defeito):
     - **Textos de marketing** → `p_include_text` (hook, descrição, SEO, oferta, CTAs, experiências, urgência, press quote, performer, música…).
     - **Criativos** → `p_include_creatives` (`hero_image_url`, `poster_vertical_url`, `og_image_url`, `hero_video_url`, `gallery_urls`).
     - **FAQ** → `p_include_faqs`.
     - **Line-up** → `p_include_lineup`.
   - Lista de cidades-destino com checkboxes (todas ON por defeito).
   - **Aviso de datas**: se "Criativos" estiver ON e houver destinos selecionados com `date` diferente da origem, bloco amarelo lista as cidades e alerta que arte com data gravada ficará errada. Informativo, não bloqueia.
4. RPC: `supabase.rpc('copy_event_tour_content', { p_source, p_targets, p_include_text, p_include_creatives, p_include_faqs, p_include_lineup })`.
5. Toast com contadores (`targets`, `marketing_rows`, `faq_rows`, `lineup_rows`); invalida `["crm-eventos-list"]` + `["crm-event-marketing"]`.

## RPC

`copy_event_tour_content(p_source uuid, p_targets uuid[], p_include_text bool, p_include_creatives bool, p_include_faqs bool, p_include_lineup bool) returns jsonb`.

Cópia campo-a-campo no `event_marketing`: texto e criativos são grupos independentes. Substitui integralmente `event_faqs` / `event_lineups` da origem quando incluídos.
**Não toca** em campos próprios do evento (data, venue, ticketing, slug, portal_visible, etc.).

## Guard

Botão "Copiar" desabilitado se não houver destinos selecionados ou se nenhum dos 4 tipos estiver ON.

## Conferir criativos do tour — painel

Botão "Conferir criativos do tour" abre um diálogo só de leitura que:

1. Lê `events` (`id, name, date, poster_image_url, hero_image_url`) e `event_marketing` (`hero_image_url, poster_vertical_url, og_image_url, hero_video_url`) de todas as cidades do tour.
2. Agrupa por `(campo, url)` não-nulo. Um URL usado por 2+ cidades cujas `date` são diferentes é sinalizado como possível criativo com data errada.
3. Mostra cada conflito com: nome do campo, URL (clicável, truncado) e lista `cidade (data)`.
4. Verde "Sem conflitos" se tudo bater certo.

Não escreve nada — serve para o utilizador identificar o que precisa de re-upload por cidade.
