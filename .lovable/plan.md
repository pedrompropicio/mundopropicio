# P5b — Passo 1 (R2): migração 0284, `a_pagar.por_evento` na get_financial_position_base

Só este passo. O Passo 2 (P5b, R1) é outra tarefa e precisa de novo Sim. Publish só pelo 0 - Cowork.

## Ficheiros lidos / estado verificado
- supabase/manual/0283_p4b_financial_position_permission.sql, 0282, rollback_0283 (comentado), supabase/functions/financial-position/index.ts, _shared/financial-position/assemble.ts, src/lib/financial-position-p5.ts, docs/DECISIONS.md (D-ERP15, D-ERP27, D-ERP320/321/323/324), 20260611120000_event_cash_treasury.sql.
- Live vs ficheiro 0283: corpo md5 `fd18f727860fc1d2f550f474812756b0`, 16.700 caracteres nos dois. **Não divergem.** Gate `view_financial_position` presente; versão `p4-v1`.
- A RPC hoje só tem `a_pagar.por_estagio`; não há detalhe por evento.

## Arranque após o Sim (antes de qualquer SQL)
1. Reserva em docs/QUADRO.md › "Em execução agora" (P5b-P1 — R2 — agente Lovable).
2. Ler e nomear no QUADRO a Issue #116 e as Issues de aporte de sócios / conta de acerto (correção e).
3. Abrir as Issues 33/34/35 (paid_by estruturado; partner_id no aporte; conta corrente por sócio fora do evento), fora do P5b.

## Mudança (só aditiva)
Tudo o que existe fica byte-idêntico em valor. Duas chaves novas em `a_pagar`: `por_evento` (lista) e `por_evento_nota`. Versão mantém-se `p4-v1`: chave nova, nenhum campo muda (o zod do P5 ignora chaves desconhecidas em `a_pagar`; confirmar no teste — se for `.strict()`, passa a `p4-v2` e o P5 aceita as duas).

### Diff sobre o corpo atual (0283)
```text
 ev AS (
-  SELECT t.id AS event_id, rs.root_id, rs.stage, rs.started,
+  SELECT t.id AS event_id, rs.root_id, rs.stage, rs.started,     -- (sem mudança)
 ...
 tx AS (
-  SELECT t.id, t.type, t.event_id, ...
+  SELECT t.id, t.type, t.event_id, ev.root_id, ...               -- + root_id
 ...
 bp AS (
-  SELECT f.id, f.event_id, ev.stage, f.amount,
+  SELECT f.id, f.event_id, ev.root_id, ev.stage, f.amount,       -- + root_id
 ...
+-- Informativo: BP de TODOS os eventos contados (mesmo started=false), mesmos filtros de bp.
+-- Nunca entra em por_estagio nem em total.
+bpx AS (
+  SELECT f.id, ev.root_id,
+    coalesce(c.quota_sum, f.amount * (1 + coalesce(f.iva_rate, 0) / 100.0)) AS custo
+  FROM public.event_forecasts f
+  JOIN ev ON ev.event_id = f.event_id
+  LEFT JOIN contr c ON c.forecast_id = f.id
+  WHERE f.company_id = p_company_id
+    AND f.type = 'expense' AND f.status = 'approved' AND f.version_id IS NULL
+    AND NOT coalesce(f.is_transitory, false) AND NOT coalesce(f.is_overhead, false)
+    AND NOT coalesce(f.exclude_from_result, false) AND f.paying_partner_id IS NULL
+),
+bpxl AS (
+  SELECT bpx.root_id, bpx.custo,
+    greatest(bpx.custo - coalesce(lt.pago, 0) - coalesce(lt.aberto_tx, 0), 0) AS por_lancar
+  FROM bpx LEFT JOIN lt ON lt.forecast_id = bpx.id
+  LEFT JOIN rev ON rev.forecast_id = bpx.id AND rev.decision = 'partner_paid'
+  WHERE rev.forecast_id IS NULL
+),
+pev AS (
+  SELECT rs.root_id, rs.stage, rs.first_day, rs.started,
+    coalesce((SELECT sum(ls.lancado) + sum(CASE WHEN ls.bucket <> 'partner_paid' THEN ls.saldo ELSE 0 END)
+              FROM ls WHERE ls.root_id = rs.root_id), 0)
+    + coalesce((SELECT sum(txo.aberto) FROM txo WHERE txo.root_id = rs.root_id), 0) AS a_pagar_total,
+    coalesce((SELECT sum(ls.lancado) FROM ls WHERE ls.root_id = rs.root_id), 0)
+    + coalesce((SELECT sum(txo.aberto) FROM txo WHERE txo.root_id = rs.root_id), 0) AS a_pagar_lancado,
+    coalesce((SELECT sum(custo) FROM bpxl WHERE bpxl.root_id = rs.root_id), 0) AS bp_total,
+    coalesce((SELECT sum(por_lancar) FROM bpxl WHERE bpxl.root_id = rs.root_id), 0) AS bp_por_lancar,
+    coalesce((SELECT sum(tx.pago) FROM tx WHERE tx.root_id = rs.root_id
+              AND tx.type = 'expense' AND NOT tx.is_transitory), 0) AS despesas_pagas
+  FROM rs WHERE rs.stage NOT IN ('historico','cancelado')
+),
 ...
     'a_pagar', jsonb_build_object(
       'por_estagio', ...,                                          -- (sem mudança)
+      'por_evento', (SELECT coalesce(jsonb_agg(jsonb_build_object(
+          'evento_id', root_id, 'estagio', stage, 'first_day', first_day, 'started', started,
+          'a_pagar_total', round(a_pagar_total, 2), 'a_pagar_lancado', round(a_pagar_lancado, 2),
+          'bp_total', round(bp_total, 2), 'bp_por_lancar', round(bp_por_lancar, 2),
+          'despesas_pagas', round(despesas_pagas, 2))
+          ORDER BY first_day NULLS LAST, root_id), '[]'::jsonb) FROM pev),
+      'por_evento_nota', 'a_pagar_total soma por estágio a por_estagio.total. bp_total e bp_por_lancar são informativos, calculados mesmo com started=false, e não entram no a pagar.',
       'total', ...                                                 -- (sem mudança)
```
O SQL completo da 0284 = corpo 0283 com estas inserções, em `supabase/migrations/<ts>_0284_p5b_a_pagar_por_evento.sql` + cópia idêntica em `supabase/manual/`; mesmos REVOKE/GRANT da 0283. Sem INSERT em role_permissions (já existe).

### Predicados das chaves novas
- `evento_id, estagio, first_day, started`: de `rs` (event_stage, min de events.date/event_dates na árvore, first_day ≤ hoje Lisboa).
- `a_pagar_total`: exatamente a parcela do evento em `pay` (BP lançado + saldo sem partner_paid quando bp_counts; + `txo.aberto`).
- `a_pagar_lancado`: `ls.lancado` + `txo.aberto` (transações aprovadas/pagas por pagar, bruto, sem transitórias, sem sócio pagador, sem mães de rateio).
- `bp_total`: Σ custo bruto (ou quota de contrato de cachê) das linhas approved, version_id null, não transitórias, sem overhead/exclude, sem sócio pagador — em todos os eventos contados.
- `bp_por_lancar`: Σ por linha max(custo − pago − aberto_tx, 0), sem linhas com decisão partner_paid; rotulado informativo.
- `despesas_pagas`: Σ `pago` de `tx` expense não transitória (paid_amount, ou bruto se paid sem paid_amount) — mesma definição já usada no `lt`.

## Prova e verificação (para o 0 correr)
```sql
with b as (select public.get_financial_position_base('7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid, null) j)
select s.key estagio,
  round((s.value->>'total')::numeric,2) por_estagio,
  round(coalesce((select sum((e->>'a_pagar_total')::numeric) from b, jsonb_array_elements(b.j->'a_pagar'->'por_evento') e
                  where e->>'estagio'=s.key),0),2) soma_por_evento,
  round((s.value->>'total')::numeric - coalesce((select sum((e->>'a_pagar_total')::numeric) from b,
         jsonb_array_elements(b.j->'a_pagar'->'por_evento') e where e->>'estagio'=s.key),0),2) diferenca
from b, jsonb_each(b.j->'a_pagar'->'por_estagio') s;
-- esperado: diferenca = 0.00 em todos os estágios
```
Mais: (1) md5 do JSON sem `por_evento`/`por_evento_nota` antes e depois = igual (tudo o resto inalterado); (2) Madrid bf9ce2d8: `a_pagar_total` 184.670,96, `despesas_pagas` 378.586,08, `bp_total` 666.560,59, `bp_por_lancar` ≈ 103.303,55 (valor exato pela regra; a diferença face à aproximação fica documentada); (3) SELECT independente de despesas pagas por evento raiz.
Arredondamento: a soma de valores já arredondados pode diferir ±0,01 por estágio do total arredondado; se acontecer, documento e o teste tolera 0,01 × n eventos — senão exige 0,00.

## Testes
- PGlite (padrão 0282/0283): fixture com evento em_curso não iniciado (BP fora do total, presente em bp_por_lancar), em_fecho iniciado, contrato de cachê, linha partner_paid, mãe de rateio, transitória; asserta Σ por_evento = por_estagio, gate (sem permissão → 42501; anon sem EXECUTE), resto do JSON igual à 0283.
- Vitest do P5/P4: schema aceita a chave nova; nada muda nos cartões.

## Tempo de execução
Uma árvore extra (`bpx`/`bpxl`) e subconsultas por evento raiz (~dezenas). Estimativa +50–200 ms na RPC; a edge (6–8 s) quase não muda. Medir com EXPLAIN ANALYZE em Live antes/depois e registar.

## Rollback
CREATE OR REPLACE com o corpo da 0283 (ficheiro manual, md5 fd18f727…), mais os mesmos REVOKE/GRANT. Sem dados a repor. Ficheiro `supabase/manual/rollback_0284_comentado.sql`.

## Fecho documental
docs/testes/p5b-p1-a-pagar-por-evento-20261027.md (prova, md5, tempos), D-ERP325 (por_evento aditivo; regra única na RPC, sem réplica TS), estado-financeiro-e-tesouraria.md, memória financial-position-base, QUADRO "pronto para Verificação em Live" e reserva libertada.

## Registado para o Passo 2 (P5b, R1 — não implementar agora)
- Usa `a_pagar.por_evento`; nenhuma réplica TS.
- get_event_cash_position chamado com o JWT do utilizador (nunca service role); somar sub-eventos ao raiz via master_event_id; contas skip_balance_check=true fora; Madrid realized 92.275,50.
- `aporte_socios` (não aporte_hk); só Madrid hoje: 25 linhas, 353.810,51.
- necessidade_financiamento = max(0, a_pagar_lancado + bp_por_lancar − dinheiro_parado); sem vendas_acessiveis; saido_minimo à parte por conta. Madrid ≈ 195.699,01.
- aporte_mp por resíduo, rotulado estimativa (pagador desconhecido).
- planeamento sem data → data_indeterminada; bp_por_lancar de não iniciados conta na necessidade, rotulado; permissão view_financial_position.
- Tocar financial-position/index.ts para a função ser reconstruída; confirmar meta.version.
