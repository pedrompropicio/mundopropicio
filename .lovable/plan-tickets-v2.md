# Plano — Migração Tickets V2 (modelo "tipo como container")

> **Objetivo**: migrar do modelo "zona como container primário" para "tipo como container primário", com variantes auto-referenciais e cap agregado pai. Sem perder dados, sem janela de manutenção.
> **Duração estimada**: 2-4 semanas em modo coexistência + 1 semana drop legacy.

---

## 0. Princípios irredutíveis

1. **Tudo aditivo** durante coexistência. Nenhuma coluna legacy é alterada/dropada antes da Fase 5.
2. **Idempotente**: cada batch pode ser corrido múltiplas vezes sem efeito.
3. **Reconciliação cruzada contínua** via testes invariant. Falha qualquer um → para.
4. **Escape hatches em tudo**: `sync_mode='off'`, `feature_tickets_v2=false`, rollback documentado por batch.
5. **Uma empresa de cada vez** ao activar modos disruptivos. Coala antes de Mundo Propício.
6. **Plano de rollback escrito ANTES** de qualquer batch.

---

## 1. Modelo do destino

### Schema

```
event_ticket_types
  id, event_id, company_id, name, kind, entries_per_unit,
  parent_ticket_type_id (auto-ref, max profundidade 1),
  variant_kind in {channel, package, promo, companion},
  variant_label, sales_channel, sales_channel_label,
  max_total_quantity (cap agregado, NULL = sem limite),
  ...

event_ticket_type_zones (junction)
  ticket_type_id, zone_id, display_order, price_share

event_ticket_lots (legacy, mantém durante coexistência)
  + ticket_type_id (FK NULLABLE para event_ticket_types)

companies
  + feature_tickets_v2 BOOLEAN DEFAULT false
  + tickets_config JSONB
      .sync_mode: 'log_only' | 'active' | 'off'
      .channel_partner_tokens: ['revolut','fnac','wegow',...]
```

### Decisões arquitecturais (3 níveis)

1. **Tipo + Lote + Promoção condicional** — implementar 2 primeiros (tipo, lote);
   `event_ticket_promotions` adiada para fase pós-MVP.
2. **Variantes via `parent_ticket_type_id`** com profundidade max 1 (validada por trigger).
3. **Cap pai cobre variantes** — `max_total_quantity` no tipo-pai engloba a soma
   pai + variantes. Cap físico da zona (em `event_ticket_zones.total_capacity`) é
   sempre dominante e nunca pode ser ultrapassado. NULL = sem limite.
4. **Atributos produto no tipo, atributos venda no lote** — preço e quantidade
   ficam no lote; nome, kind, variantes ficam no tipo.

---

## 2. Fases

### Fase 0 — Auditoria ✓ COMPLETED

Inventário de event_ticket_lots em ambas empresas. Identificação dos 5 padrões
distintos de bilheteria observados em produção. Mapeamento de combos reais
(zone_signature ≥ 2) vs falsos (1 zona). Listagem de 30 duplicatas no MP.

### Fase 1 — DDL + populate ✓ COMPLETED (`scripts/fase-tickets-v2-live/01-DDL-and-populate.sql`)

- Criar 2 tabelas + colunas + RLS pattern da casa
- Adicionar `feature_tickets_v2` e `tickets_config` a companies
- Permitir NULL em `event_ticket_zones.total_capacity`
- Populate em 2 passadas: combos reais → simples
- Resultado: 282 tipos, 324 lots ligados, 0 órfãos

### Fase 2.1 — Triggers em log-only ✓ COMPLETED (`02-triggers-log-only.sql`)

- Tabela `tickets_v2_sync_log` (RLS: admin/manager + company_isolation)
- Função `compute_ticket_type_for_lot` (heurística estável)
- Trigger AFTER INSERT/UPDATE/DELETE em event_ticket_lots
- Modo log_only: regista o que faria, sem mexer
- 3 views de monitorização

### Fase 2.3 — Wrapper de leitura ✓ COMPLETED (commit `c5628b5`)

- `src/lib/tickets-v2-read.ts` com `fetchEventLotsUnified(eventId, client)`
- Respeita feature_tickets_v2 da empresa do evento
- Output idêntico em formato em ambos os caminhos
- **Isolado**: nenhum hook/component consome ainda. Risco zero.

### Fase 2.5 — Suite de testes ✓ COMPLETED (commits `a3aa05e`, `c5628b5`)

- **Parte A SQL**: 33 testes (compute 12 + trigger 11 + invariants 10) via
  função `tickets_v2_run_all_tests()` + view `vw_tickets_v2_test_health`
- **Parte B TS**: 19 testes (snapshots 6 + property tests 8 + edge cases 5)
  cobrindo os 5 padrões com fixtures sintéticos + PRNG mulberry32 seedable
- **Parte C TS**: 21 testes da camada de leitura (equivalência legacy↔v2 +
  variantes + resilência) + 7 it.todo para Fase 2.4+
- Total: **73 testes activos verdes**

### Fase 2.2 — Triggers em active ⏸ PENDENTE

Ficheiros prontos para correr quando autorizado:

- `03-triggers-active.sql` — handler suporta active. Comportamento app inalterado
  (todas empresas continuam log_only após este batch).
- `04-activate-coala.sql` — Coala passa a active. MP continua log_only.
- `05-activate-mp.sql` — MP passa a active depois (≥24h após Coala).

Em active, o trigger:
- INSERT/UPDATE com ticket_type_id explícito → respeita
- INSERT/UPDATE sem ticket_type_id e tipo existe → preenche automaticamente
- INSERT/UPDATE sem ticket_type_id e tipo não existe + feature_v2=false →
  **cria** tipo + junction + preenche
- INSERT/UPDATE sem ticket_type_id + feature_v2=true → recusa (RAISE)
- DELETE → regista snapshot

### Fase 2.4 — Parsers (ADIADA para Fase 4)

Decisão revisada (2026-05-09): em active mode, o trigger faz o trabalho que
caberia aos parsers. Parsers só serão actualizados quando passarmos a
single-write (Fase 4).

### Fase 2.6 — Migrar consumers TS ⏸ PENDENTE

Após active mode estabilizar (≥48h em ambas empresas):
- `useEventAttendance.ts` passa a usar `fetchEventLotsUnified`
- `combo-capacity.ts` continua puro mas o consumidor usa wrapper
- Os 7 `it.todo` da Parte C transformam-se em `it()` reais

### Fase 3 — UI nova ⏸ PENDENTE

- Editor de tipos (com variantes via dropdown de canal)
- Editor de tokens de canal por empresa (em settings)
- Limpeza das 30 duplicatas Mundo Propício antes de UI ir live
- Relatório por canal (variantes agregadas no pai com breakdown)

### Fase 4 — Single-write ⏸ PENDENTE

- Parsers escrevem directamente em event_ticket_types + event_ticket_lots
- App passa a depender só do novo modelo (legacy fica congelada)
- Janela mínima de observação: 1 semana

### Fase 5 — Drop legacy ⏸ PENDENTE

- Remover trigger sync (já não é necessário)
- Drop colunas legacy de event_ticket_lots: is_combo, consumes_zone_ids
- Drop tabela tickets_v2_sync_log (manter snapshot 30 dias antes)
- Drop feature flag (já é o único modo)

---

## 3. Decisões pendentes

| # | Decisão | Estado |
|---|---|---|
| T1 | Promo "2x" Coala: `entries_per_unit=1` ou `2`? | ⏳ Aguarda confirmação Coala |
| T2 | Limpeza das 30 duplicatas MP: antes ou depois da Fase 3? | **Antes da Fase 4** |
| T3 | Tabela `event_ticket_promotions` (cupões/BOGO)? | **Pós-Fase 4** |
| T4 | Editor de tokens de canal por empresa | **Fase 3** |
| T5 | Coala em active antes ou junto MP? | **Antes** (1 empresa de cada vez) |

---

## 4. Plano de rollback por fase

### Fase 1 (DDL)
- Comentário no fim de `01-DDL-and-populate.sql`. DROP CASCADE das 2 tabelas
  novas + drop das colunas adicionadas. Feature flag fica false naturalmente.

### Fase 2.1 (triggers log-only)
- Drop trigger + função + tabela log + 3 views. App não é afectada (ela nunca
  dependeu do trigger).

### Fase 2.2 (active mode)
- Por empresa: `UPDATE companies SET tickets_config jsonb_set sync_mode log_only`.
- Por ficheiro 03: rollback comentado restaura função antiga.
- Tipos criados durante active ficam (são aditivos). Se quiser limpar, query
  no log:
  ```sql
  SELECT proposed_type_id FROM tickets_v2_sync_log
  WHERE trigger_action = 'created_type' AND created_at > '<momento>';
  ```

### Cenário catastrófico
- `database-restore-v2` para backup do dia anterior. Custo: perda de 1 dia de
  edições manuais em event_ticket_lots; tudo o resto preservado.

---

## 5. Health checks (correr a qualquer momento)

```sql
-- Suite SQL (33 testes)
SELECT * FROM public.tickets_v2_run_all_tests() WHERE NOT passed;
SELECT * FROM public.vw_tickets_v2_test_health;

-- Actividade do trigger
SELECT * FROM public.vw_tickets_v2_sync_summary_7d;
SELECT * FROM public.vw_tickets_v2_sync_warnings;
SELECT * FROM public.vw_tickets_v2_sync_would_create;

-- Estado de cada empresa
SELECT display_name,
       feature_tickets_v2,
       tickets_config -> 'sync_mode' AS sync_mode
FROM public.companies ORDER BY display_name;
```

```bash
# Suite TS (40 testes, deve sempre passar)
npm test -- src/lib/__tests__/tickets-v2
```

---

## 6. Janela de tempo

- D0 (executado): Fase 1 + Fase 2.1 + Fase 2.5 + Fase 2.3
- D0+1 a D0+2: observação de log-only via vw_tickets_v2_sync_summary_7d
- D0+2: executar 03-triggers-active.sql (handler atualizado, ninguém em active)
- D0+2: executar 04-activate-coala.sql
- D0+3 a D0+4: observação Coala em active
- D0+4: executar 05-activate-mp.sql
- D0+4 a D0+11: observação ambas em active
- D0+11+: Fase 2.6 (migrar consumers TS)
- D0+18+: Fase 3 (UI nova)
- D0+30+: Fase 4 (single-write)
- D0+45+: Fase 5 (drop legacy)
