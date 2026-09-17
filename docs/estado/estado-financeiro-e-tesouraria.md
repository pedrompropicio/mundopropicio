# ESTADO — Financeiro & Tesouraria

Atualizado: 2026-09-17 (fecho). Issues abertas da frente: #91, #125, #127,
#134, #135, #147, #149, #154, #181, #189, #190, #195.
Fechadas em 17/09: #191, #192, #193.

## Em que pé está

- **Faturas avulsas da Lovable carregadas (17/09, #191 e #192 fechadas).**
  34 faturas em `standalone_invoices`, 2026-03-18 a 2026-09-16,
  US$ 12.230,79 → **EUR 10.512,55**, IVA 0,00, todas com
  `supplier_nif = EU372090612` (EU OSS VAT da Lovable Labs — **não**
  PT515274291, que é o NIF da própria MP impresso no rodapé da fatura),
  `currency = USD` e `paid_by_partner_id` = Pedro Neto. Série D38TWLH0,
  0001 a 0040 sem falhas: ficam de fora 0001 e 0002 (nome pessoal, IVA 23%,
  anteriores ao NIF da empresa na conta) e 0005/0016/0026/0034 (valor zero).
  Câmbio USD→EUR do BCE na data de emissão ou no último dia útil anterior,
  com a origem em `fx_rate_source` de cada registo.
  **Caminho para obter os PDFs, provado e repetível:** os links
  `pay.stripe.com/.../pdf?s=em` dos emails expiram; os links do portal
  (`invoice.stripe.com/i/<acct>/<key>`) são permanentes, e o PDF serve-se
  em `https://pay.stripe.com/invoice/<acct>/<key>/pdf?s=ap` — o sufixo
  `?s=ap` é o que importa, porque `invoice.stripe.com/.../pdf` devolve a
  SPA em HTML. Allowlist necessária: `pay.stripe.com`,
  `invoice.stripe.com`, `files.stripe.com`.
  **Autoliquidação:** 18 faturas trazem a menção impressa; as outras 16
  (top-ups de $20/$50/$100) não têm coluna de imposto nenhuma e foram
  gravadas a IVA 0 com a assunção declarada na `notes` (decisão do Pedro,
  17/09). O câmbio automático fica na **#195**.

- **Conta corrente do sócio alimentada com a folha de vencimentos (17/09).**
  A Conta Corrente · Pedro Neto (`29115958-27b0-4a5d-9888-4a983ce4d11d`,
  `is_accounting = false`, restrita) tem agora os dois lados:
  `income` 42 · **211.300,00 €** (retiradas de 07/01 a 09/09) e
  `expense` 8 · **55.048,38 €** (vencimento BRUTO de jan a ago),
  saldo **156.251,62 €**,
  rubrica `10.3 Transferências Internas`, `is_confidential = true`, IVA 0.
  Usou-se a 10.3 e não a 10.4.01 Ordenados de propósito: o custo real do
  pessoal é lançado pela contabilidade no circuito dela, e pôr 10.4.01
  aqui duplicaria custo no ERP. Esta conta é um controlo, não uma peça
  de resultado.
  **Origem dos valores:** anexo **MV** (`Extracto de Vencimentos por
  Empregado`, CentralGest) dos emails mensais `Mundo Propício, Unip. Lda.
  - Vencimentos 2026/MM` do João Coelho (Expert RH), na conta
  **pedroneto@socialmusic.com.br** — não na conta mundopropicio.com.
  **O MV é acumulado do ano:** o do mês mais recente traz todos os meses
  anteriores, não é preciso abrir as threads antigas. Nas threads com
  retificação vale a segunda leva de anexos, não a primeira (março foi
  retificado de 6.065,60 para 6.068,90).
  Linha 2 — Pedro Coelho de Araujo Neto, jan–ago 2026: Vencimento
  7.360,00 · Sub. Refeição 1.017,90 · **Quilómetros 46.670,48** ·
  **Total bruto 55.048,38** · Seg. Social −809,60 · Líquido 54.238,78.
  **A conta corrente regista o BRUTO** (regra do Pedro, 17/09): o crédito
  do sócio é o vencimento bruto, e a Segurança Social retida é movimento
  separado.
  **Retiradas — extratos Santander 85 a 92 lidos (01/01 a 31/08),
  contínuos e sem lacunas.** 42 transferências nominais
  (`TRF CRED INTRABANC P/ PEDRO COELHO DE ARA` e
  `TRF.IMED. P/ PEDRO COELHO DE ARAUJO NETO`), cada uma com a referência
  do movimento no descritivo da transação, para bater linha a linha na
  conciliação: jan 30.300 · fev 35.000 · mar 27.000 · abr 45.000 ·
  mai 15.000 · jun 8.000 · jul 21.000 · ago 14.000 · set 16.000.
  **Correção a um número anterior:** a reconciliação de 01/09 apurou
  38.000 € entre 18/06 e 31/08; o total real de jun–ago é **43.000 €** —
  faltava a transferência de 5.000 de 01/06, fora da janela que aquele
  trabalho olhou.
- **Relatório "Conta Corrente do Sócio" construído e publicado (17/09,
  #193 fechada).** Aba nova na página de Contas, **só de leitura**, visível
  apenas com `view_confidential` — sem a permissão a aba não existe
  (D-ERP36). Mostra o **Por justificar** = retiradas − folha − faturas,
  com as três parcelas, seletor de ano, listas expansíveis e export Excel
  de quatro folhas (Resumo, Retiradas, Folha, Faturas). Dois avisos
  deliberados no ecrã: que o saldo da página de Contas **não é** este
  número (fica sempre acima pelo valor das faturas avulsas, que por
  desenho nunca tocam contas financeiras), e até que data há retiradas e
  folha lançadas. ⚠️ **O ecrã de Extrato da conta não mostra as faturas —
  é suposto:** o Extrato é o extrato da conta e as faturas não a movem.
  Quem quiser o retrato completo usa a aba, não o Extrato.
  Ficheiros: `src/lib/partner-current-account.ts` e
  `src/components/PartnerCurrentAccountTab.tsx` (novos),
  `src/pages/FinancialAccounts.tsx` e `src/lib/utils.ts` (alterados).
  **Dívida assumida:** `PARTNER_ACCOUNT_ID` e `PARTNER_PROFILE_ID` estão
  fixos no código — com outro sócio ou outra empresa o ecrã erraria em
  silêncio em vez de falhar. Verificado no ecrã pelo Pedro a 17/09.


- **Anexar documentos por API (16/09, #180 fechada, D-ERP71).** Edge function `ingest-transaction-document` (só `service_role`): origem por URL do Drive ou `conteudo_base64`; alvo `transaction_id`, `invoice_group_id` ou `supplier_id` + `invoice_ref` (igualdade exata); um objeto no bucket `transaction-documents` e N registos em `transaction_documents` com o mesmo `file_url`; idempotente por nome+tamanho; `supplier_id`+`invoice_ref` sem grupo cria o grupo (a chamada é a confirmação humana, proformas incluídas). Transporte: o contentor do Claude chama a função diretamente — o domínio `sfohvvlqccmmebvjgibx.supabase.co` entrou na allowlist de rede da organização a 16/09. O Drive NÃO é corredor (privado devolve login; upload via MCP passa o ficheiro pelo contexto). Testado em Live com FT 132026/33986 (Vila Galé, grupo `3d2fff0d`) e PROFORMA 194/2026 (Meliã, grupo `10e18e9a`): 3 transações, 1 ficheiro, 1 objeto cada; repetição devolve `created 0, reused 3`. Peça do ecrã em #181.
- **Aviso de abertura do extrato corrigido (#185, 16/09):** cascata — cobre o corte → como antes; começa depois do corte → abertura vs balance_after da última linha importada da conta antes de period_from (cadeia reconstruída dentro do dia); sem linhas → saldo do sistema à véspera. Períodos sobrepostos deixam de dar aviso falso.
- **Lançar a partir do banco ganhou orientação e taxas (#187, D-ERP74, 16/09):** regra que casa visível na linha antes do clique; taxas de transferência internacional agrupadas pela referência (DESP.SHA, SWIFT, IVA, selo) e lançadas em duas pernas (SWIFT+IVA a 23%, DESP.SHA+selo a 0%) na 10.6.01 com evento e linha de BP herdados da transferência-mãe; sem linha na mãe, propõe-se a linha da rubrica da mãe com previsto/utilizado/disponível e a caixa 'ligar também a mãe' grava o forecast_id na mãe. Caso real: refs 001803486960041656/57 (Anitta EDA), mãe Per diems 1.806,25 € ficou com linha de BP.
- **Pagamento de Serviços exige Entidade 5 dígitos + Referência 9 dígitos (#190, 16/09):** CHECK `transactions_service_payment_requires_mb` NOT VALID em Live, espelho em `update-transaction` e nos modais Nova/Edição. Resto: modal de liquidação valida só preenchimento.
- **Conciliação bancária — o lado do banco entrou no sistema (09/09).** Tabelas novas `bank_statements` e `bank_statement_lines` (a linha original fica em `raw`), permissão `manage_bank_reconciliation` (admin e manager), ecrã `/conciliacao-bancaria`. Parser do extrato Santander "tabulado Excel" (`;`, latin-1, CRLF, 11 colunas, sinal colado e vírgula decimal) em `src/lib/bank-statement/parse-santander.ts`. Identidade da linha por `line_hash` (conta + data mov. + data-valor + descrição normalizada + valor + **saldo após o movimento**), única por conta: reimportar o mesmo ficheiro não cria uma única linha nova. Um ficheiro cuja cadeia de saldos não feche é **recusado**, dizendo a linha onde parte; se o saldo de abertura não bater com o `initial_balance` implantado (D-ERP25) importa mas **avisa em destaque**. Conciliação em três camadas, parando na primeira (lote SEPA por `payment_list_sepa_exports` — total + `msg_id` na descrição, ligando às N transações do lote; valor exato contra `paid_amount` a ±5 dias; descrição por Dice ≥ 0,8 com valor ao cêntimo, motor agora com casa única em `src/lib/string-similarity.ts`). A conciliação **só liga**: nunca liquida, nunca muda status, nunca escreve `paid_amount`, e não cria transações. Ao lado das linhas por explicar, com o mesmo peso, a lista de **transações pagas sem movimento no banco** — a classe de erro dos Bombeiros (1.328,45 € a 11/08). No topo, o triângulo: abertura → movimentos → saldo declarado → diferença por explicar, em vermelho enquanto não for zero. **Nada foi importado** — o ficheiro é passado pelo Pedro. Decisão em D-ERP28; funcionamento em `.lovable/memory/features/conciliacao-bancaria.md`. Lote seguinte (lançamento automático das linhas sem contrapartida) numa issue fechada — remedir antes de manter esta pendência.
- **Santander — extrato fechado a zero, agora até 11/09.** Banco Santander Totta, `initial_balance` **122.363,05 €** com data de corte a **31/08/2026** (implantação já feita, D-ERP25). O extrato já não termina a 09/09: há linhas até **11/09** e **0 por explicar**. Na leitura de 11/09 estavam **52 linhas conciliadas, 0 por explicar, 5 anteriores ao corte**, com saldo do sistema a 09/09 = **439.403,92 €**, saldo declarado pelo banco = **439.403,92 €** e **diferença 0,00 €**. A linha que faltava era o débito de **121,50 € de 03/09** (`PAG SERVICOS *2752 12605-254629545 Eupago*Garrafei`), lançada como despesa de representação em **`10.8.08 Ofertas e Representação`**, sem evento, fornecedor **GARRAFEIRA ESTADO D'ALMA** (NIF 510709478), **IVA a 0% provisório**: a fatura ainda não foi anexada e o desdobramento base/IVA fica por acertar. As diferenças de 32.204,80 € (09/09) e de 16.000,00 € (movimentos confidenciais) deixaram de existir.
- **O saldo passou a vir do servidor na Conciliação e na Projeção de Tesouraria (11/09, D-ERP36).** Funções novas `_account_true_balance_asof_raw` (interna) e `account_true_balances_asof` (em lote, com o mesmo portão de permissão de `account_true_balance`) dão o saldo **a uma data**. Na Conciliação, sem permissão esconde-se o **triângulo inteiro** — não basta esconder o número, é a diferença que denuncia o valor escondido. Na Projeção, contas cujo saldo venha `NULL` ficam **fora**, nomeadas, e nunca contribuem zero.
- **Funções `SECURITY DEFINER` fechadas por omissão (11/09, D-ERP37) e portão nas funções de BP (11/09, D-ERP38).** Todas as funções do schema `public` são chamáveis por RPC com a chave pública do frontend: as que não são para o ecrã perderam o `EXECUTE`. E as seis funções de versões/cenários do BP, que recebiam o autor como parâmetro e não verificavam nada, passaram a exigir `manage_bp` e a mesma empresa, e a assinar sempre com o utilizador ligado.
- **Fecho do food do Ivete (ZigPay) lançado a 11/09.** A entrada transitória de **27.241,87 €** está conciliada com as 16 linhas de TPA. As taxas bancárias de **315,43 €** ficaram em `2.9.04 Taxas de Meios de Pagamento`, com linha de BP — deixam de estar em aberto. Ficam seis repasses transitórios por pagar, **17.906,94 €**, com entidades já criadas (NIF e IBAN). Madre Coxinha e Hotdog da Linha ainda sem nome fiscal — bloqueia a fatura, não a transferência.
- **A receita do food do Ivete deixou de estar agregada (12/09).** Existiam duas transações — comissão **6.095,83 €** e fees **1.750,00 €** — que foram **apagadas** (não tinham pagamentos, documentos, listas, linhas de BP nem ligações a linhas do banco) e substituídas por **seis transações, uma por operador**, a casar 1:1 com as seis faturas que a MP vai emitir. Todas `approved` com `paid_amount = 0`, rubrica **1.1.03**, **IVA 23%**, fornecedor ligado pelo NIF:

| Operador | s/IVA | c/IVA |
|---|---|---|
| PARADIGMA SORTIDO UNIPESSOAL LDA (Madre Coxinha) | 1.306,19 | 1.606,61 |
| CANDEIAS E CARVALHO LDA (Hotdog, 2 pontos) | 2.043,22 | 2.513,16 |
| GRUPO CAPRICCIOSA, S.A. | 840,71 | 1.034,07 |
| DANTAS E LOPES (Açaí Natura) | 745,27 | 916,68 |
| PIZZARIA ARTESANAL, UNIPESSOAL, LDA | 1.607,88 | 1.977,69 |
| SERRA BRANCO, LDA (Hamburgueria do Bairro) | 1.302,56 | 1.602,15 |
| **Total** | **7.845,83** | **9.650,36** |

  Razão: **uma fatura tem um adquirente só** — seis NIFs obrigam a seis faturas, e a receita tem de ter o mesmo recorte. O recebimento da MP é liquidado **por compensação no momento do repasse**, por isso as seis nascem por receber e não `paid`. Efeito no ecrã: Contas a Receber ganha seis linhas, **9.650,36 €**; a receita do evento **não muda**, porque o card conta transações `approved`.
- **Chave de agrupamento `ACERTO-FOOD-IVETE-2026` (12/09).** Escrita em `payment_reference` nas **catorze** transações da operação: a entrada transitória de 27.241,87 €, os seis repasses (17.906,94 €), as seis receitas (7.845,83 €) e as comissões bancárias (315,43 €). Segue a convenção já existente (`ACERTO-SSH-COALA-2026`, `ACERTO-BARES-ANITTA-2026`, `ACERTO-FOOD-ANITTA-2026`, `REVSHARE-TICKETLINE-ANITTA-2026`, `CAMARIM-<id>`). **Verificação embutida:** quando os seis repasses e as seis receitas estiverem liquidados, o saldo do grupo tem de ser **7.530,40 €** (7.845,83 de receita − 315,43 de taxas). Enquanto não for, a operação não está fechada.
  **Porque NÃO se criou conta de trânsito para o food**, apesar de considerado: nos acertos existentes (Acerto EIN, Pgto Mágicos Madrid) os movimentos **não passam pelo banco**; aqui passam — os seis repasses saem mesmo do Santander por SEPA e aparecem no extrato. Numa conta de trânsito a conciliação cairia no aviso **"conta divergente"** da D-ERP35 em cada uma delas. A referência dá o agrupamento sem esse atrito. A estrutura definitiva é o **"perímetro por linha"** de uma issue fechada — remedir antes de manter esta pendência.
  O **revenue share da Ticketline não levou referência de agrupamento**: ali a ponte `bank_line_transactions` já liga as duas transações ao crédito de 135.986,96 € — a estrutura já garante o que a referência daria.
- **Compensação nunca mexe em saldo — trava na base (12/09, D-ERP43).** Trigger `trg_force_no_account_on_compensation`, `BEFORE INSERT OR UPDATE` em `transactions`: com `payment_method = 'compensation'`, `account_id` é forçado a **NULL**. Não rejeita, **corrige** — compensação com conta nunca é intenção legítima. Motivo: a fórmula do saldo soma por `t.account_id`, logo uma compensação com conta **inflaciona a conta com dinheiro que nunca lá entrou**. **Caso real encontrado e corrigido:** quatro transações do Coala Festival (A&B Bebidas 95.195,75 · Superbock 3.252,03 · Cortesias Marco Caldeira 2.520,00 · Adega Almeirim 2.500,00, total **103.467,78 €**) estavam apontadas ao Banco Santander Totta; só não corromperam o saldo porque têm data de pagamento **07/07/2026**, anterior ao corte de 31/08. Foram limpas. Depois da limpeza o saldo do Santander a 09/09 continua **439.403,92 €** e **não existe nenhuma transação de compensação com conta** na base.
- **Domínio de `payment_method` fechado (12/09, D-ERP44).** Era **texto livre sem CHECK** nas duas tabelas, com a lista de opções repetida em **quatro ficheiros** (um deles divergente, sem `state_payment`) e "Compensação" a não ser oferecida em lado nenhum da interface — as 20 compensações existentes tinham entrado **por SQL**. Agora: fonte única em `src/lib/payment-methods.ts` (valores, rótulos em pt-PT, ícones, `isPaymentMethod`, `paymentMethodLabel`, `paymentMethodOptions` com `includeStatePayment`/`includeCompensation`); **espelho no servidor** em `update-transaction`; e **CHECK** em `transactions.payment_method` e `transaction_payments.payment_method` a aceitar apenas NULL ou um de `transfer`, `service_payment`, `direct_debit`, `state_payment`, `compensation`. No modal de pagamento "Compensação" passou a ser escolhível e, ao escolhê-la, o bloco da conta desaparece e aparece a nota "Encontro de contas: não há movimento de dinheiro e não altera o saldo de nenhuma conta". Verificado no ecrã a 12/09. Importa porquê: **o trigger compara a string exactamente**, e sem CHECK uma grafia errada desarmava-o em silêncio.
- **Rubricas novas no plano de contas:** `10.8.08 Ofertas e Representação` e `2.9.04 Taxas de Meios de Pagamento`.
- **Conciliação N:1 — tabela-ponte `bank_line_transactions` (12/09, D-ERP41).** Uma linha do banco passa a poder ligar-se a **N transações** nas conciliações manuais. Caso que a originou: o crédito único da Ticketline de **135.986,96 €** (FT 11.1/101) a cobrir duas transações — Revenue Share 4% (88.446,80 + IVA 23% = **108.789,56**, no evento Anitta EDA 2026) e a parcela de 1% (22.111,70 + IVA = **27.197,40**, sem evento). Os lançamentos (`created_transaction_id`) **não** entram na ponte: são a cardinalidade inversa (N linhas → 1 transação, caso das 16 linhas de TPA). Validação: a soma dos `paid_amount` das N tem de bater com `abs(line.amount)` a **±0,01**; **não existe conciliação parcial**.
- **Documentos no movimento do banco — `bank_line_documents` (12/09, D-ERP41).** Uma fatura que cobre transações de eventos diferentes não pode ser anexada a nenhuma delas: vive na linha do banco e replica-se para `transaction_documents` com `file_url` prefixado **`bank://`**, sem duplicar o ficheiro no storage.
- **`transaction_documents.partner_visible` (12/09, D-ERP41).** Coluna nova, default `true`; a política `transaction_documents_select_partner` passou a exigi-la. As réplicas de linhas do banco entram sempre a **`false`**. São dois eixos independentes: `is_accounting` decide se vai para o contabilista (por **PAPEL**); `partner_visible` decide se o sócio vê (por **ACESSO AO EVENTO**).
- **Guard de confidencialidade nos anexos (12/09, D-ERP42).** Política **RESTRICTIVE** nova `transaction_documents_confidential_guard`, a espelhar a `transactions_confidential_guard`: um documento anexado a transação **confidencial** ou a transação em **conta restrita** só é legível por quem tem `view_confidential`. Antes disto a D-ERP34 protegia a transação e deixava o comprovativo legível por admin, platform_admin, manager, editor, viewer e accountant. Testado em Live fingindo o papel `manager`: `can_see_confidential` a `false` e **zero** anexos de transações confidenciais visíveis; o `service_role` continua a ver os **1.371** anexos.
- **Revenue share da Ticketline na Anitta (12/09).** A **FT 11.1/101 de 07/09/2026** a TICKET LINE S.A. (NIF 504691031) é de **110.558,50 + IVA 23% = 135.986,96 €**, recebida a **10/09** no Santander. No ERP fica repartida em duas transações: a do evento com **88.446,80 s/IVA** (`paid_amount` **108.789,56**) e uma **sem `event_id`, confidencial**, com **22.111,70 s/IVA** (`paid_amount` **27.197,40**), rubrica **1.3.04**. A separação é o que estava decidido em `claude/bilheteira-fecho-e-saldo-2026-09-08.md`. A transação do evento estava `approved` com `paid_amount = 0` e passou a `paid`.
- **Cashless da Ivete (12/09).** Depósito de numerário no Santander a **11/09/2026**, `DEP. NUMERÁRIO NÃO CLIENTE`, **895,70 €**, lançado como **entrada transitória** no evento Ivete Clareou 2026 e já conciliado. É o crédito em espécie carregado nos cartões de cashless. Princípio aplicado: a receita é o que foi **VENDIDO** (relatório ZigPay), não a origem do dinheiro carregado. **Por decompor**, e depende do fecho dos bares, que ainda não chegou. Teste a fazer quando chegar: o dinheiro apurado (liquidação TPA + numerário) tem de cobrir a totalidade das vendas de alimentos **e** bebidas.
- **Leituras de transações truncadas aos 1.000 registos — corrigido a 11/09.** Quatro páginas liam `transactions` sem paginação e o PostgREST cortava aos 1.000 de 1.442 registos: Transações, Dashboard, Gestão de IVA e Relatório de Fornecedores — **os totais do Dashboard estavam errados**. Helper novo `src/lib/supabase-paging.ts` (`fetchAllPaged`), com desempate obrigatório por `id` na ordenação de qualquer query paginada.
- **Contas e movimentos confidenciais, com o saldo validado no servidor (11/09, D-ERP34).** `financial_accounts.is_restricted` e `transactions.is_confidential`, permissão `view_confidential` (admin e accountant), guard RESTRICTIVE `transactions_confidential_guard` e trigger que força confidencialidade em conta restrita. As travas de saldo dos três modais de pagamento/transferência decidem por `account_has_balance_for` e só mostram valor por `account_true_balance`. Cartões, bilheteiras, lista de Contas e relatórios continuam a calcular saldo no cliente — furo assumido.
- **Conta de liquidação (11/09, D-ERP35).** Na liquidação a partir de lista de pagamento o seletor só oferece contas `bank`; fora da lista, cartão pré-pago com `transfer`/`direct_debit` dá aviso e não bloqueio; a ligação manual da conciliação sugere candidatas de outras contas com aviso "conta divergente" e confirmação explícita, mantendo as camadas automáticas presas à conta do extrato. Caso real do seguro de 48,40 € corrigido a 11/09.
- **Conta gerencial (`financial_accounts.is_accounting`).** Flag nova com default `true`; a conta "Pgto Mágicos Acerto Madrid" foi marcada como gerencial. A edge function `generate-accountant-zip` exclui transações dessas contas (query principal + ramo de notas de reembolso), mantendo o filtro `transaction_documents.is_accounting = true`. Efeito: 11 transações e 10 documentos fora do ZIP. Na transação a marca é herdada e apenas informativa (badge "Conta não contábil") — não existe campo em `transactions`.
- **Invariantes de valor pago reforçadas na BD.** `validate_installments_total()` deixou de depender de cronograma: INSERT recusa qualquer excesso sobre o bruto (`amount * (1 + iva_rate/100)`, tolerância 0,01 €); UPDATE só recusa se a nova soma for maior que a anterior e exceder o bruto (linhas legadas continuam editáveis e removíveis). Novo trigger `trg_validate_paid_amount_not_exceeds_gross` em `transactions` com a mesma lógica de legado. Ambos testados em Live.
- **`TransactionPaymentModal` endurecido.** Relê `paid_amount` da BD imediatamente antes de submeter (o snapshot em memória permitia duplicar); tolerância apertada para `>= 0,01`; todos os inserts em `transaction_payments` (incluindo irmãs de grupo-fatura e `BatchPaymentModal`) leem `{ error }` e lançam.
- **Editor ganhou correção de pagamentos.** Pode alterar a data e apagar um pagamento registado; valor, conta e método continuam só para admin/manager. Nenhuma ação disponível em evento fechado (`status='completed'`). Auditoria por campo mantida.
- **Lista de Contas a Pagar sem escrita direta.** "Marcar como Pago" voltou a ser estritamente visual (grava só `payment_list_items.manually_marked_paid`). "Liquidar (N)" passou a usar o `BatchPaymentModal` com conta obrigatória, uma linha em `transaction_payments` por transação e data inicial de `payment_lists.payment_date`. Filhas de rateio recebem `paid_amount`, `status` e `payment_date`, mas nunca `account_id` nem linha de pagamento (evita contagem dupla no saldo).
- **Faturas avulsas — aba Conferência.** Seletor de mês com lista vinda de consulta própria (independente do limite de linhas), abertura no mês mais recente com faturas, grupo próprio "Sem data da fatura" sempre no topo, consulta por intervalo quando há mês escolhido, aviso quando o limite de 1000 é atingido em "Todos os meses", e "Exportar mês" a consultar o período completo em vez das linhas em memória. Scanner/OCR intocados.
- **Faturas Ads — a fatura é o PDF (D-ERP31, 09/09).** Nova ação `parse_google` no `ads-invoice-ingest` (parser em `_shared/ads-invoice-google-parser.ts`), irmã do `parse_meta`: lê mídia por campanha, atividade inválida, créditos promocionais e taxas regulatórias, e recusa gravar se a soma das linhas não fechar o total ao cêntimo. Validado contra as três faturas reais: 5623212749 (420,01 €), 5649390521 (776,73 €), 5677864015 (1.076,29 €). O `propose_google`, que construía a partir do espelho da API, fica legado — o espelho não reporta créditos promocionais e por isso somava 2.586,93 € onde as faturas reais somam 2.273,03 €. Importação pela UI em três fases (escolher, ler em `dry_run`, gravar depois de confirmar), com o PDF arquivado no bucket. Os ajustes deixaram de pairar sobre a fatura: descem ao evento da campanha quando a identificam, e são rateados pela mídia de cada evento quando são anónimos, com o cêntimo residual na filha maior e a parcela visível no comprovativo de veiculação. A API do Google não serve para puxar faturas: o billing setup está aprovado mas em pagamentos automáticos e o `ListInvoices` devolve `BILLING_SETUP_NOT_ON_MONTHLY_INVOICING`.
- **Faturas Ads — ciclo completo, em produção.** Tabelas `public.ads_invoice` e `public.ads_invoice_line`, bucket privado `ads-invoices`, edge functions `ads-invoice-ingest` (`parse_meta`, `parse_google`) e `ads-invoice-apply` (`confirm`, `generate`, `reopen`, `revert`), função `public.resolve_ads_event`, colunas `events.ads_allocation_level` e `events.ads_match_aliases`. O ecrã chama-se **Faturas Ads** (rota inalterada, `/faturas-plataformas`). Validado contra as cinco faturas Meta de abril a agosto e três meses de Google, todos a fechar ao cêntimo; 98% do valor é atribuído por regra explícita. A 07/09 fecharam-se as três lacunas que impediam corrigir um erro de matching: atribuição manual de evento por linha (`match_source = 'manual'`, com `matched_by`/`matched_at`), reabertura de uma fatura confirmada, e reversão de uma fatura já aplicada. Versão em produção confirmada por invocação: `v2.3_revert_guards`.
- **Tráfego pago da Anitta fechado.** A linha de BP "Trafego Pago (MP e Anitta)" de 13.551,12 € decompõe-se ao cêntimo em 10.126,02 € de faturas Meta Ireland (Fev 2.249,10 · Abr 1.312,02 · Mai 1.864,60 · Jun 797,44 · Jul 3.902,86) mais 3.425,10 € de pagamentos pela conta brasileira (1.730,30 + 1.694,80). Faltavam lançar Fevereiro e Abril, 3.561,12 € — lançados a 07/09 como liquidados. A rubrica 3.2.01 Digital da Anitta passou de 15.701,96 € para **19.263,08 €**, com o realizado da linha a 13.551,11 € contra BP de 13.551,12 €. O resultado do evento não mudou: a despesa do fecho é a soma das linhas de BP, e a linha já continha estes valores. Ficaram ligadas ao `forecast_id` as quatro transações de tráfego que estavam órfãs.
- **Fonte única do saldo de conta.** `src/lib/account-balance.ts` exporta `computeAccountBalance(account, transactions, adjustments): number | null`, que devolve `null` quando `financial_accounts.skip_balance_check = true`. Consumidores migrados e a mostrar "Sem controlo de saldo"/"não controlado" em vez de número: `FinancialAccounts.tsx`, `TransactionPaymentModal.tsx`, `BatchPaymentModal.tsx`, `TransferFormModal.tsx`, `card-account-balance.ts`, `card-session-balance.ts`, Extrato (ecrã e exports Excel/PDF, com "N/C") e Projeção de Tesouraria (contas não controladas ficam fora, com aviso nomeando-as). `get_event_cash_position` deixou de somar contas com `skip_balance_check`, e `get_event_cash_position_invariant` passou a comparar o mesmo universo (também sem contas não controladas e com a data de corte aplicada) — antes dava `is_balanced` falso por construção. Os modais incluem os ajustes de retenção/crédito, terminando uma divergência de 460,00 € face ao ecrã de Contas. Nas sessões de camarim o saldo mostrado é o da sessão, não o da conta. Nenhuma validação nova foi introduzida. Issue #90 fechada.
- **Data de corte do saldo inicial (09/09).** `financial_accounts.initial_balance_date` (date, nullable): o `initial_balance` é o saldo ao FECHO desse dia, e movimentos com `COALESCE(payment_date, date)` igual ou anterior ao corte deixam de somar. A `NULL` nada muda. A regra vive na fonte única e propaga aos ajustes de retenção/crédito, ao Extrato (o corte vale na abertura E em todas as linhas — o que é anterior ao corte já está dentro do saldo inicial e não volta a somar; a abertura funciona sem Data Início, as linhas passaram a usar `paid_amount` como a fonte única, e o cabeçalho mostra "Saldo implantado a <data>: <valor>" no ecrã e nos dois exports), às sessões de cartão e a `get_event_cash_position`. Na página de Contas há um modal por conta, **só admin**, que mostra lado a lado "sistema calcula hoje" e "depois de implantar" antes de gravar, e registra autor e hora em `system_audit_log`; o campo de saldo inicial do formulário normal passou a ser só de leitura para não-admin. **Nenhum valor foi implantado** — os saldos do banco são introduzidos pelo Pedro. O carimbo de estorno passou a ser limpo nos TRÊS caminhos de liquidação (`TransactionPaymentModal`, `BatchPaymentModal` e `MarkInstallmentPaidModal`, este último escrevendo em `transactions` só para isso). Decisão em D-ERP25.
- **Estorno que volta a ser pago (09/09).** Os textos do estorno em `PaymentTimeline.tsx` diziam que a transação "volta a A pagar"; o que a RPC faz é pôr `pending`, e o picker das listas exige `approved`. Passam a dizer que volta a **Aguardando e tem de ser aprovada de novo**. E ao liquidar de novo uma transação com `reversed_at`, o carimbo limpa-se (`reversed_at` e `reversal_kind` a NULL, `reversal_reason` e auditoria mantidos), no modal individual e no pagamento em lote — senão o custo saía do banco mas desaparecia do BP e dos agregados do sócio, que filtram `reversed_at IS NULL`. Caso real: Bombeiros `65ac490d-1d0c-4d4d-a155-395bc2593c45`, Henry&Klaus Lisboa (dado não corrigido).
- **Conta-espelho de sócio (07/09).** `financial_accounts` ganhou `partner_id` (→ `event_partners`) e `mirror_partner_aporte`. Numa conta com essa flag, o trigger `trg_sync_partner_aporte_mirror` cria automaticamente um aporte (`10.1.01`, receita, transitório, IVA 0) de valor igual a cada despesa paga por ali, atribuído ao sócio da conta, com evento do sócio e `flow = partner_settlement`. A ponte `partner_aporte_mirror` liga despesa↔aporte e garante idempotência: o espelho sincroniza com o `paid_amount` — se este mudar ou a transação for estornada ou apagada, o aporte acompanha ou desaparece. Aplicado à conta "Pgto Mágicos Acerto Madrid": 18 espelhos, 56.761,50 € de aporte do Henry Vargas, saldo da conta a 0,00. Os modais de pagamento avisam antes de confirmar que a conta gera aporte automático. Rubricas novas `10.1.04 · Empréstimo a Sócio` e `10.1.05 · Reembolso de Empréstimo de Sócio`, que ao contrário das 10.1.01/02/03 não exigem sócio de evento.
- **Grupos de fatura — porta fechada ao agrupamento errado (08/09).** Depois do incidente dos três talões da BP Estoril com o mesmo nº `FS 270072003/167876` (dois eram o mesmo talão duplicado), o agrupamento automático por fornecedor + nº de fatura só junta linhas que **partilham o documento anexo** ou que **não têm documento nenhum**. Com documentos diferentes aparece o diálogo "É mesmo a mesma fatura?" e nada é escrito sem resposta; o botão manual "Agrupar fatura" também compara os anexos e exige uma segunda confirmação quando divergem. O número lido no documento substitui o que estiver escrito à mão, com aviso. Há botão "Desagrupar fatura" na edição, e o aviso de eliminação lista nome, data e valor das irmãs do grupo. O aviso de duplicado por fornecedor + nº passou a consultar a base filtrada (já não dependia de um lote de 50 linhas, que deixava passar fornecedores grandes como a CORNUCOPILANDIA com 38 linhas na mesma fatura) e só dispara quando o **valor também coincide** — nº igual com valor diferente é a fatura legítima repartida por várias rubricas de BP. Decisão em D-ERP17.
- **Auditoria dos grupos existentes, em produção.** Tabela `invoice_group_audit`, edge function `audit-invoice-groups` (`verify_jwt = true`, só admin/platform_admin) e painel Admin → "Auditoria de grupos de fatura" (`/admin/auditoria-grupos-fatura`). O dry-run é incremental porque o OCR é lento (3 grupos por chamada, o painel repete até acabar) e nunca altera transações; o apply **só desagrupa, nunca junta**, e está preso ao `run_at` mostrado no ecrã — sem ele a função recusa, para não apanhar uma corrida antiga. Última corrida: **18 grupos ok, 0 linhas a desagrupar, 22 por rever à mão** (issue #134). O modo apply nunca foi corrido.
- **Grupos de fatura — a edição de uma linha deixou de alterar as irmãs (14/09, D-ERP60 e D-ERP61).** Sintoma: numa nota de reembolso, alterar uma linha alterava todas. Causa: a edge function `update-transaction` propagava **onze** campos a todas as irmãs do grupo-fatura, via `.in("id", siblingIds)`. A prova está em `transaction_audit_log`, no campo "Propagação grupo-fatura". Decisão: um campo de uma linha de fatura tem **três naturezas** — (1) o que é **do documento**: fornecedor, data, data de vencimento; **só isto** se propaga; (2) o que é **da linha**: valor, taxa de IVA, descrição, `specification`, `category_id`, `event_id`, `is_transitory`, `exclude_from_result`, `invoice_ref`; (3) o que é **do pagamento**: `account_id`, `payment_method`, `payment_entity`, `payment_reference` — tem máquina própria em `transaction_payments` e nunca entra na propagação. `invoiceSharedFields` ficou com três entradas: `supplier_id`, `date`, `due_date`.
- **Agrupar passou a ser ato explícito (14/09).** A gravação de uma transação chamava `autoGroupInvoiceForTransaction` e podia criar um grupo sem ninguém pedir. Removida do caminho de gravação: agrupar só acontece com clique. Defeito irmão corrigido: `checkInvoiceDocumentsConsistency` comparava por `file_url` exato mas fazia a interseção só sobre as linhas **com** documento, e por isso uma única linha com documento "partilhava" documento consigo própria e passava a trava de 08/09. ⚠️ **Regra que não se flexibiliza:** a comparação de `invoice_ref` é **igualdade exata** e nunca pode ficar mais tolerante. Caso que a fixa: as portagens são vários lançamentos de ida e volta, com valores iguais ou quase iguais e números de fatura parecidos — são lançamentos **diferentes** e não se agrupam. Limpeza feita em Live: o par `0f7057bf` foi desagrupado e o `invoice_ref` das duas linhas foi limpo. Vigilância nova: invariante `grupo_fatura_veredicto_desagrupar_por_aplicar`, referência 0 — valor acima de zero significa que a revalidação por OCR acertou e ficou à espera de um clique que ninguém deu.
- **Sponsorship Pipeline ↔ Simulador.** Simulador lê só BP (`event_forecasts` em L3 sob L2 1.2); ponte é `syncSponsorToBP` que promove cards closed/barter+auto_sync_bp ao BP via 1.2.01/1.2.02; cards em negociação NÃO contam no Simulador.
- **BP installments.** Programar N parcelas: 1 linha BP↔N TXs (mesma category_id+event_id), back-link 1ª via transaction_id; matching faz UNION direct+category — nunca voltar a "só transaction_id".
- **Forecast boost calibrator.** RPC `calibrate_forecast_boost(event_id,window)` calcula boost real (final/base velocity) a partir de ticket_sales; UI no Simulador (botão "Calibrar a partir de evento…") preenche `forecast_final_accel` + `forecast_final_window_days`.
- **Simulator public unit.** Simulador unifica público em "Presenças × dia" (1 Passe 2 dias = 2); KPI "Bilhetes únicos" removido; targets BE/Forecast e per-pessoa todos em presenças.
- **Coala v13 reconciliation pending.** PAUSADO 2026-05-07: BP Coala PT 2026 bate (299 linhas, €1.228.266,23); pendentes 5 itens em pagamentos somando +€30.535,87 (Mídia FB, Airbnb, Ana Frango split, Refação Lona, Impressão plantas) + 2 datas Hostess trocadas; regras: ignorar A&B, líquidos, BR→MANDO (COALA BR), administradoras→0.0.99, parcelas 1↔N.
- **Standalone invoices.** Scanner `/scanner-faturas` (admin) + aba "Faturas Avulsas" no Contabilista; tabela `standalone_invoices` + bucket privado; NUNCA cria transação/BP/lista.

## A trabalhar agora

Nada em execução.

A conta corrente do sócio ficou fechada a 17/09 (#193). Estado a essa data,
com o ano de extratos completo:

| | |
|---|---:|
| Folha de vencimentos jan–ago (bruto) | 55.048,38 |
| Faturas avulsas (63) | 26.591,27 |
| **Coberto** | **81.639,65** |
| Retiradas nominais jan–set | −211.300,00 |
| **Por justificar** | **−129.660,35** |

Por entrar do lado da cobertura: folha de set a dez (~28.000) e as faturas
ainda por carregar da Drive. **O ano fecha com pelo menos 100 mil por
justificar** — matéria para a contabilista (Margarida Martins, Expert
Numbers), não para o sistema, e enquanto há ano para agir.

## Próximo passo concreto

O Santander está implantado (122.363,05 € com corte a 31/08/2026) e o extrato fecha a zero até 11/09. O que está por fazer:

1. **Pagar os seis repasses ZigPay** — `pending`, **17.906,94 €** no total, com NIF e IBAN já preenchidos nos seis fornecedores. O fluxo **por operador** é: pagar o repasse **por transferência** e liquidar a receita correspondente **por compensação**, no mesmo dia. Quando as doze estiverem liquidadas, o saldo do grupo `ACERTO-FOOD-IVETE-2026` tem de ser **7.530,40 €**.
2. **Fechar os 121,50 € da Garrafeira Estado D'Alma** — anexar a fatura e substituir o **IVA a 0% provisório** pelo desdobramento base/IVA real.
3. **Decompor o cashless da Ivete (895,70 €)** — o depósito está **conciliado** mas por decompor, à espera do fecho dos bares. Teste a fazer quando chegar: o dinheiro apurado (liquidação TPA + numerário) tem de cobrir a totalidade das vendas de alimentos **e** bebidas — para o que é preciso que o relatório traga a **origem do pagamento por venda**.
4. **Entrar com os quatro ativos exclusivos MP+EIN da Anitta**, ainda fora do ERP e à espera de uma issue fechada — remedir antes de manter esta pendência: IVA dedutível **266.345,18 €**, bares **93.969,63 €**, bengaleiro **138,82 €**, patrocínio Oeiras **50.000,00 €**.
5. **Levar o saldo para o servidor nos sítios que faltam** — Contas, Extrato, cartões e bilheteiras continuam a somar saldo no cliente (furo assumido nas D-ERP34/D-ERP36).
6. **A transação `ea1dae50-393c-4d19-b2f6-773491c8b8ca`**, portagem de **1,60 €** de 08/09, está fora de qualquer nota de reembolso: ou falta na nota ou é duplicado. Só a Letícia pode dizer.
7. **A linha `c924c418` da nota R-030/2026 continua sem documento anexo.**
8. **Falta decidir o modelo de fornecedor partilhado entre empresas** (MP e Coala Festival Portugal): hoje é um registo por empresa. Decisão em aberto.
9. **Ticketline 112.000 € de 16/09 (TRF.IMED. R06117979) por lançar como transferência Ticketline → Santander (regra a guardar); atribuição ao apuramento em ticketing-e-receita.**
10. **#189: "transações sem movimento no banco" falso quando a linha vive noutro extrato — verificação por conta.**

11. **Levar os números da conta corrente à contabilista.** As retiradas de
    2026 estão todas lançadas (211.300,00 € de 07/01 a 09/09) e a cobertura
    conhecida é 81.639,65 €. Falta carregar as faturas que restam na Drive
    e lançar a folha de set a dez à medida que chega.


Já feito e sem pendência: a **FT 11.1/101** está anexada ao movimento do banco de **135.986,96 €** e replicada nas duas transações ligadas.

Depois:

Percorrer no painel de Admin as 22 linhas por rever da auditoria de grupos de fatura (#134): 7 sem documento anexo, 9 sem número legível, 2 proformas, 3 comprovativos de transferência e 1 outro caso. Decidir à parte a linha de 27.318,75 € do EVIL ANGELS II, cujo único anexo é a nota de crédito NC A1/175 dentro do grupo da fatura FAC A1/4831 (#135). Depois disso, testar em Live o ciclo novo das Faturas Ads, por esta ordem: (1) abrir a fatura 254484037 de julho e carregar em "Gerar lançamentos" — tem de devolver 409 e listar os quatro lançamentos manuais da Delia de 03/08; (2) reabrir uma fatura confirmada e verificar que as campanhas Meta destrancaram; (3) reatribuir uma linha à mão e confirmar o carimbo de autor no tooltip. A reversão não se testa em Live enquanto não houver uma fatura aplicada que se possa perder sem custo.

## Bloqueios

- **(a) Regra dos cupões da Meta por decidir.** Em maio foram abatidos à Simone, em junho à Ivete; não há regra escrita.
- **(b) Regime de IVA das faturas Google por confirmar.** Não existe nenhuma transação de Google no sistema.
- **(c) 47.429,39 € de tráfego por lançar.** Abril: a mãe de 9.995,23 € estava na rubrica errada (10.8.07 Outros) e foi corrigida para 3.2.01 Digital a 07/09; tem agora uma filha (Anitta, 1.312,02 €) e faltam ratear 8.683,21 €. Agosto: 38.746,18 € da fatura de 02/09, dos quais 34.702,85 € são do Raphael Ghanem.
- **(d) Jan-26, Fev-26 e parte de Mar-26 nunca entraram no sistema — 71.989,54 €.** Issue fechada — remedir antes de manter esta pendência.

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

**Google Ads: débito por limiar lança-se pelo par 10.3 para a conta "Google Ads" (regra debito direto-google ireland já existe); o custo por evento vem das Faturas Ads. Via Verde: regra a 23% de IVA desde 16/09.**

**O extrato do Santander bate ao cêntimo com o sistema a 16/09 (481.658,14 €) antes do crédito Ticketline.**

**O saldo de conta nunca filtra `reversed_at`.** A RPC `reverse_transaction` tem dois tipos de estorno: `cash_refund` põe `paid_amount = 0` (o dinheiro voltou), `supplier_credit` mantém o `paid_amount` (o dinheiro saiu mesmo e nasce um crédito no fornecedor). `paid_amount` já é a resposta certa nos dois casos; filtrar `reversed_at` no saldo inflacionaria os estornos por crédito de fornecedor.

**Existem três overloads de `reverse_transaction` em Live.** A de 5 argumentos (`p_tx_id`, `p_kind`, `p_reason`, `p_valid_until`, `p_release_for_repayment`) é a correta e é a única chamada pelo frontend, em `PaymentTimeline.tsx`. A legada de 3 argumentos (`p_transaction_id`, `p_reversal_kind`, `p_reason`) continua viva sem consumidor e não toca em `transaction_payments` nem liberta a transação das listas. Estornar por SQL direto, sem a RPC, deixa `reversal_kind` a NULL e o `paid_amount` intacto — foi o que corrompeu o saldo do Santander em 3.177,96 € entre 01/09 e 07/09.

**A despesa do fecho de um evento é a soma das linhas de BP, não a soma das transações.** Lançar uma transação contra uma linha de BP que já contém o valor não altera o resultado do evento nem o apuramento por sócio — só converte previsão em realizado. Só há impacto no resultado se o total ligado à linha exceder o BP, e aí entra como custo fora do BP.

**Reverter uma fatura Ads aplicada apaga a transação-mãe, e as filhas caem por CASCADE.** Sete guardas correm antes e nenhuma é opcional: pago ou com `paid_amount` > 0, `settlement_id`, `card_session_id`, linha em `transaction_payments`, presença em `payment_list_items`, `reimbursement_note_items` ou `reimbursement_notes`, conferência em `accountant_transaction_reviews`, e data dentro de um período já em `accounting_exports`. A ordem das operações é fixa: soltar `event_forecasts.transaction_id` (FK NO ACTION, é a que bloqueia), apagar a mãe, e só depois apagar os ficheiros do storage.

**A rubrica de destino de uma fatura de tráfego não é garantida.** A fatura Meta de abril (252466632) esteve quatro meses lançada em 10.8.07 Outros em vez de 3.2.01 Digital, e por isso não aparecia em nenhuma leitura do Digital. Ao conferir tráfego pago, procurar por `invoice_ref` e por fornecedor, nunca só por categoria.

**O espelho segue a transação, nunca a linha de BP nem a linha de pagamento.** Uma transação pode cobrir várias linhas de BP e continua a ser uma só saída de dinheiro. E `transaction_payments` não é âncora fiável: na conta de Madrid havia uma transação com o pagamento gravado duas vezes e outra com o valor em reais. O `paid_amount` da transação é a verdade. Filhas de rateio nunca recebem `account_id`, portanto nunca geram aporte duplicado.

**`transaction_payments` não tem campo de moeda.** O pagamento do consórcio tem 68.770,80 numa transação de 11.385,52 — é o valor em reais (câmbio 6,04), não um erro. Quem somar essa tabela mistura moedas sem aviso.

**O ramo 10.1 não alimenta o mapa de sugestão de rubricas.** Guarda acrescentada a `coala_capture_category_change` em 07/09: sem ela, cada aporte espelhado escrevia uma linha em `coala_supplier_category_map`.

**Cartão de fatura agrupada no picker de Listas de Pagamento.** `buildPickerRows` colapsa as transações com o mesmo `invoice_group_id` numa linha única identificada só por fornecedor + `invoice_ref`; as descrições dos itens não são renderizadas com o grupo fechado. Uma transação elegível parece não existir, e a pesquisa por descrição não lhe acerta — o que leva o utilizador a lançá-la outra vez. Caso real a 08/09: `FT 11.1/66` da KARINUR, duas transações de 345,00 € do Tour M&M. Corrigido a 08/09: grupos de 3 itens ou menos abrem por omissão, e a pesquisa passa a ler as descrições dentro dos grupos e a expandir o grupo com match. A selecção continua atómica por fatura.

**Os seis lançamentos de hotel do Deive Leonardo (Vila Galé FT 132026/33986 e Meliã PROFORMA 194/2026) têm grupo de fatura e documento anexo desde 16/09 — não voltar a anexar.**

**Os mapas de vencimento da Expert Numbers chegam à conta
pedroneto@socialmusic.com.br, não à mundopropicio.com.** Cinco anexos por
mês (FF, MV, RET, RV, SS); o **MV é acumulado do ano** e é o único que
é preciso abrir. Há meses com retificação — vale sempre o último envio.

**A ajuda de custo por quilómetros é a rubrica "Quilómetros" na folha e
representa 85% do que o sócio recebe** (46.670,48 € contra 7.360,00 € de
vencimento, jan–ago 2026). É o valor que sustenta quase toda a
justificação da conta corrente e o mais exposto numa inspeção.
**Não existe levantamento de numerário na MP para uso pessoal** (decisão
do Pedro, 17/09). Os cinco levantamentos de 2026 — 7.000,00 (04/02),
9.050,00 (23/02), 24.436,26 (31/03), 21.215,00 (20/05), 8.010,00 (28/08),
total 69.711,26 € — são caixa da empresa e ficam fora da conta corrente
do sócio. Não reabrir.


## Página de Contas: três dinheiros, três cartões (09/09/2026, D-ERP27)

**SALDO TOTAL é caixa, e só caixa.** Soma apenas `bank`, `cash` e `prepaid_card` com controlo de saldo. Debaixo do valor nomeiam-se as contas de caixa que ficaram fora por `skip_balance_check` — hoje a Conta Pagamento Brasil e a Eventos Históricos. Antes somava tudo e dava −1.994.414,66 €.

**As bilheteiras têm fonte própria.** Na coluna Saldo Atual, as contas `ticket_office` passam por `computeTicketOfficeBalance` (D-ERP15) e não pela fórmula bancária: a receita de bilhetes vive em `ticket_sales` e a conta só veria as saídas (Ticketline aparecia a −3.657.013,07 €, BOL a −59.352,72 €). O total dos saldos retidos tem cartão próprio, "Retido em Bilheteiras", e nunca soma ao caixa.

**Acertos não são caixa.** As contas `other` (Acerto EIN · Anitta EDA 2026, Pgto Mágicos Acerto Madrid, Pagamento Diretoria) saíram do SALDO TOTAL para o cartão "Acertos em Curso". A Acerto EIN entrava a +905.000,00 € como se fosse dinheiro em conta.

**Santander implantado.** Corte a 31/08 (D-ERP25), saldo correcto a 407.199,12 €. A data de corte passou a sair em pt-PT na coluna Saldo Inicial.

## Lançar a partir do banco (09/09/2026, D-ERP29 / D-ERP30)

Nas linhas por explicar da conciliação há agora **Lançar**: abre um formulário já preenchido pela regra que casar (`bank_line_rules`) e cria a transação só depois de confirmação humana — nunca automaticamente. O valor e a data vêm do banco e não se editam; a transação nasce paga na conta do extrato e a linha fica ligada por `created_transaction_id`.

Selecionando várias linhas cria-se **um** lançamento pela soma. Foi o que se fez a 10/09 com o TPA do bar do Ivete Clareou: as **16 linhas EST-0002TPA de 07/09, 27.241,87 €**, deixaram de estar por explicar — foram lançadas pela soma como **entrada transitória** (`is_transitory = true`, sem rubrica, evento Ivete Clareou) na conta Santander. Não é receita: dos 27.241,87 € só **7.845,83 € s/IVA** são da MP (comissão de 25% — 6.095,83 € — mais 1.750,00 € de fees de operação); o resto é dos operadores e vai ser repassado. A decomposição foi feita a 11/09 no fecho do A&B: receitas reconhecidas por compensação sem conta, taxas bancárias de 315,43 € em `2.9.04`, e seis repasses transitórios de 17.906,94 € por pagar. Para o lançamento pela soma funcionar, o índice `uq_bank_line_matched_txn` passou a parcial (D-ERP33).

O modal ganhou a caixa **"Transitória (a repassar)"**: com ela ligada a transação nasce `is_transitory = true`, a rubrica é opcional e não se guarda regra. E a direcção do par de transferência passou a seguir o sinal do movimento — numa linha de **crédito** a entrada é na conta do extrato e a saída na conta de destino (antes era sempre o contrário).

Os débitos por limiar do Google Ads não são despesa: a regra gera o par de transferência (rubrica 10.3) para a conta "Google Ads — conta corrente", cujo saldo passa a ser o crédito por consumir. **Pendente do utilizador:** criar essa conta financeira (tipo `other`) — não foi criada por este trabalho, que não lançou nem criou dados.

As taxas bancárias (comissão de gestão, imposto de selo, comissões e selos dos lotes SEPA) vão para 10.6.01, sem evento. As taxas de meios de pagamento (TPA/ZigPay) vão para `2.9.04`, com evento e linha de BP.

## Onde ler mais

- `.lovable/memory/features/payment-amount-invariants.md` — soma de pagamentos e paid_amount nunca excedem o bruto
- `.lovable/memory/features/payment-account-ownership.md` — conta e pagamento só na transação-mãe; "Marcar como Pago" é visual
- `.lovable/memory/features/financial-accounts-non-accounting-flag.md` — contas gerenciais fora da exportação contabilística
- `.lovable/memory/features/invoice-groups.md` — agrupamento por documento, desagrupar, auditoria OCR e painel Admin
- `.lovable/memory/features/standalone-invoices.md` — scanner e aba Conferência das faturas avulsas
- `.lovable/memory/features/card-sessions.md`, `supplier-credits.md`, `transaction-installments.md`, `role-accountant.md`
- `.lovable/memory/features/account-balance-cutoff-date.md` — data de corte do saldo inicial e skip_balance_check
- `docs/DECISIONS.md` — D-ERP34 (contas e movimentos confidenciais, saldo validado no servidor), D-ERP35 (conta de liquidação e conciliação entre contas), D-ERP36 (saldo a uma data validado no servidor), D-ERP37 (funções SECURITY DEFINER fechadas por omissão), D-ERP38 (portão de permissão e isolamento de empresa nas funções de BP), D-ERP41 (o anexo do movimento do banco pertence ao movimento e nunca é visível ao sócio), D-ERP42 (os anexos seguem a confidencialidade da transação), D-ERP71 (o documento pertence à fatura; a ingestão por API é a confirmação humana do agrupamento), D-ERP74 (taxas de transferência identificadas pela referência são custo do evento da transferência-mãe), D-ERP75 (`system_audit_log` é a única tabela sem obrigação de `company_id`)
- Issues #91, #125, #127, #134, #135, #149 (#90 fechada)

---

Ficheiros alterados:
- `docs/estado/estado-financeiro-e-tesouraria.md` (único ficheiro alterado)
