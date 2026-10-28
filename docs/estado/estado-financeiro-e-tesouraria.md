# ESTADO — Financeiro & Tesouraria

Atualizado: 28/10/2026 — #391 (Compromisso em transações, ⓘ e guia) pronto para Publish após CI, não publicado. 0286 (reembolso: pagamento fora do resultado, D-ERP329) aplicada e verificada em Live, modal atualizado, sem Publish. Participação Cloudscape (1.3.05) no Resultado da MP (D-ERP328, R1): pronto para Publish, não publicado. P5b p5-v3 e P6b (cachês/retido/Resultado MP) prontos para Publish/Verificação em Live; P6a/P6a-fix não publicados; P4/P4b em Live.

## Em que pé está

### #391 — Compromisso em transações, ⓘ e guia (28/10/2026, R1, pronto para Publish após CI, não publicado)
- Só ecrã + testes; sem DDL/DML/RPC/edge. Compromisso = Σ estágios (lançado + sem BP + só transações); saldo de BP por lançar = Σ (confirmado + ajustado + por rever); a soma tem de dar a_pagar.total (±0,01).
- ⓘ por toque em caixa, retido, a pagar, a receber, cada estágio, compromisso, BP por lançar, cachês, as duas necessidades, receita considerada, potencial e as duas linhas "com receita"; parcelas que não reconciliam mostram "Não reconciliado".
- Guia em docs/guias/guia-posicao-financeira.md (exemplos marcados "valores de 28/10/2026"), aberto pelo "?" do cabeçalho e por "Ver guia".
- Lógica pura em src/lib/financial-position-explain.ts; testes src/test/financial-position-explain-391.test.tsx 7/7; suíte 3029 PASS.

### P5c — receita prevista na cobertura (28/10/2026, pronto para Publish, não publicado)
- Parte 1: corpo get_financial_position_base corrigido para bytes do manual0289, md5 dbbf47c34e4b0c3896cb7a34561358e3, proacl preservado. Migração automaticamente numerada 0290_p5c_rpc_exact_manual_bytes; não é horizonte BP/#389. Pós-md5 JSON fica com Pedro.
- Parte 2: módulo puro planning-forecast importado pela edge e diálogo de bilheteira; corte proporcional por zona, lotes > manual > sem previsão, raiz soma descendentes sem duplicar, cenário próprio ou herdado da raiz, viragem opcional vazia. Receita considerada/potencial/necessidade com receita separados dos totais antigos; Real/0% mantêm JSON byte-igual. Ecrã mostra segunda leitura via mesma função pura quando não há bloco de previsão. Nenhum segundo motor financeiro.
- Modal na Bilheteira e Cobertura: modo, %, manual só sem lotes, dias de viragem, referência original e histórico; escrita usa RLS existente, só admin/manager (platform_admin como admin). Pool Ticketline sem rateio; Coala de outra empresa/35% MP fora. index.ts tocado para reconstrução, slots nomeados com teste de integração fixtures D-ERP328.
- 70 focados PASS; suíte final com maxWorkers2:3022PASS/6skip/11todo; tipos/build automático OK03:34:55 (não tsc manual). Timeout Newgang sob carga passou isolado10/10 e na suíte final. Pequena correção apenas de tipagem no teste0286 (query antes unknown), sem regra/SQL de reembolso alterados.
- Browser autenticado: desktop/mobile, sem overflow, cenário real Madrid19.185,74/reference17.105,22; guardar/reler50% com escrita interceptada apenas em fixture. Sem gravação real de cenários (catálogo final0cenários/0logs). Ecrã observado28/10: necessidade1047936.17/881399.21; receita624230.75/saído109050.59/potencial515180.16; segunda leitura532756.01/366219.05. Não substitui a medição formal por query de Pedro. CI remoto e pós-JSON pendentes. Sem Publish, horizonte BP/#389 ou outras DDL. DECISIONS intocado; relatório docs/testes/p5c-passo4-20261028.md.

### Posição Financeira — P5 implementado, aguarda Verificação em Live (D-ERP323)

- Edge function `financial-position` (p5-v2 exclusivo): gate = RPC get_financial_position_base com o JWT do utilizador (erros not_authenticated 401, company_forbidden/financial_position_permission_denied 403). Eventos = `eventos_por_estagio` da RPC (nunca event_dates); cancelado fora; Histórico só BP, marcado e fora dos totais.
- **P5b passo 2 R1 (D-ERP326):** edge financial-position p5-v3 com cobertura_futuros (só informativo; deadline 6 s; incompleto sem derrubar o resto). Fixtures: Madrid aporte sócios 353.810,51, aporte MP 24.775,57, dinheiro parado 92.275,50 (−6.724,50 + 99.000,00), necessidade 358.035,96 / 195.699,00; Ticketline mínimo 109.050,59. Por verificar em Live (p5-v3 e o p5-v2 que segue no mesmo deploy). Sem Publish.
- **Correção P5b 21:08 UTC:** segunda RPC com p_year=null exclusivamente para cobertura_futuros, incluindo futuros 2027 mesmo com year=2026; deadline 6 s abrange essa leitura e o bloco. Resto e motor mantêm o ano pedido. Nota destinado a eventos usa cobertura independente; contrato continua p5-v3. Medição do 0 anterior à correção: year=2026 só Madrid; year=null três futuros, necessidade 1.047.936,17 / 881.399,21 e dinheiro em conta 92.275,50. São referências do dia, não nova verificação do agente. Sem DDL/DML/Publish; reconstrução automática pelo index.ts alterado, confirmação Live pelo 0.
- **P5b passo 1 R2 (D-ERP325):** 0284 acrescenta a_pagar.por_evento à RPC base (só aditiva; md5 do resto igual antes/depois; +~6 ms). Madrid: a pagar 184.670,96; sem linha 162.336,96; BP 666.560,59; BP por lançar 265.640,50; pagas 378.586,08. Soma por estágio = por_estagio (fechado −0,01 de arredondamento). Issues #384/#385/#386 abertas. Passo 2 (bloco de cobertura) por autorizar.
- **P5-corr R1 (D-ERP324):** só em_fecho/fechado entram no resultado anual e sócios dos totais/Saldo Geral. em_curso/planeamento preservados com motivo em_curso_projecao; resumo, totais e socios_linhas só no bloco informativo projecao_em_curso. Prova do Pedro: Madrid −116.573,83 € de resultado MP e 376.816,12 € recebíveis de projeção saem dos totais; sem Madrid, recebíveis de sócios 138.846,44 €. Fixture equivalente verde, sem nova medição Live. Testes P5 23/23, suite 2951 PASS; validação automática OK. CI final e Live pendentes. Deploy automático de financial-position ao commit; não significa Publish da aplicação. RPC, estrutura e partner-statement intocados.
- Motor: `computeStatementEngine(bundle)` (extraído de buildPartnerStatement, mesma montagem) e `buildPartnerStatement` por sócio `settles`; sem segundo cálculo. Resultado MP = house.residual.
- Sócios: transferBase < 0 → a receber |base|; transferTotal > 0 → por liquidar (c/IVA se transfer_with_vat) − contratos P3 pagos (hoje 0); alerta em fechados.
- Estrutura: despesa sem evento, sem mães, não transitória, não exclude_from_result, não estornada, ano por coalesce(payment_date, due_date, created_at); exclui 10.3, 10.5.01, imposto_rendimento, financeiro/10.2.*; sem categoria e 2.x/3.x com alerta. Referência do Pedro (2026): 282 linhas / 285.791,26 €, por pagar 10 / 10.199,29 €.
- Saldo Geral: ativos = caixa + cartões + retido visível + ocultas + a receber + a receber de sócios; passivos = a pagar (BP sem transação só como «dos quais») + estrutura por pagar + sócios por liquidar. Transitórias só informativas. null sem saldos visíveis; null e `incompleto` se algum evento falhar (concorrência 4, limite 25 s).
- Por fazer: Verificação em Live (9 eventos vs partner-statement, diferença 0,00; tempo); depois Publish pelo 0 - Cowork. Ecrã = P6b.

### Posição Financeira — P6a implementado, aguarda CI e Publish do 0

- **P6a-fix R1 (27/10):** cartões «A pagar»/«A receber» mostram o total por estágio sem transitórias, com linha «+ transitórias de repasse»; um só seletor de ano («Todos» = null; ano seguinte até 5 anos atrás; defeito ano de Lisboa); valores sempre com separador de milhares. Pronto para Publish, não publicado.

- **P6a R1:** /erp/posicao-financeira, acesso/menu pela permissão existente, ano/Todos e Atualizar. Apresenta apenas agregados RPC; parse fail-closed, saldos nulos sem zeros, ocultas/transitórias/acertos separados, históricos excluídos, Resultado MP desativado. Projeções antigas desligadas só no dashboard (Index.tsx); componente e restante análise preservados. 33 testes novos; suite final 2923 PASS/6 skip/11 todo; tipos/build automático OK. Prova visual sintética 1280×1800 e 390×844, sem overflow/erros runtime. Sem contas Live/DDL/DML/migrações/edge/Publish. CI verde observado só no HEAD de arranque, não no SHA P6a; não declarar pronto para Publish até CI próprio verde. Relatório docs/testes/p6a-painel-posicao-20261027.md.

- **P4 (D-ERP320, 0282, 27/10/2026):** `get_financial_position_base(empresa, ano)` devolve num jsonb caixa por conta, cartões, retido (visíveis e ocultas à parte), a pagar e a receber por estágio, transitórias, contas de acerto e caução (fora do total) e alertas. BP só conta em eventos já começados; futuros só com transações. Números de 27/10: caixa+cartões 553.528,43 (= invariante, diff 0); retido visível 295.748,25 / ocultas 215.857,41; a pagar 1.007.914,78 (em_fecho 570.307,43, fechado 184.942,40, em_curso futuro 252.664,94) + transitórias 64.703,88; a receber 22.636,89 + 5.192,19. Resultado e parte da MP ficam para o P5 (edge function com o motor partilhado). UI P6a implementada, por publicar. Provas: docs/testes/p4-posicao-base-20261027.md.
- **P4b (D-ERP321, 0283, 27/10/2026):** acesso pela permissão «Ver posição financeira» (`view_financial_position`), configurável por papel e utilizador; por defeito só admin (platform_admin sempre). Saldos continuam só para quem vê saldos. Managers sem acesso até concessão. Provas: docs/testes/p4b-permissao-posicao-20261027.md.

- **P3 UI (R1, 27/10/2026, por publicar):** lista com badge de estágio (event_stage_list, uma chamada), filtro por estágio e «Mostrar históricos» (ocultos por defeito); detalhe com badge e painel «Estágio e fecho» só no master (checklist 4 blocos, Fechar evento só com ok, Reabrir fecho com motivo e Marcar/Remover histórico só admin); sub-evento mostra estágio do master e ligação. «Reabrir Evento» legado substituído por aviso quando fechado/histórico; fluxo de status e guards intocados. Preview Anitta: Em fecho, selos 0/3, BP 133 / 1.122.040,98 €, hard 0. Provas: docs/testes/p3-event-stages-ui-20261027.md. Publish só pelo 0·Cowork com CI verde.
- **P1b (D-ERP319, 0281, 27/10/2026):** sub-evento tem sempre o estágio do master; RPCs de estágio só no master; checklist do master agrega bloqueios dos sub-eventos. 16 sub-eventos com carimbos antigos ignorados (limpeza pendente do Pedro).
- 0280 em Live: quatro colunas nullable sem default, dez funções novas e guard/cleanup de reabertura; nenhuma linha existente alterada. `completed` sem closed_at significa em_fecho; fechado exige completed + closed_at. Caminho legado mantém-se e limpa carimbos ao sair de completed.
- Checklist servidor: selos/snapshot, cachê congelado, zero BP por rever e zero hard de event_close_blockers. Anitta: três selos em falta, 133 linhas por rever (1.122.040,98 €), sem cachê configurado/hard; não fechada nesta tarefa.
- Verificação Live (a)–(h): 60eventos/0carimbos/0resíduos; MP55 eventos:13em_curso/42em_fecho; ACL conferida;862funções existentes md5 agregado igual, +10novas. Teste fictício em rollback confirma guarda e cleanup. Local13/13; suite2849PASS/6skip/11todo.
- P2 backfill exclusivo do Pedro com bloco próprio e Corro?. Sem UI, deploy/Publish, crons ou envios. Prova autenticada real de escrita e CI remoto não verificados; nenhuma condição da checklist ficou nao_avaliado_no_servidor. Relatório `docs/testes/p1-event-stages-20261027.md`; funcionamento em `.lovable/memory/features/event-stages.md`.

### #335 — encontro de contas — FECHADA a 22/10/2026 (estado a 22/10/2026)
- **Live (instalado passo a passo, cada um com Sim do Pedro):** storage → núcleo → approval → status → invariants → balance → cash_position → cash_position_invariant → restore → kill_switch → trigger_watch/cash_watch → `transaction_offset_control_status()`. Níveis: N0=(t,t) aberto; N1=(f,t) encontros novos bloqueados, estorno disponível; N2=(f,f).
- **Cliente publicado (3 Publish a 22/10/2026, CI verde confirmado pelo Pedro):** modal, ficha de leitura, estorno só admin, leitura do controlo pela RPC; platform_admin = admin (a5e7e630); prévia de largura fixa (306bd4c5); 3.º Publish 55d64e09: coluna Valor visível nas linhas por explicar, invalidação explícita (OFFSET_INVALIDATE_KEYS) após aplicar e estornar, etiqueta "Aplicada no encontro" para par legado adoptado por grupo aplicado. Ecrãs confirmados pelo Pedro.
- **Prova em Live (consulta, 22/10/2026):** encontro do Estoril aplicado (grupo 91d78fbf-e4a6-44a6-9457-48be22a6827d) e estorno testado (grupo 443a1d8e-6934-43a2-9d20-f5e78cb68302); 7 vigias de caixa e invariante de saldo a 0; controlo em N1 depois de cada janela. Encontro em vigor: grupo 91d78fbf (applied) liga a linha a28f3424 (23.406,00 €) à receita b873559f (paga 30.996,00) e à despesa 0368bca9 (paga 7.590,00); par legado d2e1eaa3 continua no grupo estornado ("Por aplicar", correcto).
- **Estado actual:** controlo em **N1** (enabled=false, reverse_enabled=true); 1 grupo aplicado (91d78fbf). Encontro aberto só por janela (D-ERP293; cada janela N0 exige novo Sim). N2 só em incidente.
- **Issue #335 FECHADA pelo Pedro a 22/10/2026** (comentário e fecho feitos pelo 0 · Cowork).

### #337 — encontro fora do banco — Issue ABERTA (estado a 22/10/2026)
- **3a/3b PUBLICADAS a 22/10/2026** (commit 6c5549b7, CI verde confirmado pelo Pedro; deployment 11cbd0fc). Verificado pelo Pedro no ecrã: o método "Compensação" do modal de pagamento abre o assistente do encontro (passo Dinheiro; sem registar pagamento), com a origem pré-seleccionada; movimento de dinheiro opcional (encontro sem dinheiro no mesmo assistente); layout em ecrã estreito confirmado. A criação legada (método "Compensação" antigo e bloco da ficha) continua activa até à 3c.
- **Decisão do Pedro (22/10/2026):** aceitar que uma transação com método planeado 'compensation' abra o pagamento em Transferência; a compensação faz-se só pelo assistente. Auditoria do complemento 3b: 2 receitas aprovadas e em aberto (total 40.587,82 €, consulta de 22/10/2026) têm método planeado "compensation"; as restantes com esse método já estão pagas e não passam pelo modal de pagamento.
- **Por fazer:** 3c (retirar a criação legada; inclui as parcelas planeadas como "compensation", pré-existente) e 3d (teste real em Live, R2, janela N0 com Sim do Pedro). Procura em Live (só leitura, 22/10/2026): não existe hoje nenhum par receita/despesa em aberto da mesma entidade com valores iguais; o 3d precisa de um caso real escolhido pelo Pedro.
- **Abertos (fora da #335, próprios):** #337 (3c, 3d); #341; Bloco 8; TRUNCATE em user_permissions; trigger legado com NEW.supplier_id; melhoria da sugestão da entidade pela descrição do banco (R1, NÃO autorizada); #322/#323 intocadas.

- **#343 (tema da frente 4 · Vínculo BP-Transações), fechada a 22/10/2026:** especificação curta nas transações de Sessão de cartão/Camarim (helper _shared/session-specification.ts, sem Fornecedores/itens/Análise), SpecificationText na lista (2 linhas, expande ao clicar), 32 transações antigas encurtadas por DML autorizado (texto antigo em transaction_audit_log, changed_by 'Claude #343 (autorizado Pedro)'); Publish e teste feitos pelo Pedro. Resumo em `docs/estado/estado-vinculo-bp-transacoes.md`.

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



- **#333 12k — correção do anexo Ticketline, 23/10/2026 ~13:50 UTC: pronto para revisão, sem deploy.** Base 89e36e27. Causa: o scanner do anexo só lê número/data/total (nunca linhas); data dd/mm ambígua fica nula; campo de data vazio mostrava hoje no iOS; anexos apresentados 3 vezes. Correção: pendências de revisão parcial, confirmação bloqueada sem número/data/total/linhas, data em texto, lista única com imagens recolhidas, troca de origem limpa o candidato. Testes 12k antes 5 falham/depois 6/6; suite 2216 PASS; tsgo/deno 0. Extrair linhas do PDF depende do documento real. Sem deploy/Publish/DDL/DML. Relatório `docs/testes/issue333/fase12k-anexo-ticketline-correcao.md`. CI remoto não verificado.
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
P6b D-ERP327 (0285): a_pagar.caches na RPC: filhas 2.1.x de contratos ativos, por artista, com a retenção IRS à parte; informativo e já dentro do a_pagar.total. O ecrã mostra a composição do retido por bilheteira (função partilhada com o painel) e o Resultado da MP com e sem estrutura (p5-v3). Prova em docs/testes/p5b-p3-caches-retido-20261027.md.

### Reembolsos — pagamento fora do resultado (D-ERP329, 0286, 28/10/2026, EM LIVE)
- Trigger em reimbursement_notes força exclude_from_result=true ao ligar payment_transaction_id; guarda em transactions recusa retirar a flag enquanto ligada; invariante reembolso_pagamento_no_resultado (referência 0, hoje conforme).
- Modal cria o pagamento já com a flag. Sem DML histórico: os 44 pagamentos existentes já estavam conformes. Simulação BEGIN…ROLLBACK provou força e guarda, zero resíduo. Prova docs/testes/0286-reembolso-pagamento-fora-resultado-20261028.md. Sem Publish (cliente por publicar).

### Participação Cloudscape no Resultado da MP (D-ERP328, 28/10/2026, R1, pronto para Publish)
- `resultado_mp_ano` (p5-v3) ganha `participacoes.cloudscape` {valor, linhas, origem} e `total_mp = com_estrutura + participação`; campos atuais mantidos, motor incompleto → null como antes.
- Fonte: transações MP income/paid, sem evento, não transitórias, não exclude_from_result, não estornadas, categoria 1.3.05; ano = payment_date (fallback date); valor = paid_amount. Hoje 1 linha: 154.130,29 € (04/08/2026).
- Dinheiro já dentro do caixa: soma só ao resultado, nunca ao Saldo Geral nem ao caixa; não entra em eventos nem em estrutura.
- Ecrã: linha «Participação na Cloudscape (Coala)» + linha final «Resultado total da MP». Loader `loadParticipations` no index.ts (força redeploy); helper puro `sumParticipationRows` em assemble.ts.
- Testes: focados 50/50 (4 novos assemble + 1 ecrã); suíte 2997 PASS / 6 skip / 11 todo; tsgo limpo. Sem DDL/DML/RPC/Publish. CI do SHA final por observar; verificação em Live pelo 0.
- CORRETIVO (28/10/2026 ~01:10 UTC, mesma demanda, autorizado pelo Pedro): após o Publish a edge devolvia 500 `financial_position_unavailable` em todos os anos. Causa: desestruturação do `Promise.all` de index.ts desalinhada com o array — `futureCoverage` e `participations` trocados (o array tinha loadParticipations em 3.º e loadIndependentFutureCoverage em 4.º). Corrigida a ordem dos nomes; acrescentado teste estrutural `src/test/financial-position-index-loaders.test.ts` que vigia a correspondência nome↔posição (os testes anteriores só cobriam o assemble). tsgo limpo; focados 52/52; suíte 3001 PASS / 6 skip / 11 todo (2 falhas de índice de memória pré-existentes corrigidas: frontmatter de reimbursement-notes.md + índice regenerado). Edge corrigida; redeploy automático pelo toque em index.ts; verificação em Live pelo 0.
