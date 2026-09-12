---
name: Event settlements (Apuramentos)
description: Fundação dos Apuramentos por evento — event_settlements + event_settlement_participants, modos settles/nominal, casa implícita e espelho temporário de event_partners
type: feature
---

# Apuramentos por evento (épica #146, sub-tarefa (a) — 12/09/2026)

## Modelo

`public.event_settlements` — um apuramento por nó:

- `event_id`, `company_id` (isolamento multi-tenant), `name`, `position`
- `parent_id` (NULL = raiz; **índice único parcial** garante uma raiz por evento)
- `parent_share_pct` + `parent_share_basis` (`net_result` | `net_result_gross_expenses`) — obrigatórios nos filhos, proibidos na raiz (CHECK)
- selo: `is_sealed`, `sealed_bp_version_id`, `sealed_at`, `sealed_by`

`public.event_settlement_participants` — quem participa em cada apuramento:

- `participant_kind` `house` | `partner` (`house` sem `supplier_id`, `partner` com — CHECK)
- `event_partner_id` → `event_partners(id)` **ON DELETE CASCADE** (com SET NULL o participante espelhado ficava órfão: o vínculo era limpo antes de o trigger AFTER DELETE correr)
- `mode` `settles` (é pago) | `nominal` (aparece mas não acerta)
- `profit_pct`, `loss_pct` (NULL = igual ao lucro), `expense_includes_iva` (NULL = herda o evento)
- `can_order`, `can_pay`, `visible_in_docs`, `notes`
- únicos parciais: um `partner` por `supplier_id` por apuramento; uma `house` por apuramento

## Integridade

Trigger `validate_settlement_participant` (BEFORE INSERT/UPDATE):

1. o participante tem de pertencer ao evento do apuramento;
2. a `house` só existe no apuramento raiz;
3. um sócio (`supplier_id`) tem no máximo **um** participante `settles` por evento.

## Espelho TEMPORÁRIO de `event_partners`

`event_settlement_sync_root(_event_id)` (SECURITY DEFINER, EXECUTE revogado a PUBLIC/anon) cria a raiz `"Fecho do evento"` se faltar, espelha cada linha de `event_partners` como `partner`/`settles`, apaga espelhos órfãos (rede extra além do CASCADE) e recalcula a `house`:

- `house.profit_pct = 100 − Σ percentage`
- `house.loss_pct = 100 − Σ coalesce(loss_percentage, percentage)`

Trigger `trg_event_partners_mirror_ins` (AFTER INSERT/UPDATE/DELETE em `event_partners`) chama-a. **Temporário até à sub-tarefa (e)**, quando os ecrãs passarem a ler os apuramentos e o espelho é retirado.

## RLS

Réplica do padrão de `event_partners`: SELECT a autenticados (+ policy do próprio sócio via `user_has_event_access` + `user_supplier_id`), escrita só admin/manager, RESTRICTIVE `company_id = current_company_id()`.

## O que NÃO faz ainda

- Nenhum cálculo consome estas tabelas: card, Fecho, Encontro de Contas, Portal e `house-partner.ts` continuam em `event_partners`.
- Sem perímetro de receitas/despesas por apuramento, sem cascata pai↔filho, sem C1/C2, sem documentos por apuramento, sem selo operacional.
- UI: painel **só leitura** "Apuramentos" (`src/components/EventSettlementsPanel.tsx`) na aba Sócios.

## Estado inicial em produção (12/09/2026)

7 raízes, 9 participantes espelhados + 7 `house`. Σ `profit_pct` dos `settles` = 100 em cada raiz. Anitta: ANITTA 70/0, EVERYTHINGISNEW 15/(igual), casa 15/85. Coala PT 2026: casa a 0 (a MP é sócio explícito como supplier) — **é correcto, não corrigir**.
