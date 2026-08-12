---
name: Bilheteira sync (portal)
description: Varredura diária das páginas públicas de bilheteira (Ticketline/BOL) que atualiza event_marketing.ticket_lots e offer_price_min, com guardrail de nunca marcar esgotado
type: feature
---

## O que é

Edge function `bilheteira-sync` (v1, 2026-08-12). Cron diário **08:00 UTC = 09:00 Europe/Lisbon**
(`bilheteira-sync-daily`). Lê as páginas **públicas** das bilheteiras e atualiza a régua editorial
de lotes do portal.

Elegibilidade: `events.portal_visible=true`, `date >= hoje`, `ticketing_url` preenchido e
`event_marketing.lots_locked=false`. `lots_locked=true` → curadoria 100% manual, automação
não toca.

## Parsers (`_shared/bilheteira-parsers.ts`)

Roteador por `events.ticketing_provider` com fallback pelo domínio do URL.

- **ticketline** — se o `ticketing_url` não for `/sessao/`, segue o 1º link `/sessao/` da página do
  evento. Na página "Escolha de lugares" os dados vêm de `data-zone-info` (JSON por zona:
  `name`, `seats_available`, `seats_price.total_amount` = **preço base**) cruzado com a lista
  `#venueZonesList` (nome com capitalização correta, `class="… soldout"`, e o preço base entre
  parênteses `(45,00€)` — o valor grande é com taxas).
- **bol** — página de Sectores; cada sector vem em `data-sector` JSON
  (`"Sector:"`, `"Preço:":[{"P":"209,00€"}]`, ou `"Disponibilidade:":"Lotacão Esgotada"`).

Zonas de **mobilidade condicionada / visibilidade reduzida / acompanhante** são ignoradas para
lotes e preço mínimo (`IGNORE_ZONE_RE`).

## Regras de escrita

- `offer_price_min` = menor preço **base** entre zonas disponíveis não-ignoradas.
- `ticket_lots` = `{label_pt,label_en,price,status}`: lotes anteriores ao maior "Lote N"
  disponível entram como `esgotado` sem preço (`"1º Lote"`); zonas com lote entram como
  `"2º Lote — Bancada"` `a_venda`; zonas sem lote entram com o próprio nome; zonas esgotadas
  individualmente entram como `esgotado`.
- **REGRA CRÍTICA — nunca marcar esgotado automaticamente:** se nenhuma zona relevante estiver
  disponível, não escreve nada (nem `offer_availability`, nem `ticket_lots`) e loga
  `changes.possible_soldout=true`. Motivo: falso "esgotado" da Ivete lido da página pública em
  2026-08-12 — o custo de um falso esgotado é venda parada.
- Em dúvida (HTML inesperado, sem zonas, preço 0 ou > 5000 €) → não escreve, loga erro.
- `offer_availability` **nunca** é alterado pela automação na v1.

## Auditoria

Tabela `public.bilheteira_sync_log` (`event_id, run_at, provider, url, parse_ok, raw_summary,
changes, error`). SELECT só admin/platform_admin; escrita só service_role. É a única fonte de
auditoria da v1 — **sem notificações WhatsApp** (fica para v2).

## Auth

`verify_jwt` default do projeto (não listada em `config.toml`); validação em código: service_role
(env ou JWT do Vault, via `jwtRole()`) ou JWT de utilizador com role admin/platform_admin.
Aceita `{ eventId?, dryRun?, triggeredBy? }`.
