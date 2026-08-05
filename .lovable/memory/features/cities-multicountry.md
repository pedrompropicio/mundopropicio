---
name: Cities multi-country
description: Coluna state (UF) em cities, filtro por país via empresa ativa, mapa ISO→nome, fix handleCreateCity
type: feature
---
# Cidades multi-país

## Schema
- `public.cities`: schema mínimo (`id`, `name`, `country` NOT NULL default `'Portugal'`, `created_at`) + nova coluna **`state text NULL`** (UF de 2 letras; null para Portugal).
- Índice `cities_country_idx (country)` para o filtro do seletor.
- Índice único `cities_country_name_state_uniq (country, lower(name), coalesce(state,''))` previne duplicados.

## Valores guardados em `cities.country`
- `'Portugal'` (existente, 31 cidades).
- `'Brasil'` (semeado: 25 capitais + Campinas, Ribeirão Preto, Uberlândia).
- `'Espanha'` (semeado 2026-08: só **Madrid**, state NULL — tour Mágicos Henry e Klaus da Mundo Propício PT).
- **Convenção: nome completo em português** — NÃO usar ISO (`'PT'`/`'BR'`/`'ES'`) nem `'Brazil'`/`'Spain'`.

## Mapa ISO → nome (`src/lib/country.ts`)
`companies.country` guarda ISO (`'PT'`, `'BR'`, `'ES'`). `cities.country` guarda nome. Helper único:
- `countryIsoToName('PT'|'BR'|'ES')` → `'Portugal'|'Brasil'|'Espanha'`
- Qualquer outro → `null` (fallback: mostrar todas as cidades, não partir o seletor).
- `KNOWN_COUNTRY_NAMES` = `['Portugal','Brasil','Espanha']` — usado no select de país ao criar cidade estrangeira.
- `formatCityLabel(name, state)` → `"Fortaleza - CE"` se há state, senão `"Fortaleza"`.

## Seletor de local (`src/components/CityVenueSelector.tsx`) — redesenho 2026-08
- **Sem toggle**: o antigo checkbox "Mostrar cidades de outros países" foi REMOVIDO. O combobox pesquisa SEMPRE em todas as cidades (queryKey fixa `["cities","all"]`, filtro/ordenação client-side).
- Ordem no dropdown: primeiro as cidades do país da empresa ativa (`useCompany` → `countryIsoToName`) sem heading; depois as estrangeiras agrupadas por país (`group` = nome do país) e etiquetadas `"Madrid · Espanha"`.
- Pesquisa tolerante a acentos sobre nome + estado + país (`searchText`).
- **Criação dentro do dropdown**: `SearchableSelect` ganhou props `onCreateOption` + `createLabel`; quando o texto pesquisado não bate exatamente com o nome-base de nenhuma opção, aparece no rodapé "➕ Criar cidade '<texto>'…". Clicar abre um pequeno Dialog que pede só o país (`KNOWN_COUNTRY_NAMES`) e a UF se for Brasil. Ao confirmar: insert; se colidir com o índice único, seleciona a existente (nunca duplica).
- Sala/Local: mesmo padrão — combobox das salas da cidade selecionada + rodapé "➕ Criar sala '<texto>'…" (insert com `city_id`; `company_id` fica pelo default `current_company_id()`).
- Os formulários paralelos de criação (botão `+` / `showNewCity` / `showNewVenue`) foram REMOVIDOS — eram a causa do utilizador ficar preso no form de criação em vez da lista.
- Props públicas inalteradas (`cityId`, `venueId`, `onCityChange`, `onVenueChange`, `compact`) — usos em `Events.tsx`, `AddSubEventModal.tsx`, `EventEditModal.tsx` intactos.
- Eventos em cidades estrangeiras são suportados: `events.city_id` aceita qualquer cidade. **Isto é só o seletor de local** — nada fiscal/IVA/moeda muda; invariante D1 mantém-se. Não confundir com a Fase 8 multi-país (quarentena).

## Criação de cidade (`handleCreateCity`)
- O país é sempre explícito no diálogo (default = país da empresa ativa) — nunca cai no DEFAULT `'Portugal'` por omissão.
- `'Brasil'` exige UF (2 letras) → grava em `state`; outros países `state` NULL.
- Erro de insert = provável colisão do índice único → procura `country + ilike(name) + state` e seleciona a existente.


## Sítios que usam `formatCityLabel` para mostrar UF
- `src/pages/Events.tsx` (citiesMap em cards de evento)
- `src/components/EventEditModal.tsx` (citiesMap → `events.location`)
- `src/pages/EventCalendar.tsx` (reservations panel)
- `src/components/calendar/VenueReservationModal.tsx` (cityOptions)

## Storage no evento
- `events.city_id uuid` (FK lógica para `cities.id`) — inalterado. Nada de texto livre.

## Seed Espanha (2026-08)
- 14 cidades ES (Madrid, Barcelona, Valência, Sevilha, Bilbau, Málaga, Saragoça, Granada, A Corunha, Alicante, Múrcia, Palma de Maiorca, Vigo, San Sebastián), `state` NULL.
- 21 salas em `venues` associadas à empresa Mundo Propício (`venues.company_id` é NOT NULL com default `current_company_id()` — em seeds SQL passar o company_id explícito).
- Salas são visíveis só à empresa dona (RLS multi-tenant).
