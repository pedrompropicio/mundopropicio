# P5c (revisto) — Receita prevista na cobertura de eventos futuros, R2

HEAD remoto: `f4ebacbcb13a89e2f9068f57ef0b888c33162348`. Mantêm-se as regras 1–8 e as secções b), e), g) do plano anterior; muda a fonte da previsão. Leitura nova: `src/lib/bp-income-synthetic.ts` não filtra `version_id` e aplica a capacidade ao evento inteiro (min(Σ capacidade, Σ qty) × preço médio líquido), não por zona.

## 1. Fonte e fórmula da previsão

Lotes de planeamento = `event_ticket_lots` com `version_id IS NULL`, `quantity>0`, `price>0`, `sync_generated=false`, ligados por `event_ticket_zones.event_id`. Preço já com IVA, por isso não há conversão.

Por zona:
```text
qty_zona   = Σ quantity
bruto_zona = Σ quantity × price
cap        = total_capacity da zona (null ou 0 = sem limite)
previsao_zona = cap e qty_zona > cap ? bruto_zona × cap / qty_zona : bruto_zona
```
(o corte é proporcional por preço médio da zona; com total_capacity nulo, como no Relvado Coala, não há limite).

Por sessão/evento: `previsao_evento = Σ previsao_zona` das zonas com `event_id` = esse evento (só as suas, nunca as dos filhos).

Por raiz, sem dupla contagem: `previsao_raiz = Σ previsao_evento` da raiz e de todos os descendentes (`rootOf` já existente). Cada zona pertence a um único `event_id`, portanto entra uma só vez; a raiz "Raphael Ghanem Tour 2027" sem lotes próprios recebe só a soma das sessões. "RG - Santa Maria da Feira" sem lotes e sem campo manual mostra "sem previsão".

Ordem da previsão usada: lotes > campo manual (só se o evento não tiver lotes) > "sem previsão". `ticketing_baseline_net` passa a referência "previsto original" (só exibida, nunca entra na conta).

Cenário por evento/sessão (tabela `event_coverage_scenarios`): aplica-se ao nível onde está configurado; sessão sem linha herda a da raiz; raiz configurada aplica-se só às sessões sem linha. Receita considerada por sessão = max(vendas, previsão × %) em Previsão, vendas em Real; a raiz soma as sessões.

## 2. Cálculo partilhado e paridade

- A regra "previsão de lotes de planeamento" vive num único módulo puro: `supabase/functions/_shared/ticketing/planning-forecast.ts` (sem I/O: recebe zonas e lotes, devolve por zona/evento). A edge usa-o; o ecrã importa o mesmo ficheiro (o cliente já é TypeScript; caminho relativo, sem cópia).
- A RPC só entrega os dados crus por evento futuro (zonas com capacidade e lotes filtrados) — nenhuma fórmula em SQL.
- O BP (`bp-income-synthetic`) não muda neste passo: o seu "previsto original" segue outra regra (capacidade global, líquido) e já está fixado em vários eventos. A divergência fica registada; alinhá-lo é Issue própria (questão 52).
- Paridade: teste vitest que corre o módulo e, para fixtures, compara o bruto com o que o diálogo de bilheteira mostra (mesma função chamada pelo ecrã); teste que garante que o filtro `version_id IS NULL` e `sync_generated=false` está no SELECT da RPC (PGlite) e que lotes de versões/sync não entram.
- Prova Live: por query minha, Σ por evento igual aos valores do 0 — Newgang 2027 735.807,00; RG Porto 93.975,00; Madrid 19.185,74; Coala 2027 1.807.425,00 (Relvado Sáb 1.158.345; Dom 521.690; Tenda VIP Sáb 103.724; Dom 23.666), com limite de capacidade aplicado onde existir (se o corte mudar algum destes, mostro a zona e o corte antes de seguir).

## 3. Âmbito por empresa

- Tabela, RLS e cálculo funcionam para qualquer empresa (filtro por `company_id` da RPC; cenários isolados por `row_belongs_to_current_company`). Coala 2027 aparece na cobertura da Coala, não na da MP.
- **Fora do âmbito**: os 35% da MP no Coala 2027 não entram na cobertura da MP neste passo (nem receita, nem custo, nem necessidade). Fica para Issue própria.

## Alterações à migração 0289 (face ao plano anterior)

- Retira `previsao_fixada_liquida/bruta` e o fator IVA.
- Acrescenta a cada evento futuro de `a_pagar.por_evento[]`: `cenario` (cru) e `planeamento.zonas[]` {zone_id, total_capacity, lotes:[{quantity, price}]}; `previsto_original` = `ticketing_baseline_net` (referência).
- md5 do JSON atual sem estes campos igual antes/depois; EXPLAIN ANALYZE antes da aplicação.

## Fórmula da necessidade e prova (inalterada)

potencial_total = max(0, Σ receita_considerada − saido_minimo_total); por evento só com fonte única, senão "indeterminado (pool)". Necessidade com receita = max(0, necessidade atual − potencial_total), lado a lado com a atual. Hoje, todos em Real/0%: 623.670,75 − 109.050,59 = 514.620,16 → 533.316,01 e 366.779,05 (a remedir).

## Testes adicionais

- Raiz sem lotes + 3 sessões com lotes: raiz = Σ sessões, zero duplicação.
- Zona com capacidade < Σ qty → corte proporcional; total_capacity nulo → sem corte.
- Lote com version_id ou sync_generated → excluído.
- Evento com lotes e manual → usa lotes; sem lotes → manual; nenhum → "sem previsão".
- Empresa Coala: cenário e cálculo próprios; MP não vê Coala.
- 0%/Real: campos atuais byte-iguais.

## Questões

- 47–51 como no plano anterior (recomendadas A).
- 52. Alinhar o "previsto original" do BP à nova regra por zona? A) Issue própria depois (recomendado); B) já neste passo.
- 53. Corte por capacidade: proporcional ao preço médio da zona (A, recomendado) ou cortar os lotes mais caros primeiro (B)?
