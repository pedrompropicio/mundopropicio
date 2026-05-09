# Tickets V2 — Migração para "tipo como container"

**Status**: em coexistência (Fase 2 parcial concluída).
**Última actualização**: 2026-05-09.

## Decisão central: opção C (variantes auto-referenciais + cap agregado)

3 níveis de hierarquia:
1. **Tipo** (`event_ticket_types`) — produto base: nome, kind, entries_per_unit
2. **Lote** (`event_ticket_lots`) — venda: preço, quantidade, sales_window
3. **Promoção condicional** — adiada para pós-MVP

Variantes de um tipo (canal Revolut, package incluído, promo 2x1, companion)
ficam na própria tabela `event_ticket_types` via `parent_ticket_type_id` com
**profundidade máxima 1** (validada por trigger `event_ticket_types_validate_depth`).

`max_total_quantity` no tipo-pai cobre **soma de pai + variantes**.
Cap físico da zona em `event_ticket_zones.total_capacity` é **sempre dominante**
e nunca pode ser ultrapassado. NULL = sem limite.

## 5 padrões de bilheteria reconhecidos

| ID | Nome | Exemplo | Característica |
|----|------|---------|----------------|
| P1 | Festival combo | Coala 2026 | Multi-dia + combo + variantes canal |
| P2 | Sessões múltiplas | Henry & Klaus | 1 dia × N sessões, mesma "zona" |
| P3 | Fases cronológicas | Ivete | 1 zona, 1 dia, lotes Lote 1/2/3 |
| P4 | Simples 1×1 | MP geral | 1 dia 1 zona 1 lote |
| P5 | Master/split tour | turnê | Cidade-master + city-splits |

Fixtures em `src/lib/__tests__/tickets-v2-fixtures.ts`.

## Empresas e estado actual

### Coala Festival Portugal (`7d831e59-6e82-427b-95a0-64904aae5dd2`)
- 16 tipos raiz + 2 variantes Revolut (Relvado)
- Coala 2026 (`5a1da5fb-3115-4ae3-af50-15ce1f869a5c`):
  - 4 zonas: Relvado Sáb/Dom (cap NULL), Tenda VIP Sáb/Dom (cap 519/dia)
  - IDs zonas: relvado-sab=`d128ce5f...`, relvado-dom=`0c8ac3fc...`,
    tenda-sab=`1d38002b...`, tenda-dom=`fed72d2b...`
- sync_mode = `log_only`, feature_tickets_v2 = false
- Sem tráfego activo no sistema (controlado externamente via Sheet)
- Tem combos reais (Passe Geral Relvado 2 dias, Passe VIP Tenda 2 dias)

### Mundo Propício (`7c858982-6ccd-47ca-bd65-e0dd3eebf01c`)
- 264 tipos
- sync_mode = `log_only`, feature_tickets_v2 = false
- Eventos ao vivo (Henry & Klaus, Ivete, etc.) com vendas activas
- Sem combos
- 30 duplicatas pendentes de limpeza (limpar antes da Fase 4)

## Tokens de canal pré-populados (ambas empresas)

`tickets_config.channel_partner_tokens`: revolut, fnac, wegow, ticketline,
bilheteiraonline, fever, viagogo, seetickets, stubhub, everydaypass, blueticket,
ticketmaster, ticketswap, worten, cp, mediamarkt, el_corte_ingles, loja_oficial.

Heurística de detecção de variante: token de canal (case-insensitive,
acento-insensitive) presente no nome do lote + signature de zonas idêntica
ao tipo-pai → liga como variante. Ambíguos → warning, fica como raiz.

## Heurística de matching (`compute_ticket_type_for_lot`)

Stable. Para cada lot, dado (nome, zona âncora, is_combo, consumes_zone_ids,
applies_to_days, version_id):

1. Resolve event_id e zone_name a partir de zona âncora.
2. Extrai base_name removendo sufixo `- Lote N` e prefixo `Tag |`.
3. Determina is_real_combo = is_combo AND cardinality(consumes_zone_ids) ≥ 2.
4. Calcula zone_signature (ordenada) — array com zonas consumidas (combo) ou
   só anchor (simples).
5. Decide kind: `multi_day_pass` se combo + applies_to_days ≥ 2; senão `single_day`.
6. Procura match em `event_ticket_types` com mesma signature E nome ∈
   {base_name, base_name + " — " + zone_name, base_name + " — " + zone_name + " (session)"}.
7. Se match → liga; senão propõe criar com nome adequado.
8. Avisos: combo com consumes vazio, anchor fora de consumes, zona inexistente.

## Reconciliação cruzada (10 invariantes)

Suite SQL `tickets_v2_run_all_tests()` corre a qualquer momento e valida:
- I1: Todo lote tem ticket_type_id (após Fase 1 populate)
- I2: Todo tipo tem ≥1 zona na junction
- I3: Σ quantities legacy = Σ via tipos (156.425 unidades)
- I4: Junction de combos == consumes_zone_ids legacy (set-equality)
- I5: Profundidade variantes ≤ 1
- I6: Todo kind ∈ {single_day, multi_day_pass, package, session_ticket, custom}
- I7: Toda zone na junction existe em event_ticket_zones
- I8: Pai e variante no mesmo evento
- I9: Variante tem variant_kind preenchido
- I10: total_capacity ≥ 0 ou NULL

Suite TS adicional (40 testes em `src/lib/__tests__/tickets-v2-*`):
- 6 snapshots P1-P5 (resultado exacto)
- 8 property tests com 100 seeds determinísticos (mulberry32)
- 5 edge cases
- 21 testes da camada de leitura (equivalência legacy↔v2)

## Modos de sincronização

`companies.tickets_config.sync_mode`:

| Modo | Comportamento |
|------|---------------|
| `log_only` (default) | Trigger regista o que faria; não altera nada |
| `active` | Trigger preenche ticket_type_id automaticamente: liga existente OU cria tipo+junction (modo legacy); recusa se feature_v2=true sem tipo explícito |
| `off` | Trigger não faz nada (escape hatch de emergência) |

## Wrapper de leitura isolado

`src/lib/tickets-v2-read.ts::fetchEventLotsUnified(eventId, client)`:
- Resolve company → lê `feature_tickets_v2`
- Flag false → query directa de event_ticket_lots (igual ao legacy)
- Flag true → JOIN com event_ticket_types + event_ticket_type_zones, deriva
  is_combo e consumes_zone_ids do junction

Output (`UnifiedLot[]`) idêntico em formato em ambos os caminhos.
**Não consumido por nenhum hook ainda** — fica isolado até Fase 2.6.

## Pendente

1. **24-48h de observação log-only** antes de activar Fase 2.2.
2. Confirmar Promo "2x" Coala = entries_per_unit 1 ou 2.
3. Limpar 30 duplicatas MP pré-Fase 4.
4. Editor de tokens canal por empresa (Fase 3 UI).
5. `event_ticket_promotions` para cupões/BOGO (pós-Fase 4).
6. Migrar consumers TS (`useEventAttendance` etc.) — Fase 2.6.

## Locais relevantes

**Scripts:** `scripts/fase-tickets-v2-live/`
- `01-DDL-and-populate.sql` ✓
- `02-triggers-log-only.sql` ✓
- `02-suite-tests-sql.sql` ✓
- `03-triggers-active.sql` 📦 pronto
- `04-activate-coala.sql` 📦 pronto
- `05-activate-mp.sql` 📦 pronto

**Código:** `src/lib/`
- `tickets-v2-read.ts` — wrapper isolado (commit `c5628b5`)
- `event-attendance-calc.ts` — cálculo puro legacy (não muda)
- `combo-capacity.ts` — função pura de capacity (não muda)
- `event-simulator-combos.ts` — heurística combo legacy (não muda)
- `__tests__/tickets-v2-fixtures.ts` (commit `a3aa05e`)
- `__tests__/tickets-v2-properties.test.ts` (commit `a3aa05e`)
- `__tests__/tickets-v2-read-layer.test.ts` (commit `c5628b5`)

**Plano detalhado:** `.lovable/plan-tickets-v2.md`
