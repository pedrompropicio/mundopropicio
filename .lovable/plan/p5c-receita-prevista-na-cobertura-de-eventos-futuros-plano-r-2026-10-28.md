# P5c — Receita prevista na cobertura de eventos futuros (plano, R2)

HEAD remoto confirmado: `f4ebacbcb13a89e2f9068f57ef0b888c33162348`. QUADRO › Em execução: só #352 (Plataforma, sem sobreposição) e duas linhas ERP com reserva libertada. Reserva nova só após o Sim.

Ficheiros lidos: docs/INDEX.md (sessões anteriores), docs/QUADRO.md (Em execução agora), docs/estado/estado-financeiro-e-tesouraria.md (sessões anteriores), .lovable/memory/features/bp-receita.md, ticket-revenue-single-rule.md, financial-position-base.md, simulator-prior-curve.md, forecast-boost-calibrator.md (lista), supabase/functions/_shared/financial-position/future-coverage.ts e future-coverage-loader.ts, src/lib/bp-income-synthetic.ts, src/lib/event-simulator-forecast-live.ts, src/hooks/useBPIncomeSynthetic.ts, src/components/TicketForecastImportModal.tsx, src/components/EventTicketing.tsx (pontos de entrada), src/components/financial-position/FutureCoverageCard.tsx (localizado).

## a) Modal de bilheteira e onde vive a previsão

- Não existe hoje campo de "cenário". A previsão nasce dos lotes de planeamento (`event_ticket_lots` com `quantity>0`, `price>0`, `sync_generated=false`), carregados à mão ou pelo `TicketForecastImportModal` (aberto do separador Bilheteira, `EventTicketing.tsx`).
- `bp-income-synthetic.ts` calcula o previsto original = min(carga inicial, Σ qty planeamento) × preço médio líquido ponderado por lote, e o hook `useBPIncomeSynthetic` fixa-o uma vez em `events.ticketing_baseline_net` (sem IVA).
- O previsto corrente (simulador) só existe no cliente (`computeLiveTicketForecast`), nunca persistido.
- Proposta: novo diálogo "Cenário para a Posição Financeira" aberto do separador Bilheteira de cada evento/sessão (ao lado do botão de importar previsão), com: modo Previsão/Real, percentagem, receita prevista manual (€, com IVA) — só ativa quando não há previsão fixada —, viragem automática opcional, e histórico de alterações. Datas no `DatePicker` partilhado se aparecerem (não previstas).

## b) Desenho de dados (migração 0289, aditiva)

Recomendado tabela própria em vez de colunas em `events` (a tabela é partilhada com o portal público e as vistas `events_public`; evita tocar-lhe):

```text
event_coverage_scenarios
  event_id uuid PK -> events(id) on delete cascade
  company_id uuid not null
  modo text not null default 'real' check (modo in ('previsao','real'))
  percentagem numeric(5,2) not null default 0 check (0..100)
  receita_manual_bruta numeric(14,2) null check (>= 0)
  viragem_real_dias int null check (>= 0)     -- opcional (pedido 8)
  updated_by uuid, updated_at timestamptz default now()

event_coverage_scenario_log  (append-only, trigger AFTER INSERT/UPDATE/DELETE)
  id, event_id, company_id, old jsonb, new jsonb, changed_by, changed_at
```

- Sem linha = modo Real, 0% → comportamento atual.
- GRANT SELECT/INSERT/UPDATE ao authenticated, ALL ao service_role, sem anon. RLS padrão do projeto: base PERMISSIVE + RESTRICTIVE `row_belongs_to_current_company`; leitura com `view_financial_position`; escrita admin/manager. Log: só SELECT, sem UPDATE/DELETE para ninguém; escrito só pela trigger SECURITY DEFINER.
- Rollback comentado: DROP das duas tabelas e da trigger (não há dados prévios a perder); corpo da RPC reposto pelo 0285 (md5 `320be1df…`).

## c) Onde se calcula

- RPC `get_financial_position_base` (mesma 0289): acrescenta em cada `a_pagar.por_evento[]` um objeto `cenario` com os dados crus: modo, percentagem, receita_manual_bruta, viragem_real_dias, `previsao_fixada_liquida` (= `ticketing_baseline_net`) e `previsao_fixada_bruta` (conversão abaixo). Nenhuma decisão aqui.
- Edge (`future-coverage.ts`, função pura): aplica modo efetivo, percentagem, abatimento e soma. Mantém a regra de "fonte única": o a pagar continua a vir só da RPC.
- Conversão sem IVA → com IVA, por lote: fator = Σ(qty × preço) / Σ(qty × preço / (1 + iva_rate/100)) sobre os mesmos lotes de planeamento; `previsao_fixada_bruta = baseline_net × fator`. Sem lotes de planeamento → bruta null e "sem previsão" (nunca 6% fixo).
- Fase 1: só previsão fixada ou manual. Fase 2 (outra Issue): previsto corrente do simulador, que exige persistir um retrato no servidor (o cálculo vive só no cliente e é pesado); fora deste plano.

## d) Fórmula

Por evento futuro (raiz, somando filhos):

```text
modo_efetivo = 'real' se modo='real' ou (viragem_real_dias não nulo e dias_até_first_day <= N)
previsao_bruta = previsao_fixada_bruta ?? receita_manual_bruta ?? null
receita_considerada =
   real:      vendas_bruto
   previsao:  previsao_bruta null -> "sem previsão" (null)
              senão max(vendas_bruto, previsao_bruta × pct/100)
```

Abatimento do que já caiu na conta (nunca por evento no pool Ticketline):

```text
ja_recebido_total = saido_minimo_total   (Σ por bilheteira max(0, vendas − retido))
potencial_total   = max(0, Σ receita_considerada − ja_recebido_total)
por evento: só se fonte_vendas='unica' -> potencial = max(0, considerada − saido_minimo da sua conta);
            caso contrário potencial = null, rótulo "indeterminado (pool)"; entra só no total.
necessidade_com_receita = max(0, Σ necessidade_atual − potencial_total)   (duas leituras: com_sem_linha e sem_linha_cobre_bp)
```

Prova com hoje (todos em Real, 0%): considerada = 623.670,75; potencial = 623.670,75 − 109.050,59 = 514.620,16. Necessidade atual com_sem_linha 1.047.936,17 → com receita 533.316,01; sem_linha_cobre_bp 881.399,21 → 366.779,05 (valores do dia, a remedir no passo Live). Ver questão 47: com 0% o segundo número já difere do primeiro porque as vendas reais retidas passam a contar.

Eventos sem vendas e sem previsão: aparecem com "sem previsão", não somam zero silenciosamente (contados em `eventos_sem_previsao`).

## e) Ecrã

- Cartão Cobertura de futuros: dois números lado a lado, sempre: "Necessidade só com vendas reais" (a atual, intacta) e "Necessidade com receita prevista (projeção, não é recebível)". Por baixo: receita considerada, já recebido (saído mínimo), potencial por receber, nº de eventos sem previsão.
- Tabela por evento raiz: modo efetivo, %, origem da previsão (fixada / manual / sem previsão), considerada, potencial ou "indeterminado (pool)". Sessões/sub-eventos expandem sob a raiz; o cenário configura-se por evento/sessão; sub-evento sem linha herda o da raiz (questão 49).
- Saldo Geral não muda.

## f) Testes e prova Live

- PGlite (0289): defaults, checks, RLS por empresa/permissão, trigger de log (quem/quando, old/new), anon sem acesso, md5 do JSON da RPC sem o campo `cenario` igual antes/depois, conversão por lote com IVA misto.
- Vitest (`future-coverage`): 0%/Real → campos atuais byte-iguais e segundo número = fórmula; Previsão com max(vendas, prev×%); manual vs fixada; sem previsão → null; viragem automática por data Lisboa; fonte única vs indeterminado; pool Ticketline nunca rateado; Zod do contrato; ecrã com os dois números e rótulos.
- Live (query minha, predicado e origem registados): md5 do JSON atual sem `cenario` antes/depois = igual; com zero linhas na tabela, `cobertura_futuros` atual inalterado; simulação BEGIN…ROLLBACK de um cenário (ex.: Madrid 50%) sem resíduo; reprodução dos números de d).

## g) Classe, riscos, Publish, fora

- Classe: **R2 confirmada** (DDL em Live: tabelas + RLS + trigger + extensão da RPC; edge em produção).
- Riscos: rótulo confundir projeção com recebível (mitigado pelos dois números); previsão fixada desatualizada (Madrid BP provisório); dupla subtração com dinheiro_parado (evitada porque só se soma o potencial ainda não recebido); contrato: se o Zod for estrito, passa a p5-v4 e o ecrã atual falha fechado até Publish — deploy e Publish coordenados.
- Depende de Publish: diálogo de cenário e cartão com dois números. Edge reconstrói ao tocar `financial-position/index.ts`.
- Fora: previsto corrente do simulador (fase 2), A&B e patrocínios, rateio do pool Ticketline, alteração de BP/lotes/vendas, Saldo Geral.

Execução após Sim, com paragens: (1) reserva QUADRO; (2) 0289 + PGlite, parar e mostrar diff/md5/EXPLAIN; (3) aplicar em Live só com Sim; (4) edge + ecrã + vitest/tsc; (5) prova Live; (6) fecho documental e "pronto para Publish".

## Questões

- 47. Com 0%/Real, o segundo número inclui vendas reais ainda retidas (hoje 514.620,16)? A) sim, recomendado (é o que a regra 2 diz); B) 0% = segundo número igual ao primeiro.
- 48. Guardar em tabela própria (A, recomendado) ou colunas em `events` (B)?
- 49. Sub-evento sem cenário herda o da raiz? A) sim, recomendado; B) não, fica Real 0%.
- 50. Viragem automática: incluir já (A, recomendado, opcional por evento, vazio por defeito) ou deixar para depois (B)?
- 51. Quem edita o cenário: admin/manager (A, recomendado) ou também quem tem `view_financial_position` (B)?
