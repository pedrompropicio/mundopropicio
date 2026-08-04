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

## Filtro por país (`src/components/CityVenueSelector.tsx`)
- Por defeito: lê empresa ativa via `useCompany()`, mapeia ISO→nome, filtra `cities` por `country = nome`.
- Empresa PT só vê cidades PT; empresa BR só vê BR. Sem empresa/ISO desconhecido → mostra todas.
- **Toggle "Mostrar cidades de outros países"** (checkbox discreto abaixo do select, só visível se há país da empresa): quando ativo remove o filtro e etiqueta as cidades estrangeiras como `"Madrid · Espanha"` (as nacionais ficam sem sufixo).
- Eventos em cidades estrangeiras são suportados: `events.city_id` aceita qualquer cidade. **Isto é só o seletor de local** — nada fiscal/IVA/moeda muda; invariante D1 (país do dinheiro = país da empresa) mantém-se. Não confundir com a Fase 8 multi-país (quarentena).

## Fix `handleCreateCity`
- Bug anterior: insert sem `country` → caía no DEFAULT `'Portugal'` mesmo em BR.
- Sem toggle: insere `country = countryIsoToName(company.country) ?? 'Portugal'` (comportamento intacto).
- Com toggle ativo: aparece um select de país (`KNOWN_COUNTRY_NAMES`) e a cidade é criada nesse país.
- Se o país efetivo for `'Brasil'` é mostrado input extra de UF (2 letras, obrigatório) → grava em `state`. Outros países: `state` NULL.


## Sítios que usam `formatCityLabel` para mostrar UF
- `src/pages/Events.tsx` (citiesMap em cards de evento)
- `src/components/EventEditModal.tsx` (citiesMap → `events.location`)
- `src/pages/EventCalendar.tsx` (reservations panel)
- `src/components/calendar/VenueReservationModal.tsx` (cityOptions)

## Storage no evento
- `events.city_id uuid` (FK lógica para `cities.id`) — inalterado. Nada de texto livre.
