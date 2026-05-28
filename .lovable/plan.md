
## Contexto

Dois bugs no card de evento ativo do Dashboard (`src/pages/Index.tsx`), reportados sobre o Coala Festival Portugal 2026:

1. **"Ontem" oscila e às vezes diminui depois do sync Fever** — hoje mostra só `2.193,00 € · 17 bilh.` em Relvado—Sábado, e o Pedro lembra-se de ter visto um valor mais alto mais cedo. Os runs de `fever_sync_runs` de 27/05 e 28/05 estão todos `success` (sem 401).
2. **"Por Zona" trata cada combo Passe-2-dias como venda só de Sábado.** A regra do negócio é: 1 Passe 2 dias = 1 acesso no Sábado **+** 1 acesso no Domingo. Hoje os 9779 "bilhetes" em Relvado—Sábado incluem os passes; Relvado—Domingo aparece com 4607 (só os tickets de dia avulso de Domingo), o que não representa o público real por dia.

---

## Bug 1 — "Ontem" instável no sync Fever

### Diagnóstico

`runFeverImport` (`supabase/functions/_shared/fever-import-server.ts:188-211`) faz **delete-all + re-insert** de TODAS as `ticket_sales` Fever do evento, a cada run. Não há datas no Metabase params (`purchase_date: null`), portanto cada XLSX deve ser o histórico completo. Mas:

- A Fever pode reclassificar `purchase_date` quando há refunds/recolocações entre syncs → o "Ontem" sobe e desce ao sabor do que o XLSX devolve.
- Em runs concorrentes (ex.: hoje 28/05 às 08:00 dispararam DOIS crons, `5679c671` e `c495bfbe`), ambos fazem delete+insert em sequência e podem expor uma janela com dados parciais para qualquer query que apanhe o meio.
- Não há snapshot/baseline por dia, nem auditoria por sale_date entre runs, logo não há como diferenciar "Fever mudou os dados" de "perdemos linhas".

### Plano

1. **Telemetria por sale_date no `runFeverImport`:** antes do delete (passo 6), agregar `SELECT sale_date, sum(quantity), sum(total_value) FROM ticket_sales WHERE zone_id IN (...) AND financial_account_id=fever GROUP BY sale_date` e gravar `prevByDate`. Depois do insert (passo 7), gerar `newByDate` e calcular `diffByDate` (rows novas, removidas, deltas de qty/valor). Persistir em `audit.byDate` dentro de `fever_sync_runs.import_audit`.
2. **Lock anti-concorrência:** logo no início de `runFeverImport`, tentar `pg_try_advisory_lock(hashtext('fever-import:'||eventId))` (ou flag transitória `fever_sync_runs.status='started'` por config_id sem `finished_at` recente). Se já existe run em curso há <90s, retornar `skipped:"concurrent_run"`. Eliminar os duplos crons das 08:00.
3. **Alerta de "Ontem caiu":** se `diffByDate[yesterday].qty_delta < 0` (qty diminuiu vs run anterior bem-sucedido), set `run.status='success_with_warning'` e `audit.warnings += ["yesterday_shrunk", { from, to }]`. Sem rollback automático — só visibilidade.
4. **Página `/admin/fever-sync` (já existe?):** se sim, mostrar `audit.byDate.yesterday_delta` e warnings dos últimos 10 runs. Senão, fica para outro pedido (não bloqueia).
5. **Re-trigger manual já-agora:** botão de "Re-sync agora" já existe; nada a fazer aqui.

### Ficheiros tocados (apenas backend nesta fase)

- `supabase/functions/_shared/fever-import-server.ts` — agregação prev/new por sale_date, advisory lock, warnings.
- `supabase/functions/fetch-fever-reports/index.ts` — propagar warnings para `updateRun(..., status)` quando aplicável.
- Migration: nada — `import_audit` é JSONB.

---

## Bug 2 — Combos contam só no Sábado em "Por Zona"

### Diagnóstico

`src/pages/Index.tsx:351-398` agrega `ticket_sales` por `zone_id` puro. Os lotes Fever de Passe-2-dias estão fixados na zona Sábado (ver `fever-import-server.ts:175` — combos só inseridos em `satZoneId`, com `consumes_zone_ids=[satZoneId, sunZoneId]`). Logo cada venda combo é contada 100% em Sábado, 0% em Domingo na tabela. Para o card "Vendas de Bilhetes (Por Zona)" do dashboard, o Pedro quer **presenças×dia** (1 combo = +1 no Sáb e +1 no Dom).

### Plano

1. **No `useQuery dashboard_ticket_sales`**, juntar `lot_id, lots(id, is_combo, consumes_zone_ids, applies_to_days)` ao select (já incluímos `event_ticket_zones`).
2. **No agregador `computed` (linhas 351-398), criar 2 contas distintas por evento:**
   - `bucket.zones[name]` continua a ser a venda comercial **bruta por zona física** (mantém o "Total" da coluna existente — para não quebrar fecho de bilheteira).
   - Novo `bucket.attendanceByZone[name]` que, para cada venda, expande:
     - lote simples (`is_combo=false`) → +qty em `zone_id`.
     - lote combo → +qty em cada zona de `consumes_zone_ids` (fallback: `[zone_id]` se array vazio).
3. **UI:** o table "Por Zona" passa a mostrar **presenças** (attendanceByZone) nas 3 colunas (Ontem / 7d / Total). Renomear cabeçalho da tabela para `Por Zona (presenças/dia)` e ajustar tooltip. As linhas Sábado/Domingo passam a refletir 1 combo = +1 cada.
4. **Coerência com o card grande "Vendas de Bilhetes" no topo do evento:** esse continua a ser `sold/capacity` no sentido comercial (não mudar — é o que importa para sell-through). Só o detalhe "Por Zona" é que vira presenças.
5. **Memory:** já existe `simulator-public-unit` com a regra "1 Passe 2 dias = 2 presenças×dia"; basta encostar esta UI à mesma definição. Adicionar nota curta na memory para clarificar que o Dashboard agora aplica isto na tabela Por Zona.

### Ficheiros tocados (apenas frontend)

- `src/pages/Index.tsx` — query select + agregador + render do `Por Zona`.
- `.lovable/memory/features/simulator-public-unit.md` — addendum 1 parágrafo: "Dashboard Index → tabela Por Zona usa presenças (expansão combo via consumes_zone_ids)".

---

## Sequência sugerida (2 commits separados)

1. **Commit A (rápido, só UI):** Bug 2 — expansão de combos no Dashboard. Visível imediatamente, sem mexer em backend.
2. **Commit B (backend Fever):** Bug 1 — telemetria por sale_date + advisory lock + warnings. Precisa deploy de 2 edge functions. Sem migração de DB.

## Riscos

- **B1:** advisory lock pode rejeitar runs manuais legítimos se um cron está em curso. Mitigação: TTL curto (90s) e mensagem clara no run para o Pedro saber.
- **B1:** `audit.byDate` engorda `import_audit`; é só JSONB com ~30 chaves (1 por dia) por run, irrelevante.
- **B2:** se algum evento tem combos com `consumes_zone_ids=NULL` (antigos), fallback usa `[zone_id]` → mesmo comportamento de hoje, sem regressão.
- **B2:** o número total da coluna "Total" muda visualmente (Domingo sobe; Sábado pode descer se subtraímos os combos). Isto é o que o Pedro quer. Confirmar antes de fazer.

## Pergunta de confirmação

Na tabela "Por Zona", quando expandirmos combos para presenças/dia: queres que a coluna **Total** mostre `4607 + Npasses` em Domingo e `9779 − Npasses + Npasses = 9779` em Sábado (combos contam +1 em ambas), OU queres que Sábado mostre só os bilhetes-Sábado-puros (sem combos) e Domingo só Domingo-puros + combos? A 1ª é "presenças por dia" pura; a 2ª é "bilhetes por dia físico" mas não bate com 1 acesso/dia.
