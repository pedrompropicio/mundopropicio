# Portal — MVP Página Individual de Evento

**Versão:** 2 (28/05/2026) — ajustes de referências de schema (`date` em vez de `start_date`, `ticketing_url` em vez de `ticket_url`)
**Estado:** Especificação · Implementação após migração de stack
**Filosofia:** B (rica) com escopo médio
**Objectivo:** Página objectivamente melhor que a da bilheteira, capturando lead + sinal de pixel antes do redirect

---

## 1. Rota e estrutura

### URL canónica

```
https://www.mundopropicio.com/eventos/{slug}
```

Exemplo: `https://www.mundopropicio.com/eventos/anitta-eda-2026`

Bilingue: o idioma é gerido por language toggle global (PT/EN), não na URL. Conteúdo serve `_pt` ou `_en` consoante o contexto activo, com fallback para `name` (campo legacy) quando `title_pt`/`title_en` não estão preenchidos.

### Rota legacy a manter

`https://www.mundopropicio.com/bilhetes/{slug}` — redirector existente, mantido sem alterações lógicas. O botão "Comprar bilhete" da página individual aponta para esta rota com `mp_click_id` injectado. O redirector regista a passagem em `public.redirect_log` (processado para `public.leads` com `kind='redirect_click'`).

## 2. Estrutura da página (top to bottom)

### A. Hero
- **Imagem hero** (full-width, ~70vh em desktop, ~50vh em mobile) — `events_public.hero_image_url`
- Sobre a imagem: título do evento, data formatada, localização, countdown se faltar < 60 dias
- CTA primário: **"Comprar bilhete"** (botão dourado, redirect para `/bilhetes/{slug}?mp_click_id=...`)
- CTA secundário: **"Avisar-me sobre este evento"** (apenas se evento futuro sem `ticketing_url`, ou se utilizador ainda não tem bilhete)

### B. Descrição rica
- `description_pt` / `description_en` em prosa
- Tipografia gerosa, ~700px max-width, alto contraste
- Suporta markdown básico (negrito, itálico, parágrafos)

### C. Line-up (se houver)
- Grid de artistas (`event_lineups_public`)
- Cada artista: foto, nome, palco/horário se aplicável
- Hover/tap → modal com bio

### D. FAQ específica
- Accordion com perguntas de `event_faqs_public`
- Agrupado por categoria (acessos, idade, bagagem, food, etc.)
- 5-10 perguntas típicas

### E. Localização
- Bloco com nome do local, endereço completo
- Mapa embed (Google Maps ou similar com `venue_map_url`)
- Link "Como chegar" (`venue_directions_url`)

### F. Imprensa (opcional, se houver clippings)
- Carrossel com clippings de imprensa (`event_press_public`)
- Logos das publicações + link para artigo original

### G. Lead capture inline
- Form: "Quer estar a par dos próximos eventos como este?"
- Campos: nome, email, opt-in WhatsApp opcional (com telefone)
- Submit escreve em `public.lead_capture` com `event_slug` para tagging
- Processador (edge function) consolida em `public.contacts` + insert em `public.leads` com `kind='event_interest'`

### H. Outros eventos relacionados
- 3 cards de outros eventos futuros
- Lógica: mesmo "tipo" (música, humor, etc.) ou mesma localização

### I. Footer global

## 3. Open Graph e SEO dinâmicos

### Por que isto importa

A migração para TanStack Start (Lovable modern) habilita SSR. Cada página é renderizada server-side ANTES de chegar ao crawler. Isto resolve:

- Crawler do Facebook/WhatsApp lê og:image específico do evento
- Crawler do Google indexa conteúdo da página, não só o shell vazio
- Core Web Vitals melhoram (LCP, FID, CLS)
- Meta CPM melhora porque landing page experience score sobe

### Tags por página de evento

```html
<title>{title_pt} — Mundo Propício</title>
<meta name="description" content="{description_pt[:160]}" />

<meta property="og:type" content="event" />
<meta property="og:title" content="{title_pt}" />
<meta property="og:description" content="{description_pt[:300]}" />
<meta property="og:image" content="{poster_image_url}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="https://www.mundopropicio.com/eventos/{slug}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{title_pt}" />
<meta name="twitter:description" content="{description_pt[:200]}" />
<meta name="twitter:image" content="{poster_image_url}" />

<!-- Schema.org structured data para Google -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "{title_pt}",
  "startDate": "{date_iso}",
  "location": {
    "@type": "Place",
    "name": "{location_pt}",
    "address": "..."
  },
  "image": "{poster_image_url}",
  "description": "{description_pt}",
  "offers": {
    "@type": "Offer",
    "url": "https://www.mundopropicio.com/eventos/{slug}",
    "availability": "https://schema.org/InStock"
  }
}
</script>
```

**Nota:** o campo `date` em `public.events` é `DATE` (não `timestamptz`). Para `startDate` ISO, usar `{date}T20:00:00+00:00` ou semelhante (assumir hora padrão de início, ou adicionar campo `start_time` se preciso). Para eventos multi-dia, considerar `event_dates_public` para min/max.

### Open Graph image

`poster_image_url` deve ser **versão 1200×630** do cartaz, optimizada para partilha social. Não usar imagem hero (geralmente 16:9 ou wider; corta mal no preview).

Se `poster_image_url` não existir no DB, fallback para imagem default da MP (logo dourado sobre fundo escuro com nome do evento sobreposto via canvas/CDN).

## 4. Eventos de pixel Meta

Disparados client-side na página, complementados por CAPI server-side via edge function quando possível.

### Standard events

| Evento | Quando | Parâmetros |
|---|---|---|
| `PageView` | Carregamento de qualquer página | — |
| `ViewContent` | Carregamento da página de evento | `content_ids: [event_id]`, `content_name: title_pt`, `content_category: 'event'`, `value: price_avg?`, `currency: 'EUR'` |
| `Lead` | Submit do form de lead capture | `content_name: 'event_interest'`, `content_ids: [event_id]` |
| `InitiateCheckout` | Clique no botão "Comprar bilhete", ANTES do redirect | `content_ids: [event_id]`, `content_name: title_pt`, `value: price_avg?`, `currency: 'EUR'` |

### Server-side (CAPI) via edge function

Cada `Lead` e `InitiateCheckout` é duplicado via CAPI com `event_id` único para dedup. Edge function `capi-meta-events` recebe os mesmos eventos do client + IP + user agent + email/phone hashed quando disponível (via `contacts.email_hash_sha256`/`phone_hash_sha256`, que estão pre-computados), e envia para Meta com match quality máximo.

Isto resolve a perda de sinal causada por iOS 14+, ad blockers, e cookie restrictions.

### Reconciliação futura com purchases

Quando bilheteira expuser webhook ou relatório de vendas, `mp_click_id` permite ligar lead → click → purchase. Para já, `mp_click_id` é gerado no botão "Comprar bilhete" e logged em `public.leads`, mas reconciliação fica para Fase 4 (fora do MVP).

## 5. UX detalhes que importam

- **Performance:** SSR com cache CDN. LCP < 2.5s, CLS < 0.1.
- **Mobile-first:** maioria do tráfego pago Meta cai em mobile. Hero, botões, forms devem ser perfeitos em ~380px.
- **Botão Comprar bilhete:** sticky em mobile (fixo no bottom da viewport) após scroll de ~30% da página. Não pode desaparecer.
- **Lead capture:** sem fricção. Email obrigatório, resto opcional. Submit assíncrono, success state imediato.
- **Loading states:** skeleton screens em vez de spinners. Loja de Anitta a abrir não é momento para o utilizador ver "Loading...".
- **Idioma:** lembrar last selected via localStorage. Default PT se vier de tráfego PT, EN caso contrário (detectar via Accept-Language).

## 6. Backoffice — gerir os campos novos

A página `/admin` actual no projecto Lovable do site gere uma tabela `events` simples (do Supabase antigo). Após Fase 2 (repointing), tem de ser reescrita para:

- Operar contra `public.events` no central via edge function `admin-update-event` (com `SECURITY DEFINER` validando role `admin`/`editor` no enum `app_role`)
- Gerir hero image / poster image (upload Storage central)
- CRUD de `public.event_lineups`
- CRUD de `public.event_faqs`
- CRUD de press clippings
- Editar venue_map_url / venue_directions_url
- Toggle `portal_visible` / `portal_featured`
- Editar campos bilingues `title_pt/en`, `description_pt/en`, `location_pt/en`

Decisão: o `/admin` do site mantém-se como hoje (mesma URL, mesma UX), mas estendido e a falar com o central. Não migra para o MP Gestão Eventos já. Quando o MP CRM ganhar UI de gestão de portal (Fase posterior), aí sim consolida-se.

## 7. O que NÃO entra no MVP

- Conta de utilizador / login de fã
- Wishlist / alertas de pré-venda
- Comentários ou ratings
- Blog conectado a eventos individuais
- Compra integrada (continua redirect para bilheteira)
- Multilíngua além de PT/EN
- Checkout próprio
- Loja de merchandising
- Reconciliação automática lead→purchase (depende de webhooks de bilheteiras)

## 8. Métricas de sucesso

Após 30 dias com MVP no ar, validar:

- **CTR `/eventos/{slug}` → `/bilhetes/{slug}`:** baseline ≥ 25% (utilizadores que chegam à página e clicam comprar)
- **Lead capture rate:** baseline ≥ 5% das visitas únicas
- **Bounce rate:** < 60%
- **Time on page médio:** > 60s
- **CPM Meta na campanha de tráfego para `/eventos/{slug}`** vs. CPM em `/bilhetes/{slug}` directo: esperado ≥ 20% menor (landing page experience score)
- **og:image preview correcto:** 100% das partilhas mostram cartaz do evento, não logo genérico
