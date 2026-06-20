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
- **Convenção: nome completo em português** — NÃO usar ISO (`'PT'`/`'BR'`) nem `'Brazil'`.

## Mapa ISO → nome (`src/lib/country.ts`)
`companies.country` guarda ISO (`'PT'`, `'BR'`). `cities.country` guarda nome. Helper único:
- `countryIsoToName('PT')` → `'Portugal'`
- `countryIsoToName('BR')` → `'Brasil'`
- Qualquer outro → `null` (fallback: mostrar todas as cidades, não partir o seletor).
- `formatCityLabel(name, state)` → `"Fortaleza - CE"` se há state, senão `"Fortaleza"`.

## Filtro por país (`src/components/CityVenueSelector.tsx`)
- Lê empresa ativa via `useCompany()`, mapeia ISO→nome, filtra `cities` por `country = nome`.
- Empresa PT só vê cidades PT; empresa BR só vê cidades BR. Sem empresa/ISO desconhecido → mostra todas.
- Dropdown renderiza com `formatCityLabel` (UF visível só para BR).

## Fix `handleCreateCity`
- Bug anterior: insert sem `country` → caía no DEFAULT `'Portugal'` mesmo em BR.
- Agora: insere `country = countryIsoToName(company.country) ?? 'Portugal'`.
- Em BR é mostrado um input extra de UF (2 letras, obrigatório); grava em `state`. Em PT mantém-se o fluxo original (sem UF).
- Após criar, a cidade respeita o filtro de país (aparece para a empresa que a criou).

## Sítios que usam `formatCityLabel` para mostrar UF
- `src/pages/Events.tsx` (citiesMap em cards de evento)
- `src/components/EventEditModal.tsx` (citiesMap → `events.location`)
- `src/pages/EventCalendar.tsx` (reservations panel)
- `src/components/calendar/VenueReservationModal.tsx` (cityOptions)

## Storage no evento
- `events.city_id uuid` (FK lógica para `cities.id`) — inalterado. Nada de texto livre.
