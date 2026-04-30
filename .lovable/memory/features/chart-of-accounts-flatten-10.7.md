---
name: chart-of-accounts-flatten-10.7
description: Aplanamento de 10.7.* de 4 níveis para 3 — variante A2 com 3 L2 (Serviços/Estrutura/Tecnologia)
type: feature
---

Em 2026-04-30, ramo `10.7.*` do plano de contas tinha 18 folhas L4 (4 níveis), violando a Core rule "Only L3 nodes are selectable". Detetado durante revisão das contas administrativas — quebrava agregação L2 em todos os relatórios (DRE, Análise Resultados, BP, Acerto Sócios) porque `category-hierarchy.ts` só sabe trabalhar com 3 níveis.

**Decisão**: aplanar para L3, criando 3 L2 distintos para preservar sub-categorização semântica (variante A2):
- `10.7 Serviços` (L2): 10.7.01 Contabilidade, 10.7.02 Jurídico, 10.7.03 Consultoria
- `10.8 Estrutura` (L2): 10.8.01 Aluguer/Renda, 10.8.02 Energia, 10.8.03 Internet
- `10.9 Tecnologia` (L2): 10.9.01 Softwares, 10.9.02 Cloud, 10.9.03 Equipamentos

**Implementação**:
- IDs das folhas L4 foram PRESERVADOS (apenas mudou `code` + `parent_id`) → zero migrações de FK em transactions, event_forecasts, bp_versions, payment_list_items, snapshots, audit logs etc.
- Aplicado em 2 fases (codes TMP_ para evitar colisão de `unique(code, company_id)`).
- Re-routing defensivo de TX/BP vinculados aos antigos L3-grupo (`10.7.01/02/03` antigos) para a 1ª folha do novo grupo correspondente.
- Migração em Test via supabase--migration; Live via `scripts/flatten-10-7-to-l3-live.txt` (compact .txt para SQL Editor).

**Verificação**: SELECT que contava L4 devolve 0 em todo o plano. Distribuição final do plano: depth 1=10, depth 2=55 (multi-tenant), depth 3=247.

**Multi-tenant**: aplicado simultaneamente a Mundo Propício e Coala (e qualquer empresa futura que tenha `10` no plano).
