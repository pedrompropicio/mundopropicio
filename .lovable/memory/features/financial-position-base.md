---
name: Posição Financeira base (P4)
description: RPC get_financial_position_base — caixa, cartões, retido, a pagar/receber por estágio; acesso pela permissão view_financial_position (só admin por defeito)
type: feature
---
D-ERP320, migração 0282. Só leitura; resultado e parte da MP só no P5 (edge financial-position, motor _shared/settlement).
- Estágio = event_stage(raiz); sub-evento herda. historico/cancelado fora de tudo.
- BP conta só em eventos JÁ COMEÇADOS (primeira data, incl. sub-eventos e event_dates, ≤ hoje Lisboa) e em em_curso/em_fecho/fechado; futuros e planeamento: só transações lançadas por pagar.
- Bruto = amount*(1+coalesce(iva_rate,0)/100.0) — iva_rate é integer, nunca /100.
- A pagar linha = max(custo − pago, 0), excesso = alerta; contrato de cachê ativo substitui a linha cache_module do mesmo forecast_id.
- Sublinhas: lancado (tx por pagar), confirmado (pending_invoice válida), por_rever (sem decisão válida, conta), ajustado (conta), partner_paid (fora do total). Decisão válida = mais recente com saldo_at_review ±0,01 do saldo s/IVA.
- Excluir: mães de rateio (filhas ∧ installment_total nulo ∧ event_id nulo), estornos, paying_partner_id, version_id, overhead/exclude_from_result do BP. Transitórias em sublinha; 1.1.* fora do a receber.
- Caixa+cartões = _account_true_balance_raw (bank/cash/prepaid, sem skip_balance_check); retido = ticket_office_balances, ocultas à parte. Caixa e retido nunca somam. Acerto (contas other «Acerto …»/«Conta Corrente…») e caução a recuperar fora do total.
- Provas: docs/testes/p4-posicao-base-20261027.md; testes src/test/financial-position-base-p4.test.ts.
- Acesso (D-ERP321, 0283): permissão `view_financial_position` («Ver posição financeira») via has_permission; por defeito só admin; platform_admin sempre; override granted=false recusa. Saldos continuam só com admin/platform_admin/view_balances. Nunca voltar ao gate fixo por papel.

## P6a — painel (R1, sem Publish)
Página /erp/posicao-financeira e menu só com view_financial_position. Ano corrente Lisboa ou Todos (p_year null); Atualizar. Validação estrita; campos em falta/tipos errados dão erro; null de saldo nunca vira zero. Agregados apenas formatados. A RPC ainda inclui históricos/cancelados em eventos_por_estagio: o parser valida e remove esses grupos da apresentação sem alterar totais. Dashboard real Index.tsx passa showActiveProjections=false ao ResultsAnalysis; restante análise intacta. Resultado MP só P6b após P5. Provas docs/testes/p6a-painel-posicao-20261027.md; CI novo SHA pendente, não publicado.

## P6a-fix
Cartões de topo A pagar/A receber = a_pagar.total/a_receber.total (sem transitórias) + linha «+ transitórias de repasse»; posicao.a_pagar/a_receber validados, não apresentados. Um único seletor de ano (Todos=null). Formatador do painel com useGrouping "always" só neste módulo.

## P5 — Saldo Geral e resultado MP (D-ERP323)
Edge `financial-position` p5-v2 exclusivo; gate = RPC com JWT do utilizador; eventos da RPC (nunca event_dates). Motor só via computeStatementEngine/buildPartnerStatement. Estrutura exclui 10.3, 10.5.01, imposto_rendimento, financeiro; ano coalesce(payment_date,due_date,created_at). Sócios: base<0 a receber, total>0 por liquidar menos contratos P3 pagos. BP sem transação nunca soma 2×. Transitórias fora do Saldo Geral. Evento falhado → incompleto, totais null. Provas docs/testes/p5-posicao-saldo-geral-20261027.md.
P5-corr D-ERP324: resultado_mp_ano, socios.linhas/totais e sócios do Saldo Geral só em_fecho/fechado. em_curso/planeamento fora_dos_totais=true, motivo_fora=em_curso_projecao; eventos e socios_linhas em projecao_em_curso com totais só informativos («projeção pelo BP; não é recebível nem custo incorrido»). Histórico mantém so_bp fora. Nota obrigatória do Saldo Geral: «Eventos em curso: projeção fora do Saldo Geral». Alerta de acerto em fechado preservado.
P5b passo 1 D-ERP325 (0284): a_pagar.por_evento na RPC (regra única, sem réplica TS). Madrid: bp_por_lancar 265.640,50 (não 103.303,55), a_pagar_sem_linha 162.336,96. Passo 2 (bloco cobertura_futuros): aporte_socios (não aporte_hk), aporte_mp por resíduo = estimativa, necessidade = max(0, a_pagar_lancado + bp_por_lancar − dinheiro_parado) sem vendas acessíveis, dinheiro_parado via get_event_cash_position com JWT do utilizador.
P5b passo 2 D-ERP326 (p5-v3): cobertura_futuros informativo; dinheiro_parado = realized + movimento anterior ao corte (Madrid −6.724,50 + 99.000,00 = 92.275,50); negativo vai para caixa_mp_adiantado, nunca reduz a necessidade; duas leituras da necessidade lado a lado; bilheteira só mínimo por conta; cartão do painel lê sempre todos os anos.
