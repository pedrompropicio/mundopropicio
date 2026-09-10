# ESTADO — Financeiro & Tesouraria

Atualizado: 2026-09-09 · Issues abertas: #91, #92, #124, #125, #126, #127, #134, #135, #149, #151 · #90 fechada a 09/09 (fonte única do saldo + skip_balance_check respeitado) · #93 fechada por decisão do Pedro (não reabrir a auditoria do paid_amount)

## Em que pé está

- **Conciliação bancária — o lado do banco entrou no sistema (09/09).** Tabelas novas `bank_statements` e `bank_statement_lines` (a linha original fica em `raw`), permissão `manage_bank_reconciliation` (admin e manager), ecrã `/conciliacao-bancaria`. Parser do extrato Santander "tabulado Excel" (`;`, latin-1, CRLF, 11 colunas, sinal colado e vírgula decimal) em `src/lib/bank-statement/parse-santander.ts`. Identidade da linha por `line_hash` (conta + data mov. + data-valor + descrição normalizada + valor + **saldo após o movimento**), única por conta: reimportar o mesmo ficheiro não cria uma única linha nova. Um ficheiro cuja cadeia de saldos não feche é **recusado**, dizendo a linha onde parte; se o saldo de abertura não bater com o `initial_balance` implantado (D-ERP25) importa mas **avisa em destaque**. Conciliação em três camadas, parando na primeira (lote SEPA por `payment_list_sepa_exports` — total + `msg_id` na descrição, ligando às N transações do lote; valor exato contra `paid_amount` a ±5 dias; descrição por Dice ≥ 0,8 com valor ao cêntimo, motor agora com casa única em `src/lib/string-similarity.ts`). A conciliação **só liga**: nunca liquida, nunca muda status, nunca escreve `paid_amount`, e não cria transações. Ao lado das linhas por explicar, com o mesmo peso, a lista de **transações pagas sem movimento no banco** — a classe de erro dos Bombeiros (1.328,45 € a 11/08). No topo, o triângulo: abertura → movimentos → saldo declarado → diferença por explicar, em vermelho enquanto não for zero. **Nada foi importado** — o ficheiro é passado pelo Pedro. Decisão em D-ERP28; funcionamento em `.lovable/memory/features/conciliacao-bancaria.md`. Lote seguinte (lançamento automático das linhas sem contrapartida) na issue #151.
- **Diferença conhecida no Santander Totta.** Corte a 31/08/2026 com 122.363,05 € implantados; sistema a 407.199,12 € e banco a 439.403,92 € em 09/09 — 32.204,80 € de movimentos de setembro por lançar. É exactamente esta diferença que a conciliação passa a tornar visível e impossível de acumular em silêncio.
- **Conta gerencial (`financial_accounts.is_accounting`).** Flag nova com default `true`; a conta "Pgto Mágicos Acerto Madrid" foi marcada como gerencial. A edge function `generate-accountant-zip` exclui transações dessas contas (query principal + ramo de notas de reembolso), mantendo o filtro `transaction_documents.is_accounting = true`. Efeito: 11 transações e 10 documentos fora do ZIP. Na transação a marca é herdada e apenas informativa (badge "Conta não contábil") — não existe campo em `transactions`.
- **Invariantes de valor pago reforçadas na BD.** `validate_installments_total()` deixou de depender de cronograma: INSERT recusa qualquer excesso sobre o bruto (`amount * (1 + iva_rate/100)`, tolerância 0,01 €); UPDATE só recusa se a nova soma for maior que a anterior e exceder o bruto (linhas legadas continuam editáveis e removíveis). Novo trigger `trg_validate_paid_amount_not_exceeds_gross` em `transactions` com a mesma lógica de legado. Ambos testados em Live.
- **`TransactionPaymentModal` endurecido.** Relê `paid_amount` da BD imediatamente antes de submeter (o snapshot em memória permitia duplicar); tolerância apertada para `>= 0,01`; todos os inserts em `transaction_payments` (incluindo irmãs de grupo-fatura e `BatchPaymentModal`) leem `{ error }` e lançam.
- **Editor ganhou correção de pagamentos.** Pode alterar a data e apagar um pagamento registado; valor, conta e método continuam só para admin/manager. Nenhuma ação disponível em evento fechado (`status='completed'`). Auditoria por campo mantida.
- **Lista de Contas a Pagar sem escrita direta.** "Marcar como Pago" voltou a ser estritamente visual (grava só `payment_list_items.manually_marked_paid`). "Liquidar (N)" passou a usar o `BatchPaymentModal` com conta obrigatória, uma linha em `transaction_payments` por transação e data inicial de `payment_lists.payment_date`. Filhas de rateio recebem `paid_amount`, `status` e `payment_date`, mas nunca `account_id` nem linha de pagamento (evita contagem dupla no saldo).
- **Faturas avulsas — aba Conferência.** Seletor de mês com lista vinda de consulta própria (independente do limite de linhas), abertura no mês mais recente com faturas, grupo próprio "Sem data da fatura" sempre no topo, consulta por intervalo quando há mês escolhido, aviso quando o limite de 1000 é atingido em "Todos os meses", e "Exportar mês" a consultar o período completo em vez das linhas em memória. Scanner/OCR intocados.
- **Faturas Ads — ciclo completo, em produção.** Tabelas `public.ads_invoice` e `public.ads_invoice_line`, bucket privado `ads-invoices`, edge functions `ads-invoice-ingest` (`parse_meta`, `propose_google`) e `ads-invoice-apply` (`confirm`, `generate`, `reopen`, `revert`), função `public.resolve_ads_event`, colunas `events.ads_allocation_level` e `events.ads_match_aliases`. O ecrã chama-se **Faturas Ads** (rota inalterada, `/faturas-plataformas`). Validado contra as cinco faturas Meta de abril a agosto e três meses de Google, todos a fechar ao cêntimo; 98% do valor é atribuído por regra explícita. A 07/09 fecharam-se as três lacunas que impediam corrigir um erro de matching: atribuição manual de evento por linha (`match_source = 'manual'`, com `matched_by`/`matched_at`), reabertura de uma fatura confirmada, e reversão de uma fatura já aplicada. Versão em produção confirmada por invocação: `v2.3_revert_guards`.
- **Tráfego pago da Anitta fechado.** A linha de BP "Trafego Pago (MP e Anitta)" de 13.551,12 € decompõe-se ao cêntimo em 10.126,02 € de faturas Meta Ireland (Fev 2.249,10 · Abr 1.312,02 · Mai 1.864,60 · Jun 797,44 · Jul 3.902,86) mais 3.425,10 € de pagamentos pela conta brasileira (1.730,30 + 1.694,80). Faltavam lançar Fevereiro e Abril, 3.561,12 € — lançados a 07/09 como liquidados. A rubrica 3.2.01 Digital da Anitta passou de 15.701,96 € para **19.263,08 €**, com o realizado da linha a 13.551,11 € contra BP de 13.551,12 €. O resultado do evento não mudou: a despesa do fecho é a soma das linhas de BP, e a linha já continha estes valores. Ficaram ligadas ao `forecast_id` as quatro transações de tráfego que estavam órfãs.
- **Fonte única do saldo de conta.** `src/lib/account-balance.ts` exporta `computeAccountBalance(account, transactions, adjustments): number | null`, que devolve `null` quando `financial_accounts.skip_balance_check = true`. Consumidores migrados e a mostrar "Sem controlo de saldo"/"não controlado" em vez de número: `FinancialAccounts.tsx`, `TransactionPaymentModal.tsx`, `BatchPaymentModal.tsx`, `TransferFormModal.tsx`, `card-account-balance.ts`, `card-session-balance.ts`, Extrato (ecrã e exports Excel/PDF, com "N/C") e Projeção de Tesouraria (contas não controladas ficam fora, com aviso nomeando-as). `get_event_cash_position` deixou de somar contas com `skip_balance_check`, e `get_event_cash_position_invariant` passou a comparar o mesmo universo (também sem contas não controladas e com a data de corte aplicada) — antes dava `is_balanced` falso por construção. Os modais incluem os ajustes de retenção/crédito, terminando uma divergência de 460,00 € face ao ecrã de Contas. Nas sessões de camarim o saldo mostrado é o da sessão, não o da conta. Nenhuma validação nova foi introduzida. Issue #90 fechada.
- **Data de corte do saldo inicial (09/09).** `financial_accounts.initial_balance_date` (date, nullable): o `initial_balance` é o saldo ao FECHO desse dia, e movimentos com `COALESCE(payment_date, date)` igual ou anterior ao corte deixam de somar. A `NULL` nada muda. A regra vive na fonte única e propaga aos ajustes de retenção/crédito, ao Extrato (o corte vale na abertura E em todas as linhas — o que é anterior ao corte já está dentro do saldo inicial e não volta a somar; a abertura funciona sem Data Início, as linhas passaram a usar `paid_amount` como a fonte única, e o cabeçalho mostra "Saldo implantado a <data>: <valor>" no ecrã e nos dois exports), às sessões de cartão e a `get_event_cash_position`. Na página de Contas há um modal por conta, **só admin**, que mostra lado a lado "sistema calcula hoje" e "depois de implantar" antes de gravar, e registra autor e hora em `system_audit_log`; o campo de saldo inicial do formulário normal passou a ser só de leitura para não-admin. **Nenhum valor foi implantado** — os saldos do banco são introduzidos pelo Pedro. O carimbo de estorno passou a ser limpo nos TRÊS caminhos de liquidação (`TransactionPaymentModal`, `BatchPaymentModal` e `MarkInstallmentPaidModal`, este último escrevendo em `transactions` só para isso). Decisão em D-ERP25.
- **Estorno que volta a ser pago (09/09).** Os textos do estorno em `PaymentTimeline.tsx` diziam que a transação "volta a A pagar"; o que a RPC faz é pôr `pending`, e o picker das listas exige `approved`. Passam a dizer que volta a **Aguardando e tem de ser aprovada de novo**. E ao liquidar de novo uma transação com `reversed_at`, o carimbo limpa-se (`reversed_at` e `reversal_kind` a NULL, `reversal_reason` e auditoria mantidos), no modal individual e no pagamento em lote — senão o custo saía do banco mas desaparecia do BP e dos agregados do sócio, que filtram `reversed_at IS NULL`. Caso real: Bombeiros `65ac490d-1d0c-4d4d-a155-395bc2593c45`, Henry&Klaus Lisboa (dado não corrigido).

- **Conta-espelho de sócio (07/09).** `financial_accounts` ganhou `partner_id` (→ `event_partners`) e `mirror_partner_aporte`. Numa conta com essa flag, o trigger `trg_sync_partner_aporte_mirror` cria automaticamente um aporte (`10.1.01`, receita, transitório, IVA 0) de valor igual a cada despesa paga por ali, atribuído ao sócio da conta, com evento do sócio e `flow = partner_settlement`. A ponte `partner_aporte_mirror` liga despesa↔aporte e garante idempotência: o espelho sincroniza com o `paid_amount` — se este mudar ou a transação for estornada ou apagada, o aporte acompanha ou desaparece. Aplicado à conta "Pgto Mágicos Acerto Madrid": 18 espelhos, 56.761,50 € de aporte do Henry Vargas, saldo da conta a 0,00. Os modais de pagamento avisam antes de confirmar que a conta gera aporte automático. Rubricas novas `10.1.04 · Empréstimo a Sócio` e `10.1.05 · Reembolso de Empréstimo de Sócio`, que ao contrário das 10.1.01/02/03 não exigem sócio de evento.

- **Grupos de fatura — porta fechada ao agrupamento errado (08/09).** Depois do incidente dos três talões da BP Estoril com o mesmo nº `FS 270072003/167876` (dois eram o mesmo talão duplicado), o agrupamento automático por fornecedor + nº de fatura só junta linhas que **partilham o documento anexo** ou que **não têm documento nenhum**. Com documentos diferentes aparece o diálogo "É mesmo a mesma fatura?" e nada é escrito sem resposta; o botão manual "Agrupar fatura" também compara os anexos e exige uma segunda confirmação quando divergem. O número lido no documento substitui o que estiver escrito à mão, com aviso. Há botão "Desagrupar fatura" na edição, e o aviso de eliminação lista nome, data e valor das irmãs do grupo. O aviso de duplicado por fornecedor + nº passou a consultar a base filtrada (já não dependia de um lote de 50 linhas, que deixava passar fornecedores grandes como a CORNUCOPILANDIA com 38 linhas na mesma fatura) e só dispara quando o **valor também coincide** — nº igual com valor diferente é a fatura legítima repartida por várias rubricas de BP. Decisão em D-ERP17.
- **Auditoria dos grupos existentes, em produção.** Tabela `invoice_group_audit`, edge function `audit-invoice-groups` (`verify_jwt = true`, só admin/platform_admin) e painel Admin → "Auditoria de grupos de fatura" (`/admin/auditoria-grupos-fatura`). O dry-run é incremental porque o OCR é lento (3 grupos por chamada, o painel repete até acabar) e nunca altera transações; o apply **só desagrupa, nunca junta**, e está preso ao `run_at` mostrado no ecrã — sem ele a função recusa, para não apanhar uma corrida antiga. Última corrida: **18 grupos ok, 0 linhas a desagrupar, 22 por rever à mão** (issue #134). O modo apply nunca foi corrido.

## A trabalhar agora

Nada em execução.

## Próximo passo concreto

Implantar os saldos reais do banco: por cada conta, abrir o modal de implantação em Contas, pôr a data de corte (por exemplo o fecho de 31/08) e o saldo do extrato nessa data, confirmar no ecrã que o "depois de implantar" bate com o banco, e só depois desligar o `skip_balance_check` dessa conta. Começar pelo Santander, onde o extrato a 01/09 dizia +107.257,71 EUR. Nenhum valor foi implantado pelo sistema.

Depois:

Percorrer no painel de Admin as 22 linhas por rever da auditoria de grupos de fatura (#134): 7 sem documento anexo, 9 sem número legível, 2 proformas, 3 comprovativos de transferência e 1 outro caso. Decidir à parte a linha de 27.318,75 € do EVIL ANGELS II, cujo único anexo é a nota de crédito NC A1/175 dentro do grupo da fatura FAC A1/4831 (#135). Depois disso, testar em Live o ciclo novo das Faturas Ads, por esta ordem: (1) abrir a fatura 254484037 de julho e carregar em "Gerar lançamentos" — tem de devolver 409 e listar os quatro lançamentos manuais da Delia de 03/08; (2) reabrir uma fatura confirmada e verificar que as campanhas Meta destrancaram; (3) reatribuir uma linha à mão e confirmar o carimbo de autor no tooltip. A reversão não se testa em Live enquanto não houver uma fatura aplicada que se possa perder sem custo.

## Bloqueios

- **(a) Regra dos cupões da Meta por decidir.** Em maio foram abatidos à Simone, em junho à Ivete; não há regra escrita.
- **(b) Regime de IVA das faturas Google por confirmar.** Não existe nenhuma transação de Google no sistema.
- **(c) 47.429,39 € de tráfego por lançar.** Abril: a mãe de 9.995,23 € estava na rubrica errada (10.8.07 Outros) e foi corrigida para 3.2.01 Digital a 07/09; tem agora uma filha (Anitta, 1.312,02 €) e faltam ratear 8.683,21 €. Agosto: 38.746,18 € da fatura de 02/09, dos quais 34.702,85 € são do Raphael Ghanem.
- **(d) Jan-26, Fev-26 e parte de Mar-26 nunca entraram no sistema — 71.989,54 €.** Issue #124. Quase tudo de eventos anteriores ao arranque do ERP e nunca importados.

## Dados legados deixados intactos por decisão do Pedro

- 3 transações com o pagamento registado duas vezes em `transaction_payments`.
- Transação "Aluguel espaço": `paid_amount` 11.842 sobre bruto de 10.086.
- 526 transações liquidadas sem conta e sem registo de pagamento (1.247.597 EUR).

Não corrigir sem decisão explícita.

## Diagnóstico aberto (números apurados em Live a 30/08/2026)

- 624 de 706 transações liquidadas não têm linha em `transaction_payments` (issue #91).
- 526 liquidadas sem `account_id`, das quais 395 (75%) vêm da Lista de Contas a Pagar; 218 itens marcados com "Marcar como Pago" ficaram todos `paid`.
- Saldo do Santander apurado por SQL a 07/09/2026: **-218.115,20 EUR** (-217.655,20 com os ajustes de retenção). O extrato bancário a 01/09 dizia **+107.257,71 EUR**. A conta tem `initial_balance = 0` e apenas 2 entradas contra 113 saídas — a diferença é receita por carregar, não erro de cálculo. O `skip_balance_check` foi ligado nesta conta para desbloquear pagamentos, não por desenho. As contas de bilheteira (Blueticket, BOL, Ticketline, Fever) não têm uma única entrada registada — a receita de bilhetes não está modelada como entrada de conta.
- `skip_balance_check` passou a ser respeitado em todos os sítios do saldo de conta, incluindo export do Extrato, Projeção de Tesouraria e `get_event_cash_position` (#90 fechada). O Fluxo de Caixa mostra aviso de que o acumulado do período não é saldo, mas continua a somar movimentos localmente — é relatório de movimentos, não de saldo. `CardSessions.tsx` calculava o saldo à mão — e era o saldo CONTABILÍSTICO da conta do cartão, não o da sessão; passou a usar `computeAccountBalance` com data de corte e a mostrar "Não controlado" quando a conta não tem controlo de saldo.
- Tornar a tesouraria utilizável exige agora duas peças: implantar os saldos do banco com data de corte (D-ERP25, à espera dos valores do Pedro) e modelação da receita de bilheteira. O backfill de `transaction_payments` (#91) mantém-se em aberto mas não bloqueia o saldo, que corre por `paid_amount`.
- Menor, sem issue: o OCR das faturas avulsas usa a edge function `extract-camarim-receipt` e o prompt de talões de camarim (bebidas, snacks, IVA 6%), o que pode degradar a extração em faturas de outra natureza.

## Factos que não se reinvestigam

**A lista de reembolso é um veículo de pagamento, não uma unidade contabilística.** `reimbursement_note_items` tem quatro colunas úteis — o item **é** uma transação que já existe. Qualquer regra aplica-se por transação, nunca por lista. Das 24 notas, 9 misturam despesas de evento com despesas só da empresa, e uma mistura dois eventos diferentes.

**O camarim já tem o campo do vínculo ao BP e nunca foi preenchido.** `camarim_items.bp_forecast_id` está a NULL nos 35 itens; os 24 já integrados viraram transações com `event_id` e sem `forecast_id`, num total de 15.496,15 €.

**Movimentos de capital ficam fora do resultado por trigger.** Qualquer rubrica `10.1.%` recebe `is_transitory = true` por `force_transitory_for_capital_branch`. Mas **entram no apuramento de IVA na mesma** — o `IvaManagement.tsx` não filtra transitórias nem excluídas do resultado.

**`transactions.iva_rate` tem default 23.** Uma transação criada sem passar a taxa nasce a 23% e vai direta ao apuramento de IVA. A taxa tem de ser sempre explícita.

**Feriados não entram no cálculo da data de execução SEPA** — decisão registada em `pain001.ts`: o banco reagenda.

**`paid_amount` não é derivado de `transaction_payments`** (624 de 706 liquidadas ficariam a zero). Auditoria do tema encerrada na #93, por decisão do Pedro.

**A fatura mensal da Meta discrimina o gasto linha a linha por campanha, com o nome completo.** Cada campanha aparece duas vezes, uma por posicionamento (Instagram e Facebook).

**O Google não envia PDF por email.** O aviso "documento de faturamento está pronto" traz só o número da fatura e um link para a consola. O custo por evento sai do espelho `crm.google_campaign_insights_daily`.

**O Google cobra por limiar de 500 EUR, não por mês.** O débito bancário nunca corresponde a um mês nem a um evento.

**`crm-meta-sync-insights` limita a janela a 90 dias por código, mesmo em mode full.** Buracos históricos do espelho são irrecuperáveis por essa via — para meses já faturados, a fatura é a fonte, não o espelho.

**Meta Platforms Ireland Limited, VAT IE9692928F, IVA 0% por autoliquidação (art.º 196.º da Diretiva 2006/112/CE).** Conta Meta 5094207367314169. Google Ads cliente 220-004-3144, perfil de pagamentos 5700-5654-4710.

**O saldo de conta nunca filtra `reversed_at`.** A RPC `reverse_transaction` tem dois tipos de estorno: `cash_refund` põe `paid_amount = 0` (o dinheiro voltou), `supplier_credit` mantém o `paid_amount` (o dinheiro saiu mesmo e nasce um crédito no fornecedor). `paid_amount` já é a resposta certa nos dois casos; filtrar `reversed_at` no saldo inflacionaria os estornos por crédito de fornecedor.

**Existem três overloads de `reverse_transaction` em Live.** A de 5 argumentos (`p_tx_id`, `p_kind`, `p_reason`, `p_valid_until`, `p_release_for_repayment`) é a correta e é a única chamada pelo frontend, em `PaymentTimeline.tsx`. A legada de 3 argumentos (`p_transaction_id`, `p_reversal_kind`, `p_reason`) continua viva sem consumidor e não toca em `transaction_payments` nem liberta a transação das listas. Estornar por SQL direto, sem a RPC, deixa `reversal_kind` a NULL e o `paid_amount` intacto — foi o que corrompeu o saldo do Santander em 3.177,96 € entre 01/09 e 07/09.

**A despesa do fecho de um evento é a soma das linhas de BP, não a soma das transações.** Lançar uma transação contra uma linha de BP que já contém o valor não altera o resultado do evento nem o apuramento por sócio — só converte previsão em realizado. Só há impacto no resultado se o total ligado à linha exceder o BP, e aí entra como custo fora do BP.

**Reverter uma fatura Ads aplicada apaga a transação-mãe, e as filhas caem por CASCADE.** Sete guardas correm antes e nenhuma é opcional: pago ou com `paid_amount` > 0, `settlement_id`, `card_session_id`, linha em `transaction_payments`, presença em `payment_list_items`, `reimbursement_note_items` ou `reimbursement_notes`, conferência em `accountant_transaction_reviews`, e data dentro de um período já em `accounting_exports`. A ordem das operações é fixa: soltar `event_forecasts.transaction_id` (FK NO ACTION, é a que bloqueia), apagar a mãe, e só depois apagar os ficheiros do storage.

**A rubrica de destino de uma fatura de tráfego não é garantida.** A fatura Meta de abril (252466632) esteve quatro meses lançada em 10.8.07 Outros em vez de 3.2.01 Digital, e por isso não aparecia em nenhuma leitura do Digital. Ao conferir tráfego pago, procurar por `invoice_ref` e por fornecedor, nunca só por categoria.

**O espelho segue a transação, nunca a linha de BP nem a linha de pagamento.** Uma transação pode cobrir várias linhas de BP e continua a ser uma só saída de dinheiro. E `transaction_payments` não é âncora fiável: na conta de Madrid havia uma transação com o pagamento gravado duas vezes e outra com o valor em reais. O `paid_amount` da transação é a verdade. Filhas de rateio nunca recebem `account_id`, portanto nunca geram aporte duplicado.

**`transaction_payments` não tem campo de moeda.** O pagamento do consórcio tem 68.770,80 numa transação de 11.385,52 — é o valor em reais (câmbio 6,04), não um erro. Quem somar essa tabela mistura moedas sem aviso.

**O ramo 10.1 não alimenta o mapa de sugestão de rubricas.** Guarda acrescentada a `coala_capture_category_change` em 07/09: sem ela, cada aporte espelhado escrevia uma linha em `coala_supplier_category_map`.

**Cartão de fatura agrupada no picker de Listas de Pagamento.** `buildPickerRows` colapsa as transações com o mesmo `invoice_group_id` numa linha única identificada só por fornecedor + `invoice_ref`; as descrições dos itens não são renderizadas com o grupo fechado. Uma transação elegível parece não existir, e a pesquisa por descrição não lhe acerta — o que leva o utilizador a lançá-la outra vez. Caso real a 08/09: `FT 11.1/66` da KARINUR, duas transações de 345,00 € do Tour M&M. Corrigido a 08/09: grupos de 3 itens ou menos abrem por omissão, e a pesquisa passa a ler as descrições dentro dos grupos e a expandir o grupo com match. A selecção continua atómica por fatura.


## Página de Contas: três dinheiros, três cartões (09/09/2026, D-ERP27)

**SALDO TOTAL é caixa, e só caixa.** Soma apenas `bank`, `cash` e `prepaid_card` com controlo de saldo. Debaixo do valor nomeiam-se as contas de caixa que ficaram fora por `skip_balance_check` — hoje a Conta Pagamento Brasil e a Eventos Históricos. Antes somava tudo e dava −1.994.414,66 €.

**As bilheteiras têm fonte própria.** Na coluna Saldo Atual, as contas `ticket_office` passam por `computeTicketOfficeBalance` (D-ERP15) e não pela fórmula bancária: a receita de bilhetes vive em `ticket_sales` e a conta só veria as saídas (Ticketline aparecia a −3.657.013,07 €, BOL a −59.352,72 €). O total dos saldos retidos tem cartão próprio, "Retido em Bilheteiras", e nunca soma ao caixa.

**Acertos não são caixa.** As contas `other` (Acerto EIN · Anitta EDA 2026, Pgto Mágicos Acerto Madrid, Pagamento Diretoria) saíram do SALDO TOTAL para o cartão "Acertos em Curso". A Acerto EIN entrava a +905.000,00 € como se fosse dinheiro em conta.

**Santander implantado.** Corte a 31/08 (D-ERP25), saldo correcto a 407.199,12 €. A data de corte passou a sair em pt-PT na coluna Saldo Inicial.

## Lançar a partir do banco (09/09/2026, D-ERP29 / D-ERP30)

Nas linhas por explicar da conciliação há agora **Lançar**: abre um formulário já preenchido pela regra que casar (`bank_line_rules`) e cria a transação só depois de confirmação humana — nunca automaticamente. O valor e a data vêm do banco e não se editam; a transação nasce paga na conta do extrato e a linha fica ligada por `created_transaction_id`.

Selecionando várias linhas cria-se **um** lançamento pela soma (o caso do TPA do bar do Ivete Clareou: 16 linhas de 07/09, 27.241,87 €, receita em 1.1.03 F&B, com a repartição bar/alimentação e as taxas do adquirente por apurar no fecho do A&B).

Os débitos por limiar do Google Ads não são despesa: a regra gera o par de transferência (rubrica 10.3) para a conta "Google Ads — conta corrente", cujo saldo passa a ser o crédito por consumir. **Pendente do utilizador:** criar essa conta financeira (tipo `other`) — não foi criada por este trabalho, que não lançou nem criou dados.

As taxas bancárias (comissão de gestão, imposto de selo, comissões e selos dos lotes SEPA) vão para 10.6.01, sem evento.

## Onde ler mais

- `.lovable/memory/features/payment-amount-invariants.md` — soma de pagamentos e paid_amount nunca excedem o bruto
- `.lovable/memory/features/payment-account-ownership.md` — conta e pagamento só na transação-mãe; "Marcar como Pago" é visual
- `.lovable/memory/features/financial-accounts-non-accounting-flag.md` — contas gerenciais fora da exportação contabilística
- `.lovable/memory/features/invoice-groups.md` — agrupamento por documento, desagrupar, auditoria OCR e painel Admin
- `.lovable/memory/features/standalone-invoices.md` — scanner e aba Conferência das faturas avulsas
- `.lovable/memory/features/card-sessions.md`, `supplier-credits.md`, `transaction-installments.md`, `role-accountant.md`
- `.lovable/memory/features/account-balance-cutoff-date.md` — data de corte do saldo inicial e skip_balance_check
- Issues #91, #92, #124, #125, #126, #127, #134, #135, #149 (#90 fechada)
