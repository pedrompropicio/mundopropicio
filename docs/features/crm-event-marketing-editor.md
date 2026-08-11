# Editor de marketing do evento (CRM)

Componente: `src/pages/crm-admin/eventos/EventMarketingEditor.tsx`
Rota: `/crm/eventos/:eventId`
Tabela: `public.event_marketing` (1:1 com `events`, upsert por `event_id`)
Fluxo de guardar: rascunho (`draft`) ↔ publicado (`published`, com `published_at`). Botão "Guardar" persiste sem alterar estado; botão "Publicar / Despublicar" alterna `status` e guarda.

## Tabs

- **Gestão** — campos do evento (parceria, ticketing, portal visible/featured).
- **Hero** — hook PT/EN, descrição longa PT/EN.
- **Média** — imagens (hero, OG, poster vertical, galeria) + **vídeo** + **música** (novos).
- **Experiências** — repetidor de experiências de bilhete (novo).
- **CTA & Urgência**, **Imprensa & Performer**, **Oferta**, **SEO**.

## Campos de média novos (tab "Média")

| Campo UI | Coluna BD | Tipo | Notas |
| --- | --- | --- | --- |
| Vídeo / Trailer (URL) | `hero_video_url` | `text` | Aceita YouTube ou Vimeo. Opcional. |
| Música (Spotify ou YouTube) | `music_embed_url` | `text` | Link de partilha do artista/álbum/playlist. Opcional. |

Persistência via o mesmo `upsert` do resto do formulário — respeita draft/published.

## Experiências de bilhete (tab "Experiências")

Coluna `ticket_experiences` (`jsonb`) — array de objetos com **estas quatro chaves exatas**:

```json
[
  {
    "title_pt": "VIP",
    "title_en": "VIP",
    "description_pt": "Acesso antecipado, meet & greet e zona reservada.",
    "description_en": "Early access, meet & greet and reserved area."
  }
]
```

Conteúdo de marketing curado: descreve o que cada bilhete inclui. **Não tem preço** — o preço continua a viver na bilheteira (`event_ticket_lots` / `event_ticket_types`).

UI: repetidor com adicionar, remover, reordenar (↑ / ↓). Validação: nenhum campo obrigatório do lado cliente; gravado tal como editado.

## Exposição pública

As 3 colunas estão expostas em `public.events_public` (view) e são consumidas pelo portal `mundopropicio.com`.

## Classificação etária (tab "Oferta")

| Campo UI | Coluna BD | Tipo | Notas |
| --- | --- | --- | --- |
| Classificação etária | `age_rating` | `text` | Texto livre curto (ex.: "M/16", "M/12", "Para todos os públicos"). Opcional. Exposto em `public.events_public`. |
