# P5b — Cobertura de eventos futuros (R1, sem DDL) — PLANO

## Ficheiros lidos
docs/INDEX.md, docs/QUADRO.md, docs/estado/estado-financeiro-e-tesouraria.md, docs/testes/p5-posicao-saldo-geral-20261027.md, docs/DECISIONS.md (D-ERP15, D-ERP27, D-ERP320, D-ERP323, D-ERP324), .lovable/memory/features/financial-position-base.md, event-cash-treasury.md, transitory-reason.md, ticket-office-sales-scope.md, src/lib/ticket-office-balance.ts, src/lib/financial-position-p5.ts, supabase/functions/financial-position/index.ts, supabase/functions/_shared/financial-position/assemble.ts, supabase/manual/0282 e 0283 (get_financial_position_base), supabase/migrations/20260611120000_event_cash_treasury.sql (get_event_cash_position).
Issues GitHub (#116, aportes/contas de acerto) não lidas nesta sessão: o 1.º passo após o Sim é lê-las e anotar no QUADRO.

## Constatação que condiciona o desenho
A RPC (0283) devolve `a_pagar.por_estagio` e `eventos_por_estagio` (com `first_day`, `started`), mas NÃO por evento. Por evento sem DDL só há duas vias:
- A (R1, sem DDL): calcular por evento em `_shared/financial-position/future-coverage.ts`, réplica fiel do predicado da RPC (bruto `amount*(1+iva_rate/100.0)`, BP só se `started` e estágio em_curso/em_fecho/fechado, max(custo−pago,0), cachê ativo substitui cache_module, exclusões: mães de rateio, estornos, sócio pagador, versões, overhead, transitórias à parte). Gate fail-closed: Σ por estágio dos eventos futuros tem de bater com `a_pagar.por_estagio` (dif. 0,00); senão o bloco sai `reconciliado:false` e campos dependentes `null`. Custo: segunda implementação da regra (risco de deriva; contraria o espírito D-ERP320), +2 leituras.
- B (R2, com DDL, recomendada a prazo): acrescentar `a_pagar.por_evento` à RPC numa migração 0284 e apagar a réplica. Só com Sim separado.
Proposta: A agora, com o gate, e B registada como questão.

## 1) Conjunto
Eventos raiz de `eventos_por_estagio` com estágio `planeamento` ou `em_curso` e `first_day >= hoje (Europe/Lisbon)`. Estágio e data vêm só da RPC; sub-eventos agregam ao raiz (filhos do master incluídos). Sem `first_day` → incluído com `data_indeterminada:true`.

## 2) Por evento (bruto c/IVA)
- vendas_bruto = Σ ticket_sales do raiz e filhos (via zonas/lotes), mesma fonte de get_ticket_office_sales.
- bp_total = Σ event_forecasts approved, version_id null, não transitória, sem overhead, bruto.
- despesas_pagas = Σ paid_amount de transactions expense, reversed_at null, não transitória.
- a_pagar_lancado = transações lançadas por pagar pela regra da RPC.
- bp_por_lancar = Σ por linha max(BP − pago − lançado, 0) pela regra da RPC, calculado sempre (mesmo se `started=false`), rotulado "não entra no a pagar da RPC porque o evento não começou".
- custo_total_projetado = despesas_pagas + a_pagar_lancado + bp_por_lancar.
- cobertura = vendas_bruto − custo_total_projetado.
- Nota fixa: "BP atual não é final" (BP de Madrid a substituir).

## 3) Aportes (duas lentes, nunca somadas)
- (a) aporte_hk = Σ income pago com transitory_reason `aporte_socio` do evento (todos, consórcios incluídos), dividido em `por_transferencia_conta_liquida` (conta destino líquida, skip_balance_check=false) e `direto_automatico` (restante, ex. conta de acerto). `linhas[]` com data, descrição, conta, valor — sem sinalizar "não evento".
- (b) aporte_mp = max(0, despesas_pagas − aporte_hk), rótulo "por resíduo".
- dinheiro_parado = `realized` de get_event_cash_position(company) para o evento, restrito a contas líquidas skip_balance_check=false; sem segundo cálculo. Se a função não separar por conta, campo `null` + motivo (não recalcular).
- vendas_acessiveis = vendas só em contas com uma única fonte futura e saldo livre; Madrid/ECI = 0 até ao evento; senão 0 com `indeterminado`.
- necessidade_financiamento = max(0, (a_pagar_lancado + bp_por_lancar) − dinheiro_parado − vendas_acessiveis).
- Pagamentos sem conta nem pagador: listados em `pagador_desconhecido[]`; nunca se atribui pagador.

## 4) Prova contra a RPC
Teste e verificação Live: Σ a_pagar_lancado(+BP quando started) por estágio dos futuros = `a_pagar.por_estagio[estágio].total` filtrado pelos mesmos eventos (dif. 0,00). Falha → `reconciliado:false`.

## 5) Por bilheteira (conta ticket_office)
vendas_eventos_futuros, retido_conta (só se saldos visíveis; senão null), saido_minimo = max(0, vendas_futuras − retido), eventos[] da conta, nota "mínimo: a bilheteira não reparte por evento antes do fecho". Retido via `_ticket_office_balance_raw`/fonte D-ERP15. Nunca ratear; evento sem fonte única = `indeterminado`.

## 6) Total `cobertura_futuros.total`
vendas_futuras, despesas_pagas_futuras, bp_por_pagar_futuros, saido_minimo_total, aporte_hk_total, aporte_mp_total, dinheiro_de_eventos_em_conta, necessidade_de_financiamento_total — lado a lado, sem soma cruzada. No Saldo Geral só uma nota "destinado a eventos: X" sem alterar caixa nem criar 2.º número (D-ERP27). Os totais P5 (D-ERP324) não mudam.

## 7) Contrato p5-v3
meta.version "p5-v3"; zod fail-closed aceita só p5-v3; hook com versão na chave; UI: bloco informativo no painel.
Testes (fixtures): Madrid aporte_hk 353.810,51 (249.000 transf. + 104.810,51 automático); aporte_mp 24.775,57; dinheiro parado 92.275,50; necessidade 195.699,01; Ticketline pool mínimo 109.050,59 (Ghanem indeterminado); BOL retido = vendas → saído 0; conta sem vendas futuras; evento sem vendas; saldos invisíveis → retido/saído null; gate de reconciliação falha → null; Saldo Geral inalterado; totais p5-v2 inalterados.

## 8) Deploy
Tocar `supabase/functions/financial-position/index.ts` (import do novo módulo + leituras) para forçar reconstrução, levando também o p5-v2 pendente. Confirmação: chamada autenticada devolve `meta.version = "p5-v3"`. Sem Publish (só 0 - Cowork); não declarar "publicado".

## 9) Riscos, carga, rollback, verificação
- Riscos: deriva da réplica (mitigada pelo gate); aportes mal etiquetados; BP provisório.
- Carga: +3 leituras agregadas por empresa (aportes, vendas futuras, get_event_cash_position) em paralelo ao motor; estimado +0,5–1,5 s sobre 6–8 s; o bloco tem deadline próprio e sai `incompleto` sem falhar o resto.
- Rollback: reverter o commit (volta p5-v2); sem dados.
- Verificação Live: SELECTs independentes por evento (vendas, BP, pagas, aportes) e por conta (retido, vendas futuras) contra o JSON; reconciliação por estágio = 0,00.

## Ficheiros
Novos: `supabase/functions/_shared/financial-position/future-coverage.ts`, `src/test/p5b-future-coverage.test.ts`, `docs/testes/p5b-cobertura-futuros-20261027.md`.
Alterados: `assemble.ts`, `financial-position/index.ts`, `src/lib/financial-position-p5.ts`, hook e painel P5, testes P5, `docs/QUADRO.md`, `estado-financeiro-e-tesouraria.md`, `docs/DECISIONS.md` (D-ERP325), memória financial-position-base.

## Perguntas para o Pedro
32. Via A (réplica com gate) agora e B (por_evento na RPC, DDL 0284) depois? Recomendado: sim.
33. Quem pagou cada pagamento: campo estruturado `paid_by` (empresa/sócio/fornecedor) na transação (DDL) vs. conta fictícia por pagador. Recomendado: campo.
34. Aportes por sócio: `partner_id` obrigatório em aporte_socio (DDL) vs. conta de acerto por sócio. Recomendado: partner_id.
35. Pagamentos entre empresas dos sócios fora do evento: conta corrente por sócio (fora do evento) vs. evento "Comuns". Recomendado: conta corrente.
36. `planeamento` sem data futura entra como `data_indeterminada` ou fica fora? Recomendado: entra marcado.
37. bp_por_lancar de eventos não iniciados deve contar na necessidade (diverge da RPC)? Recomendado: sim, rotulado.
38. Bloco visível só a admin ou com `view_financial_position`? Recomendado: mesma permissão.
