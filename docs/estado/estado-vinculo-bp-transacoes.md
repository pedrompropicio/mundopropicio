# ESTADO — Vínculo BP ↔ Transações

Atualizado: 2026-09-03 · D2 em produção nos actos de aprovação; cartões e guarda de fecho a seguir

## Em que pé está
O vínculo canónico é `transactions.forecast_id` (N transações : 1 linha). A 02/09 foram escritas **168 FK** em rubricas com uma linha única — onde o matching já era determinístico e a escrita não muda número nenhum.

**Cobertura à data do backfill:** 338 de 606 transações de despesa ligadas a evento (55,8%), **1.498.707,22 € de 1.858.714,76 € (80,6% do valor)**. Antes: 165 TX e 1.102.179,73 €.

Depois de 02/09 fechou-se a fuga que fazia a cobertura degradar-se sozinha: os caminhos que criavam despesa de evento **já aprovada ou já paga**, sem nunca passar por `pending`, e portanto sem nunca cruzar a trava.

## A trabalhar agora
**Passo 2 — Cartão pré-pago passa ao modelo do camarim.**
Itens durante a sessão; transações só no fecho; consolidadas por evento × rubrica × IVA. Linha de BP por par evento × rubrica quando o evento é `with_bp`; D2 sobre as somas no fecho. Itens sem evento consolidam-se por rubrica × IVA e ficam fora do BP. Uma sessão aberta por cartão já é garantida pelo índice `ux_card_sessions_active_per_card`.

**Passo 3 — Guarda de fecho do evento.**
`events.status` não passa a `'completed'` com sessão de camarim por integrar ligada ao evento, sessão de cartão aberta com item do evento, ou nota de reembolso com despesa do evento por aprovar. Trigger + passo novo no PROC-fecho-evento.

Depois: #114 (trava do excesso de verba no trigger como última linha de defesa).

## Fechado agora (D1 + D2 + D8 + D13–D16)

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
Passo 2 — cartões pré-pagos ao modelo do camarim (itens durante a sessão, transações só no fecho, consolidadas por evento × rubrica × IVA, linha de BP por par evento × rubrica, D2 no fecho).

## Bloqueios
Nenhum.

## Factos que não se reinvestigam

**O universo real da decisão são 227 transações, 337.834,08 €** — as que estão em rubricas com VÁRIAS linhas de BP, onde há escolha humana a fazer e o `scoreDescriptionMatch` ainda decide. Metade do valor está em três rubricas: OOH 135.640,00 € (6 TX), Per Diems 81.203,06 € (69 TX), Cenografia 51.320,04 € (3 TX).

**A FK ganha sempre ao matching.** Uma TX com `forecast_id` é reclamada pela sua linha mesmo com score zero (entra por `directTx`) e é excluída de todas as outras linhas da rubrica. Escrever a FK tira o algoritmo do caminho.

**Rubrica com uma linha nunca usou tokens.** A regra 2 do matching é determinística. O backfill das 168 foi arrumação, não correção.

**Medir o vínculo tem de subir ao master no rateio.** Uma filha herda o `forecast_id` do pai; métricas sem `coalesce` pelo `parent_transaction_id` subestimam a cobertura.

**Onde as transações nascem (8 caminhos, medido a 02/09):** directa/modal 467 TX · rateio filha 136 · reembolso 74 · cartão 58 · grupo de fatura 47 · parcelamento 23 · settlement 14 · camarim 5. Três nunca escreviam linha — é por isso que a regra vive no servidor e não nos formulários, e é por isso que o D13 teve de descer ao `INSERT`.

**A2 — achado por abrir (P2).** `allowedEventIds` inclui null em `findMatchingTransactionsForForecast`: uma TX com `event_id` nulo é elegível para o matching de qualquer evento.

**12 transações têm FK para linha de outro evento e 2 para outra rubrica** — todas alteradas a 28/08, são mães de rateio (`event_id` nulo) ligadas a linhas de eventos, normal no desenho. As 2 de rubrica divergente ficam como observação.

**Sessão de cartão é multi-evento por natureza.** A sessão `ffdea120` tocou 6 eventos e tem despesas sem evento (rubricas 10.x). `card_session_items` existe com o formato certo mas tem zero itens na história — o gestor regista directo e cada despesa vira transação na hora.

## Onde ler mais
- `src/lib/bp-tx-matching.ts`, `src/lib/bp-line-required.ts`, `src/lib/bp-budget-excess.ts`, `src/components/LinkBpLineDialog.tsx`, `src/components/RaiseBudgetDialog.tsx`
- `supabase/functions/approve-transaction/index.ts`, `supabase/functions/close-camarim-session/index.ts`
- `docs/DECISIONS.md` — DR-2026-09-02-D1, D2, D8, D12 e DR-2026-09-03-D13 a D16
