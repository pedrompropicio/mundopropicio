# Tour multi-cidade — herança do marketing

## Regra do Portal

Uma cidade de tour (evento com `parent_event_id != null`) HERDA da mãe cada campo de marketing que estiver vazio no filho. O portal público resolve por `child ?? mother` campo-a-campo, para os campos de conteúdo do `event_marketing` (não para campos próprios da cidade: `title`, `location`, `date`, `slug`, `ticketing_url`, `vip_coupon_*`).

## Indicação no editor (MP CRM)

Ficheiro: `src/pages/crm-admin/eventos/EventMarketingEditor.tsx`.

Quando o evento aberto tem `parent_event_id != null`:

1. Faz-se uma query extra ao `event_marketing` da mãe (`crm-event-marketing-mother`) + `events` (nome/slug).
2. **Banner informativo** (azul/muted) no topo, acima das tabs: «Conteúdo herdado do tour «{mãe}». Preenche aqui só o que for diferente desta cidade; o que deixares vazio usa o da mãe.» + link "Editar a mãe →" para `/crm/eventos/{parent_event_id}`.
3. **Placeholders herdados** nos campos vazios, prefixados com `Herdado: `. Cobre: `hook_pt/en`, `description_long_pt/en`, `meta_description_pt/en`, `hero_video_url`, `cta_primary_label_pt/en`, `urgency_message_pt/en`, `press_quote_pt/en`, `press_quote_source`, `performer_name`, `performer_url`, `offer_price_min/max`.
4. Para os **ImageUploader** (`hero_image_url`, `og_image_url`, `poster_vertical_url`) e para o `MultiImageUploader` da `gallery_urls`, quando o filho está vazio e a mãe tem valor mostra-se o hint "Herdado da mãe" (o placeholder gráfico do uploader não permite preview inline).
5. Se o campo da mãe também estiver vazio, o placeholder normal do campo prevalece.

Nada muda na lógica de save nem no toggle "Visível no portal". Eventos sem `parent_event_id` não veem banner nem placeholders herdados.

## Ver também

- `docs/features/crm-copy-tour-content.md` — copiar/conferir criativos do tour.
