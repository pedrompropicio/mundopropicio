# ESTADO — Financeiro & Tesouraria

Atualizado: 09/10/2026 (ritual de fecho da frente; inclui o trabalho do chat financeiro-e-tesouraria de 08–09/10). Issues desta sessão: #285 resolvida; #284, #286 e #287 fechadas; #281 à espera de verificação.

## Em que pé está

### #335 — encontro de contas (estado a 22/10/2026)
- **Live (instalado passo a passo, cada um com Sim do Pedro):** storage → núcleo → approval → status → invariants → balance → cash_position → cash_position_invariant → restore → kill_switch → trigger_watch/cash_watch → `transaction_offset_control_status()`. Níveis: N0=(t,t) aberto; N1=(f,t) encontros novos bloqueados, estorno disponível; N2=(f,f).
- **Cliente publicado (3 Publish a 22/10/2026, CI verde confirmado pelo Pedro):** modal, ficha de leitura, estorno só admin, leitura do controlo pela RPC; platform_admin = admin (a5e7e630); prévia de largura fixa (306bd4c5); 3.º Publish 55d64e09: coluna Valor visível nas linhas por explicar, invalidação explícita (OFFSET_INVALIDATE_KEYS) após aplicar e estornar, etiqueta "Aplicada no encontro" para par legado adoptado por grupo aplicado. Ecrãs confirmados pelo Pedro.
- **Estorno testado:** grupo 443a1d8e estornado pelo Pedro ("Teste do Estorno"); por consulta: grupo reversed, 3 pagamentos reversed, documentos approved com 0 pago, linha a28f3424 unmatched sem ligações; vigias e invariante a 0.
- **Encontro em vigor:** grupo 91d78fbf (applied), janela N0 com Sim; linha a28f3424 (23.406,00 €) com receita b873559f (paga 30.996,00) e despesa 0368bca9 (paga 7.590,00); par legado d2e1eaa3 continua no grupo estornado ("Por aplicar", correcto); vigias e invariante a 0.
- **Estado actual:** controlo em **N1** (kill_switch, Sim do Pedro; confirmado pela RPC); 1 grupo aplicado (91d78fbf). Encontro aberto só por janela (D-ERP293).
- **#337 encontro fora do banco (R1 3a/3b, 22/10/2026) — pronto para Publish, aguarda CI e Publish pelo 0 · Cowork:** o método "Compensação" do modal de pagamento abre o mesmo assistente do encontro (entidade → documentos com a origem pré-seleccionada → Dinheiro → ordem → prévia) e chama `transaction_offset_execute`; dinheiro opcional (conta de banco + data não futura + valor, ou "Sem movimento de dinheiro"); `p_movement` = null ou `{account_id, date, amount}` assinado (entra > 0, sai < 0); request_id por tentativa; mesmo controlo e permissões da #335. Criação legada (bloco da ficha) intacta até à 3c. Keys acrescentadas: child-transactions, invoice-group-open-siblings, offset-launch-accounts. Suite 2148 PASS; tsgo 0. Por provar: nada em Live; teste real 3d é R2 numa janela N0 com Sim.
- **Abertos:** #337 (Publish da 3a/3b, teste real 3d em N0, retirada do legado na 3c); melhoria proposta, não autorizada: sugerir a entidade pela descrição do banco em "Conciliar manualmente" e no Encontro de contas; cada janela N0 exige novo Sim; #341 (R2); Bloco 8; lacunas do quadro-final; TRUNCATE em user_permissions; trigger legado com NEW.supplier_id; #322/#323 intocadas; N2 só em incidente.

### #336 — conciliação por dinheiro (21/10/2026)
- Motor (a/b/c), modo manual link, lista sem movimento e triângulo usam a soma das pernas pagas, não revertidas, não compensadas da conta do extrato; retenção/crédito deduzidos da perna. Leituras de pernas paginadas e em blocos de IDs; inclui transações cuja perna tem a conta mesmo que a transação tenha outra.
- Recurso a paid_amount só sem pernas, com conta coincidente e data efetiva estritamente anterior ao primeiro period_from da própria conta. Sem leitura/corte conhecido, falha fechado. Sem RPC nova, DDL, DML em dados ou Publish; generate-historical-transactions e reservas #322/#323 intocadas.
- 1.933 testes passaram na suite completa (6 skipped, 11 todo), incluindo 8 novos casos #336 e os 18 SEPA; build automático OK. Não foi executado tsc manual (validação automática da plataforma). Gate CI do SHA final ainda requer verificação no GitHub.
- Live SELECT: paid_amount <> 0, reversed_at IS NULL, COALESCE(payment_date,date) >= MIN(bank_statements.period_from) da account_id, sem payment_method <> compensation com status paid e reversed_at NULL. MP 0; Coala 10 / 29.629,84 €, todas Coala Festival Portugal 2026 com date/payment_date 09/08/2026. Não corrigidas nem abrangidas por fallback posterior ao corte.
- Consulta visual com sessão do Pedro: Santander MP 09–20/10, 0 transações sem movimento / 0,00 €, leitura sem erros; linha Casino 23.406,00 continua por explicar porque não houve gravação. Casino 30.996,00 = 23.406,00 + 7.590,00 provado exclusivamente em fixture; nenhuma conciliação real executada. #335/#337 não implementadas.

### SEPA com data de Lisboa (21/10/2026)
- Gerador pain.001: datas/carimbos em Europe/Lisbon, execução nunca anterior ao dia de Lisboa, avanço para dia útil preservado e revalidação no momento de gerar. Data inicial da lista alinhada; datas explicitamente escolhidas mantidas. 18 testes SEPA locais passaram com TZ=America/Fortaleza, incluindo transições DST. Sem DDL, DML ou Publish; aceitação pelo Santander não testada nesta sessão.

### Contratos de pagamento do cachê (20/10/2026)
- D-ERP288 revê D15: até 4 contratos por cachê, retenção IRS opcional por contrato (mãe própria para a AT), vencimento manual, adiantamentos indivisíveis. Migrações 0214/0215; painel "Contratos de pagamento" no cachê; o antigo botão "Gerar Transação de Pagamento" foi retirado. Testes: `supabase/tests/cache_contracts/run.sh` (PG local, 49 verificações) e `src/lib/__tests__/cache-contracts.test.ts`. Por verificar pelo Pedro em Live: ver relatório da tarefa.
- D-ERP288 adenda (20/10/2026, migração 0216): tecto = linha BP 2.1.01 da cidade (escolha quando há várias), contrato só após congelar o cachê configurado, adiantamento livre só antes de congelar, adiantamentos antigos só com evento em fecho (active + data passada). Entradas: modal de cachê (passo 2) e linha 2.1.01 do BP.
- D-ERP288 adenda 2 (21/10/2026, migração 0217): cancelar/alterar contrato limpa as dependências como a eliminação canónica e re-ancora a linha de BP; valor do contrato/adiantamento em € ou %. PG local 84 verificações.

### Resolvido a 10/10/2026

- **#305 — invariante `conta_cash_saldo_negativo` (D-ERP238).** Qualquer conta `type = 'cash'` com saldo negativo acusa erro (referência 0). Saldo = `_account_true_balance_asof_raw(id, NULL)`, o mesmo do Dashboard. Caso de origem: Conta Caixa a −6.120,00 (`initial_balance_date = 2026-08-31` com `initial_balance = 0,00`), corrigida a 10/10/2026, saldo agora 0,00. Hoje: 0, conforme. Disparo provado numa transacção anulada.

### Resolvido nesta sessão (09/10/2026)

- **#285 — divisão inteira no cálculo do bruto.** Causa encontrada e corrigida: `transactions.iva_rate` é `integer`, e `/100` era divisão inteira. Migração `0045_derp198` em `reimbursement_propagate_payment` e `get_partner_settlement_summary`. **8 linhas** de notas de reembolso corrigidas (**+47,77 €** de IVA). Regra em `.lovable/memory/features/iva-rate-divisao-inteira.md`.
- **Rateio da Meta Apr-26** (fatura 252466632, **9.995,23 €**, IVA 0 por autoliquidação Art. 196.º). 4 filhas tinham IVA 23 e `split_percentage` NULL, o que explicava o `paid_amount` a zero. Corrigidas. Saíram **1.726,99 €** de custo fantasma de IVA de 4 eventos: Ivete Clareou **786,37**; SM-Porto **432,55**; SM-Lisboa **314,75**; Turnê Simone Mendes **193,32**.
  - A vigia `rateio_filhas_nao_somam_a_mae` passou a comparar também o bruto (migração `0051_derp203`), além das bases. A amostra traz `bruto_mae` e `soma_bruto_filhas`. Hoje: 0, conforme.
- **R-015 e R-016:** `paid_amount` a **74,20** e **360,76**, provado pelo extrato de 30/07. Encerra o achado do KPI "Liquidado" da lista de 29/07.
- **Stage Hands** a **1.008,60** e **Social Midia** a **861,00**, provado por fatura e extrato de 10/04.
- **Invariante `pago_abaixo_do_bruto`** criada: tolerância ±0,02 €, `reference_count` 1 (Portagens da Aquileia).
- **#284** (duplicação de fatura) e **#286** (`n_transactions`) fechadas.

### Fornecedores (08–09/10/2026)

- **Fornecedores duplicados:** 16 fichas juntadas em 13. MP: SGEHR com 2 IBANs e Pop Cargo; Coala: 11 fichas. Transações e referências repontadas; duplicadas inativas com a nota "09/10/2026: ficha duplicada, unificada em <id>".
- **Sharlene:** unificada na ficha `2a0cb6d5`, NIF **239147057**, IBAN 1 Millennium e IBAN 2 Santander; `34fc5324` inativa.
- **Aviso de fornecedor parecido (D-ERP199)** e **fila de revisão (D-ERP201):** `supplier_similarity_flags`, com revisão em `/admin/fornecedores-parecidos`. NIF compara sem prefixo de país de duas letras quando o restante é numérico. Backfill de **50 pares** (MP **6**, Coala **44**); referência da vigia `supplier_similar_por_rever` = **50**.

### Camarim e pagamentos (08–09/10/2026)

- **#287 fechada (D-ERP200):** a perna da conta da sessão de camarim acompanha o pagamento da perna do banco pelo trigger `zz_camarim_session_leg_follows_bank`. Vigia `camarim_adiantamento_sem_entrada` = **0**. Corrigidas à mão antes: SM Porto `a655f5de` (**1.000 €**, **02/10**) e SM Lisboa `9a04aafe` (**500 €**, **30/09**).
- **Sharlene, FT 1A2601/40:** **2.054,29 €**, SM Porto, linha `467874e5`. Duas linhas no grupo de fatura `874ab201`:
  - `ae79cfb2`: **813,01 € + IVA = 1.000 €**, paga em **02/10** pela conta do camarim SM Porto, com o adiantamento entregue pela Liliam.
  - `ba23d195`: **857,14 € + IVA = 1.054,29 €**, aprovada, a pagar para o Millennium.
  - PDF anexado reconstruído da foto. "Pago por Cartão de Débito" na fatura é texto fixo do programa dela, não é pagamento. Sessão de camarim SM Porto `cacd82fd` fechada sem integração.
- **Camarim SM Lisboa `0403d64e`:** aberta, adiantamento de **500 €** recebido, sem recibos lançados; segue o fluxo normal.
- **Pagos e confirmados:** acerto Ivete de **765,85 €** à Liliam (lista de **01/10**); Juliana **R-039 (1.140 €)** e **R-040 (350 €)**.
- **Empréstimo Santander:** prestações lançam-se pelo valor cheio em **10.2.02** (prefixado, não muda).

### Testes — encaminhamento a 09/10/2026

- **#288, #289 e #290:** abertas a 09/10 a partir de testes vermelhos; isoladas com `skip` e colocadas na fila do chat plataforma-e-infra. Registo do encaminhamento nesse momento; o estado atual dos testes acompanha-se nessa frente.

## A trabalhar agora



- **#333 — leitor seguro aplicado, 17/10/2026: operações desligadas; não aceitação completa.** CI da reparação39073230691 success confirmado independentemente pelo controlador. Nova0192/registry194, SQL exata, leitor service-only; deploy só standalone-attempt-333, versão7 observada; service false/false, recusas anon e CORS intactos.1368 testes PASS; build automático OK. Baselines financeiros por conteúdo separados de roles e componentes técnicos iguais antes/depois; sem faturas/efeitos financeiros/fixtures/ativação/Publish. Endpoint autenticado e aceitação seguinte pendentes; #323 preservada; Issue/reserva abertas. Prova26 em `docs/testes/issue333/26-leitor-capacidades-aplicado.md`.

## Em aberto, por decisão do Pedro

- **Backfill das 526 transações liquidadas sem `account_id` e sem `transaction_payments` (1.247.597 €).** Decisão separada — não corrigir sem instrução. A invariante `paid_sem_pagamento` está em erro com 157 linhas por causa disto.
- **#281:** verificação à espera do primeiro lote SEPA com linhas por liquidar.
- **Portagens da Aquileia, 2,58 €, Coala 2026 encerrado:** excepção aceite, não se toca.
- **Cartão 8363:** submeter os ~975 € da viagem do Ghanem antes de a sessão fechar.
- **Sharlene `ba23d195`, 1.054,29 €:** pagar por lista para o Millennium.
- **Seguros do Plenitude, 72,33 € e 65,65 €:** pagos a 09/10.
- **Fornecedores parecidos:** rever os **50 pares** em `/admin/fornecedores-parecidos`.
- **Pagamento à Sharlene de 08/04:** aviso **1.162,25 € vs 1.162,35 €**, a confirmar quando o extrato de abril entrar.

## Onde ler mais

- `.lovable/memory/features/iva-rate-divisao-inteira.md` — regra `/100.0` para qualquer bruto a partir de `iva_rate`
- `.lovable/memory/features/invariante-pago-abaixo-do-bruto.md` — regra, tolerância e referência aceite
- `.lovable/memory/features/invariant-monitor.md` — motor das vigias e referências
- `.lovable/memory/features/payment-account-ownership.md` — as 526 liquidadas sem conta nem pagamento (sem backfill)
- `.lovable/memory/features/payment-amount-invariants.md` — soma de pagamentos e `paid_amount` nunca excedem o bruto
- `.lovable/memory/features/card-sessions.md` — modelo D17 e sessões de cartão
- `.lovable/memory/features/supplier-lifecycle.md` — fornecedores parecidos (D-ERP199/D-ERP201)
- `.lovable/memory/features/camarim-integration-flow.md` — fecho e integração das sessões de camarim
- `docs/DECISIONS.md` — D-ERP198 (#285), D-ERP199, D-ERP200, D-ERP201
- **#333 — testes autenticados Live, 17/10/2026 23:20 UTC: zero efeitos financeiros.** Matriz37/37 com contas fictícias banidas; hashes agregados de transactions, transaction_payments, event_forecasts, standalone_invoices e financial_accounts IGUAIS antes/depois; settings vazias e gates false. Sem faturas/TX/BP reais ou fictícios. Prova28 em `docs/testes/issue333/28-testes-autenticados-isolamento-live.md`.
