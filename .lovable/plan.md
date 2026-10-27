# P5b Passo 2 (R1): bloco "Cobertura de eventos futuros" na edge financial-position (p5-v3)

Sem DDL, sem DML, sem Publish. A reserva no QUADRO é o 1.º passo depois do Sim. HEAD confirmado: db6b89c2f (migração 0284 aplicada).

## Ficheiros lidos
docs/INDEX.md, docs/QUADRO.md, docs/estado/estado-financeiro-e-tesouraria.md, docs/testes/p5b-p1-a-pagar-por-evento-20261027.md, docs/DECISIONS.md (D-ERP15, D-ERP27, D-ERP323/324/325), .lovable/memory/features/financial-position-base.md, supabase/functions/financial-position/index.ts (CONCURRENCY 4, DEADLINE 25 s, gate = RPC com JWT), _shared/financial-position/assemble.ts, src/lib/financial-position-p5.ts, src/hooks/useFinancialPositionP5.ts, src/lib/ticket-office-balance.ts, supabase/manual/0284, 20260611120000_event_cash_treasury.sql (get_event_cash_position: linhas por event_id com master_event_id = coalesce(parent_event_id, id), coluna realized), get_ticket_office_sales(p_account_id) (por event_id: Σ coalesce(total_value, quantity×unit_price) de ticket_sales via event_ticket_zones, filtrado por financial_account_id). Issues abertas: #384, #385, #386 (fora deste passo), #85, #303.

## 1) Conjunto
Da RPC: `a_pagar.por_evento` em que estagio ∈ {planeamento, em_curso} e (first_day ≥ meta.reference_date ou first_day nulo). first_day nulo → `data_indeterminada: true` (só em planeamento; em em_curso fica também marcado). A data de referência é a da própria RPC (Lisboa), nunca relógio do cliente.

## 2) Por evento (todos os valores em bruto c/IVA)
Da RPC, sem recálculo: bp_total, despesas_pagas, a_pagar_lancado, a_pagar_sem_linha, bp_por_lancar, started.
- vendas_bruto = Σ revenue de `get_ticket_office_sales(conta)` sobre todas as contas ticket_office ativas, para os event_id da árvore do raiz (raiz e filhos ligados por parent_event_id). Mesma fonte que a D-ERP15; o valor já é bruto (total_value).
- custo_total_projetado = despesas_pagas + a_pagar_lancado + bp_por_lancar.
- cobertura = vendas_bruto − custo_total_projetado.
- Nota fixa por evento: «BP provisório: o BP ainda pode ser substituído; não é o custo final.»

Dupla contagem: `a_pagar_sem_linha` são faturas lançadas sem linha de BP. Podem cobrir linhas de BP ainda por lançar. Mostram-se sempre duas leituras, nunca uma escolhida em silêncio:
- `com_sem_linha` (leitura prudente): a_pagar_lancado + bp_por_lancar.
- `sem_linha_cobre_bp`: a_pagar_lancado + max(0, bp_por_lancar − a_pagar_sem_linha).
O mesmo par aplica-se a custo_total_projetado, cobertura e necessidade.

## 3) Aportes (duas lentes, nunca somadas)
- aporte_socios: transações income, status paid, reversed_at nulo, is_transitory e transitory_reason = 'aporte_socio', event_id na árvore. Soma de paid_amount (ou bruto se pago sem paid_amount). Tudo conta, consórcios incluídos.
  - por_transferencia_conta_liquida: conta destino com tipo bank/cash/prepaid_card e skip_balance_check = false.
  - pago_direto_automatico: o restante (conta de acerto, skip_balance_check = true, ou sem conta).
  - linhas[]: data (payment_date), descrição, nome da conta, valor. Sem classificar descrições.
  - Nota: «o sistema não regista que sócio aportou (#385)».
- aporte_mp_estimativa = max(0, despesas_pagas − aporte_socios), rotulado «estimativa por resíduo; o pagador dos pagamentos sem conta é desconhecido (#384)».

## 4) Dinheiro parado e necessidade
- dinheiro_parado = Σ realized das linhas de `get_event_cash_position(company_id)` com master_event_id na árvore do raiz. É chamado com o cliente do utilizador (JWT), nunca com a service role. As contas com skip_balance_check = true já ficam fora pela própria função.
  - Árvores com mais de 2 níveis: master_event_id só sobe um nível, por isso a soma é feita pelo event_id contra a árvore completa.
  - Erro ou forbidden → bloco `incompleto: true`, campos null.
- necessidade_financiamento:
  - com_sem_linha = max(0, a_pagar_lancado + bp_por_lancar − dinheiro_parado)
  - sem_linha_cobre_bp = max(0, a_pagar_lancado + max(0, bp_por_lancar − a_pagar_sem_linha) − dinheiro_parado)
  - Rótulo: «inclui BP por lançar de eventos não iniciados; vendas retidas não entram».
- Madrid (factos do 0): com_sem_linha = 184.670,96 + 265.640,50 − 92.275,50 = 358.035,96. Sem_linha_cobre_bp = 184.670,96 + (265.640,50 − 162.336,96) − 92.275,50 = 195.699,00.

## 5) Por bilheteira (conta ticket_office ativa)
- vendas_eventos_futuros = Σ revenue de get_ticket_office_sales(conta) nos eventos futuros.
- retido_conta = saldo de `retido.visivel/ocultas` da RPC (mesmo valor da D-ERP15). Null quando meta.balances_visible = false.
- saido_minimo = max(0, vendas_eventos_futuros − retido_conta). Null se retido for null.
- eventos[] da conta com as vendas por evento. É só a origem; não é rateio.
- Nota: «mínimo: a bilheteira não reparte por evento antes do fecho».
- Por evento: `fonte_vendas` = "unica" quando todas as vendas futuras da conta são de um só evento raiz e a conta não tem vendas de outros eventos ativos. Caso contrário "indeterminado". Nunca se reparte o saído por evento.
- Contas sem vendas futuras não aparecem.

## 6) Total `cobertura_futuros.total`
vendas_futuras, despesas_pagas_futuras, a_pagar_lancado_futuros, a_pagar_sem_linha_futuros, bp_por_lancar_futuros, saido_minimo_total (null se algum retido for null), aporte_socios_total, aporte_mp_estimativa_total, dinheiro_de_eventos_em_conta, necessidade {com_sem_linha, sem_linha_cobre_bp}. Os valores ficam lado a lado e nunca se somam entre lentes.

Saldo Geral: só se acrescenta a nota «destinado a eventos futuros: X € dentro do caixa». O caixa não muda e não há segundo número de caixa (D-ERP27). Os totais P5/D-ERP324 e o Saldo Geral mantêm-se byte-idênticos.

## 7) Contrato e UI
- meta.version "p5-v3". O zod em src/lib/financial-position-p5.ts aceita só "p5-v3", é fail-closed e strict no bloco novo. O hook leva a versão na chave.
- `cobertura_futuros.meta`: { incompleto, motivo, nota_bp_provisorio }. Falha ou timeout do bloco → incompleto: true e campos null; o resto da resposta mantém-se.
- Deadline próprio: 6 s, dentro dos 25 s, com as leituras em paralelo ao motor.
- Painel P6a: um cartão informativo «Cobertura de eventos futuros» com totais e as duas leituras da necessidade, mais a nota do BP provisório. A UI completa fica para o P6b.

## 8) Deploy
- Tocar `supabase/functions/financial-position/index.ts`, onde entram o import do novo módulo e as leituras. Um commit só em `_shared` não republica a função (#116). Assim a função é reconstruída e leva também o p5-v2 pendente.
- O 0 confirma com uma chamada autenticada: meta.version = "p5-v3", existe `projecao_em_curso`, e socios.a_receber_total já não inclui Madrid (p5-v2).
- Secrets: só os já usados (URL, anon, service role, todos injetados). Nenhum novo; nada se pede nem se imprime.
- Sem Publish; o Publish é só pelo 0 - Cowork.

## 9) Carga, riscos, rollback, verificação
- Carga: são 3 leituras novas em paralelo:
  - get_event_cash_position: 1 chamada;
  - get_ticket_office_sales: 1 por conta ticket_office, cerca de 3 a 6;
  - aportes: 1 SELECT.
  Estimativa: +0,3 a 1 s sobre os 6 a 8 s atuais; medir duracao_ms antes e depois.
- Riscos:
  - BP provisório, rotulado.
  - Árvore com mais níveis, tratada pela árvore completa.
  - Contas de bilheteira com vendas de eventos passados misturadas: tratadas como "indeterminado".
  - JWT sem company ativa → bloco incompleto.
- Rollback: reverter o commit (volta a p5-v2). Não há dados.
- Verificação em Live (queries independentes do 0):
  - por evento: vendas por árvore em ticket_sales/zonas, aportes aporte_socio, Σ realized;
  - por conta: vendas futuras contra retido;
  - cada valor confrontado com o JSON; tolerância 0,01 por evento.

## Testes (vitest, fixtures sem credenciais)
- Madrid:
  - aporte_socios 353.810,51 (249.000,00 por transferência + 104.810,51 diretos/automáticos);
  - aporte_mp_estimativa 24.775,57;
  - dinheiro parado 92.275,50;
  - necessidade com_sem_linha 358.035,96 e sem_linha_cobre_bp 195.699,00.
- Ghanem e bilheteiras:
  - Ghanem no pool Ticketline: saido_minimo 109.050,59, fonte "indeterminado";
  - BOL: retido = vendas → saído 0;
  - ECI com uma única fonte → "unica", saído 0.
- Newgang sem vendas: cobertura negativa e vendas 0.
- Planeamento sem data → data_indeterminada.
- Saldos invisíveis → retido e saído null.
- get_event_cash_position negado → incompleto, campos null, resto intacto.
- Totais p5-v2 e Saldo Geral iguais aos de antes (comparação profunda), exceto a nota.
- Zod rejeita p5-v2; gate inalterado; o cartão aparece no painel.

## Ficheiros
- Novos:
  - supabase/functions/_shared/financial-position/future-coverage.ts (puro);
  - src/test/p5b-future-coverage.test.ts;
  - docs/testes/p5b-p2-cobertura-futuros-20261027.md.
- Alterados:
  - supabase/functions/financial-position/index.ts;
  - _shared/financial-position/assemble.ts (versão e nota no Saldo Geral);
  - src/lib/financial-position-p5.ts;
  - src/hooks/useFinancialPositionP5.ts;
  - componente do painel P6a;
  - testes P5 existentes (versão).
- Docs:
  - QUADRO;
  - estado-financeiro-e-tesouraria.md;
  - D-ERP326;
  - memória financial-position-base.

## Perguntas para o Pedro
39. Qual das duas leituras da necessidade aparece em destaque no cartão? Recomendado: as duas lado a lado, sem destaque.
40. A nota «destinado a eventos futuros» no Saldo Geral usa a soma do dinheiro parado dos eventos futuros, ou também a de eventos em curso já iniciados? Recomendado: só futuros.
41. Um evento em_curso cujo first_day já passou mas que continua com vendas futuras (multi-data) fica fora do bloco? Recomendado: fora, porque o critério é first_day.
42. A conta de bilheteira com vendas de eventos passados e futuros: o saído mínimo considera só as vendas futuras? Recomendado: sim, mantendo o mínimo pela fórmula dada.
43. O deadline do bloco fica em 6 s? Recomendado: sim.
