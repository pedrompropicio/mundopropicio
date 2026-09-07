# ESTADO — Vínculo BP ↔ Transações

Atualizado: 2026-09-07 · D2 em todos os actos de aprovação; cartão no modelo do camarim; guarda de fecho do evento

## Em que pé está
O vínculo canónico é `transactions.forecast_id` (N transações : 1 linha). A 02/09 foram escritas **168 FK** em rubricas com uma linha única — onde o matching já era determinístico e a escrita não muda número nenhum.

**Cobertura à data do backfill:** 338 de 606 transações de despesa ligadas a evento (55,8%), **1.498.707,22 € de 1.858.714,76 € (80,6% do valor)**. Antes: 165 TX e 1.102.179,73 €.

Depois de 02/09 fechou-se a fuga que fazia a cobertura degradar-se sozinha: os caminhos que criavam despesa de evento **já aprovada ou já paga**, sem nunca passar por `pending`, e portanto sem nunca cruzar a trava.

## A trabalhar agora
Nada em execução.

## Fechado agora (D1 + D2 + D8 + D13–D19)

### Os três passos de 03/09

**Passo 1 — D2 em todos os actos de aprovação.** RPC `raise_forecast_budget` (SECURITY DEFINER, exige `raise_budget`, observação obrigatória, só sobe, não toca em `baseline_amount`, auditoria em `forecast_audit_log`), helper `bp-budget-excess.ts` e `RaiseBudgetDialog` (uma ou várias linhas, observação comum). `approve-transaction` e `close-camarim-session` ficaram atómicos: validam tudo, aplicam os raises e só depois escrevem. Reembolsos agrupam por par evento × rubrica; cachê variável actualiza a linha do módulo, cachê fixo passa pelo diálogo.

**Passo 2 — Cartão pré-pago no modelo do camarim (D17 + D18).** As despesas são ITENS durante a sessão (`card_session_items`) e só viram transações no fecho, pela `close-card-session`, consolidadas por **evento × rubrica × IVA**. Linha de BP por par evento × rubrica em evento `with_bp`; **D2 aplica-se às SOMAS** do grupo, com os raises antes de qualquer escrita. Itens **sem evento** (rubricas 10.x) consolidam por rubrica × IVA e ficam **fora do BP**. Dois saldos no ecrã: contabilístico e real estimado (menos os itens abertos). **Alocação obrigatória das antigas (D18):** transações directas anteriores ao modelo, com evento e rubrica, são sempre alocadas à linha do par — criada na L3 se não houver — e entram no excesso como "a alocar"; sem opção de as deixar soltas.
As **2 sessões abertas funcionam já no modelo novo**, sem fecho prévio: **Délia · 8363** (`a8257a56`) com **13 transações antigas, todas da Ivete**, e **Suelen · 0663** (`cac2f5a0`) com **1 antiga sem evento**. `holder_profile_id` só é obrigatório na abertura de sessões novas.

**Passo 3 — Guarda de fecho do evento (D19).** Função `public.event_close_blockers(uuid)` como fonte única (hard: camarim por integrar, cartão aberto; soft: despesas pendentes) e trigger `enforce_event_close_blockers` BEFORE UPDATE OF status, só na transição para `'completed'`, com `P0001` em pt-PT e **sem isenção** — nem `service_role`. Na UI, `CloseEventGuardDialog` consulta antes de gravar, impede o avanço com bloqueio duro e exige confirmação explícita quando há despesas pendentes. `PROC-fecho-evento.md` ganhou o **Passo 0-bis — Sessões abertas**.
**Medido em Live ao fechar:** com o trigger ligado, hoje **só a Ivete Clareou 2026 ficaria bloqueada** (1 sessão de cartão aberta, Délia Braga). **Anitta - EDA 2026, Coala Festival Portugal 2026, SM - Lisboa e SM - Porto têm 1 despesa pendente cada** — aviso com confirmação, não bloqueio.

### Detalhe dos passos anteriores

**1. `approve-transaction` — service_role a contornar o trigger.**
Era o caminho vivo de aprovação a partir de `src/pages/Transactions.tsx` (individual e em lote) e fazia o update com `service_role`. Como `auth.uid()` é `NULL` nesse caso, a isenção do trigger `enforce_transaction_approval_permission` aplicava-se e a função contornava tanto a permissão `approve_transactions` como a obrigatoriedade de linha de BP: a trava D1+D8 era, nesse caminho, apenas de UI.
Corrigido: autoriza por permissão (`is_platform_admin` OU `has_permission_in('approve_transactions', company_id)`, avaliado uma vez por empresa do lote) em vez do papel admin/manager, e replica o gate D1+D8 no servidor — bloqueia `type='expense'` com `event_id`, sem `parent_transaction_id`, sem `forecast_id`, em evento `with_bp`, devolvendo 409 com `blocked_ids` e não aprovando nada do lote. `readApproveError` em `Transactions.tsx` traduz o 409.
Verificado em Live antes da troca: Pedro Neto, Juliana Martins e Matheus Coelho continuam a passar pela via da permissão. Ninguém perdeu acesso.

**2. D2 — excesso de verba na aprovação.**
Implementado em produção a 03/09. Quando um acto de aprovação faz o realizado de uma linha de BP ultrapassar a verba corrente (`event_forecasts.amount`), o sistema exige elevar a linha no mesmo acto; não existe "assumir o excesso" nem normalização posterior. Base líquida (`transactions.amount`) contra verba corrente; realizado = soma de `amount` das transações `approved`/`paid` com aquele `forecast_id`, excluindo as que `hasResultBlockingFlags` apanha.

- `public.raise_forecast_budget(_forecast_id uuid, _new_amount numeric, _observation text)` — RPC `SECURITY DEFINER`, exige `auth.uid()`, `is_platform_admin` ou `has_permission_in(..., 'raise_budget', company_id)`, observação obrigatória, só permite subir, não toca em `baseline_amount`, escreve `forecast_audit_log` com `field_name='Valor (EUR)'`.
- `src/lib/bp-budget-excess.ts` — helper puro que agrega por `forecast_id` e devolve verba actual, `baseline_amount`, realizado, a aprovar, excesso e verba sugerida.
- `src/components/RaiseBudgetDialog.tsx` — modos `onConfirm` e `applyViaRpc`; mostra uma ou várias linhas em excesso; verba editável só para cima; observação comum e opcional por linha; nota de arredondamento de IVA quando excesso ≤ 5 € ou ≤ 1%; utilizador sem `raise_budget` só vê explicação e botão “Entendi”.
- `approve-transaction` — aceita `budget_raises`, calcula excesso por linha após D1+D8, devolve 409 `budget_excess` se faltar raise, valida permissões/observações, aplica todos os raises e auditoria antes de aprovar, escreve `transaction_audit_log.field_name='bp_budget_raised'` nas transações afectadas.
- `close-camarim-session` — aceita `budget_raise`, calcula excesso com realizado mais bases líquidas dos itens aprovados de despesa (excluindo pernas do acerto), devolve 422 `budget_excess` se faltar raise, valida e aplica antes de criar transações.
- Reembolsos agrupam a escolha da linha por `(event_id, category_id)` e usam `RaiseBudgetDialog` em `applyViaRpc` antes de aprovar.
- Cachê variável actualiza automaticamente a linha `cache_module` quando o total supera a verba; cachê fixo calcula excesso após escolha da linha e abre `RaiseBudgetDialog` em `applyViaRpc` antes dos inserts.

Cartões pré-pagos ficam deliberadamente fora deste passo — serão redesenhados no Passo 2.

Medido em Live antes de construir: **194 linhas com vínculo**, **6 excedidas (1.800,94 €)**, **1 pendente que excederia ("Copos", Anitta, 2 € sobre 9.120 €)**, **17 linhas com `amount ≠ baseline_amount`**.

**3. O buraco maior — o trigger só via `'approved'`.**
Havia caminhos inteiros que nascem `'paid'` e nunca passavam por lá. Medido em Live: **58 transações de cartão**, das quais **52 são despesa de evento `with_bp` sem linha de BP**; **3 sessões de camarim**; e as consolidadas em geral.
Corrigido (DR-2026-09-03-D13): a verificação de LINHA passa a correr no `INSERT` com status `'approved'` **ou** `'paid'`, e no `UPDATE` que transita para `'approved'`. **Não** corre no `UPDATE` que transita para `'paid'` — há **462 transações antigas aprovadas sem linha em eventos `with_bp`** e bloquear o pagamento delas seria mexer para trás no meio de um fecho. A verificação de PERMISSÃO continua exclusiva da transição para `'approved'`: pagar é outro acto. O comentário na função explica a exclusão, para ninguém a "corrigir" sem decisão.

**4. Cachê (DR-2026-09-03-D15).**
Medido em Live: **5 configurações de cachê, todas variáveis, 2 sem linha de BP** (Deive Leonardo Braga e Lisboa, ambos `with_bp`) — cobertas por criação preguiçosa na primeira geração de transação, sem DML.
Variável: a linha é do módulo (`formula_type='cache_module'`), garantida por ele, e a transação nasce vinculada; as N partes de um split entram na mesma linha. Fixo: não há linha automática — segue o fluxo de qualquer despesa, com `LinkBpLineDialog` em modo `pickOnly`.
A retenção saiu por completo do fluxo do cachê (D15 revista em 03/09): não é custo do evento — é parte do cachê entregue ao Estado em nome do artista — logo não gera despesa nem linha de BP, não se desconta no pagamento e não aparece em ecrã nenhum (modal, acerto e modelo de cálculo limpos). Os únicos descontos são os do modelo configurado: percentagem/faixas, base de receita, base de dedução e percentagem de dedução fixa (calculados em `useRealCacheCalculation`). As colunas `withholding_*` ficam inertes na BD, sem UI.

**5. Cartões pré-pagos (DR-2026-09-03-D14).**
Nascem `'paid'`, logo a regra tem de viver no ecrã. `NewCardExpenseModal.tsx` e `ApproveCardItemModal.tsx`: antes do insert, se a transação vai ter `event_id`, é despesa e o evento é `with_bp`, abre o `LinkBpLineDialog` em `pickOnly` e insere já com `forecast_id`. `CloseCardSessionModal.tsx` fica fora — o acerto de fecho não tem `event_id`.
**Nota:** este passo será substituído pelo modelo do camarim no Passo 2.

**6. Camarim (DR-2026-09-03-D16).**
Uma sessão, uma linha (N:1). A rubrica é sempre 2.6.04, logo a escolha é da sessão e não do grupo de consolidação: todas as consolidadas de despesa nascem no mesmo `forecast_id`. As duas pernas do acerto de adiantamento são transferência interna 10.3 sem evento e não levam linha.
A escolha faz-se em `CamarimSessionDetail.tsx` (`LinkBpLineDialog`, `pickOnly`) e vai no body de `close-camarim-session`, que valida: existe · é do evento para onde a sessão gera · rubrica 2.6.04 · obrigatória se o evento é `with_bp` → 422 em qualquer falha.
Armadilha fechada no mesmo pré-voo: o `event_id` de cada item resolve-se por `bp_scope` (`master_common` → `master_event_id`, resto → evento primário), pelo que uma sessão pode gerar transações de dois eventos. Carimbar uma linha única em todas poria a linha de um evento numa transação de outro (contra a DR-2026-08-22). Agora o pré-voo calcula o conjunto de `event_id` distintos dos itens aprovados e, se for mais do que um e algum for `with_bp`, devolve 422 e não integra nada. Nenhuma das 3 sessões em Live tem `master_event_id` nem mistura escopos — era armadilha latente, não problema vivo.

**7. Autorização da `close-camarim-session`.**
Deixou de testar `user_roles` (admin/manager/platform_admin) e passa a `is_platform_admin(caller)` OU `has_permission_in(caller, 'approve_transactions', company_id da sessão)`, igual à `approve-transaction`.

**8. Isenções e propagação.**
`ReimbursementNoteDetail.tsx`: "Aprovar Nota" passa por `requestApproveNote()`, que agrupa transações bloqueadas por `(event_id, category_id)`, escolhe a linha uma vez por grupo via `LinkBpLineDialog` e aplica `forecast_id` a todas as despesas do grupo; depois calcula excesso agregado e usa `RaiseBudgetDialog` em `applyViaRpc` antes de aprovar.
Propagação às filhas por `parent_transaction_id` mantida. Medido em Live: **136 filhas de rateio e 12 parcelas**, nenhuma pendente. Aprovar a mãe aprova as filhas — aprovação não é pagamento.
Isenções vigentes no trigger: `auth.uid() IS NULL`, `parent_transaction_id IS NOT NULL`, `type <> 'expense'`, `event_id` nulo, evento sem BP.

## Próximo passo concreto
**#114 — D2 e D1 no trigger, como última linha de defesa** para os caminhos de escrita directa, agora que todos os ecrãs estão ligados (cartões incluídos). Depois: os **3 cards meio-ligados da Anitta** (Durex 15.000 €, Matudis 6.000 €, Durex aluguer 813,01 €) corrigem-se **à mão com o padrão SQL do Casino**, depois do fecho da Anitta — nunca pelo botão.

## Bloqueios
Nenhum.

## Factos que não se reinvestigam

**A sessão de camarim "CAMARIM - Henry & Klauss (Coliseu - Porto)" está `open` sem nenhum evento ligado** em `camarim_session_events` (e sem `master_event_id`) — é **invisível para a guarda de fecho** até alguém a ligar ao evento. Ver a issue aberta em 03/09.

**`'completed'` em `events` é o fecho financeiro, não o dia do espectáculo.** A Anitta e o Coala 2026 continuam `'active'` em fecho; os eventos da tour M&M de Agosto, já apurados, estão `'completed'`.

**O universo real da decisão são 227 transações, 337.834,08 €** — as que estão em rubricas com VÁRIAS linhas de BP, onde há escolha humana a fazer e o `scoreDescriptionMatch` ainda decide. Metade do valor está em três rubricas: OOH 135.640,00 € (6 TX), Per Diems 81.203,06 € (69 TX), Cenografia 51.320,04 € (3 TX).

**A FK ganha sempre ao matching.** Uma TX com `forecast_id` é reclamada pela sua linha mesmo com score zero (entra por `directTx`) e é excluída de todas as outras linhas da rubrica. Escrever a FK tira o algoritmo do caminho.

**Rubrica com uma linha nunca usou tokens.** A regra 2 do matching é determinística. O backfill das 168 foi arrumação, não correção.

**Medir o vínculo tem de subir ao master no rateio.** Uma filha herda o `forecast_id` do pai; métricas sem `coalesce` pelo `parent_transaction_id` subestimam a cobertura.

**Onde as transações nascem (8 caminhos, medido a 02/09):** directa/modal 467 TX · rateio filha 136 · reembolso 74 · cartão 58 · grupo de fatura 47 · parcelamento 23 · settlement 14 · camarim 5. Três nunca escreviam linha — é por isso que a regra vive no servidor e não nos formulários, e é por isso que o D13 teve de descer ao `INSERT`.

**A2 — achado por abrir (P2).** `allowedEventIds` inclui null em `findMatchingTransactionsForForecast`: uma TX com `event_id` nulo é elegível para o matching de qualquer evento.

**12 transações têm FK para linha de outro evento e 2 para outra rubrica** — todas alteradas a 28/08, são mães de rateio (`event_id` nulo) ligadas a linhas de eventos, normal no desenho. As 2 de rubrica divergente ficam como observação.

**Sessão de cartão é multi-evento por natureza.** A sessão `ffdea120` tocou 6 eventos e tem despesas sem evento (rubricas 10.x). `card_session_items` existe com o formato certo mas tem zero itens na história — o gestor regista directo e cada despesa vira transação na hora.

**Deploy directo de edge functions a 03/09:** o Publish não tinha levado `approve-transaction`, `close-camarim-session`, `close-card-session` nem `fetch-ticketline-reports` (esta ficou em v2.39 após dois Publish sem erro). As quatro foram deployadas directamente a 03/09 — desde então a versão em produção é a do repo. Regra operacional: confirmar a versão em produção após cada Publish que toque em edge functions.

## Onde ler mais
- `src/lib/bp-tx-matching.ts`, `src/lib/bp-line-required.ts`, `src/lib/bp-budget-excess.ts`, `src/components/LinkBpLineDialog.tsx`, `src/components/RaiseBudgetDialog.tsx`
- `supabase/functions/approve-transaction/index.ts`, `supabase/functions/close-camarim-session/index.ts`, `supabase/functions/close-card-session/index.ts`
- `src/components/events/CloseEventGuardDialog.tsx`, `docs/procedimentos/PROC-fecho-evento.md` (Passo 0-bis)
- `docs/DECISIONS.md` — DR-2026-09-02-D1, D2, D8, D12 e DR-2026-09-03-D13 a D19
