---
name: Automatismos da base na entrada de dados (o que a BD faz sozinha)
description: Inventário dos triggers que criam, alteram ou apagam linhas sozinhos quando se lança uma transação, um pagamento, uma linha de BP ou um evento, e das guardas que recusam a escrita (mensagens exactas). Ler antes de lançar dados à mão ou por SQL. Issue #410.
type: feature
---

# Automatismos da base na entrada de dados

**Regra de ouro: antes de lançar, saber o que a base faz sozinha.** Vários triggers criam a "outra metade" do lançamento (aporte, adiantamento, perna de pagamento, carga de cartão). Quem a lança à mão fica com tudo a dobrar. Outros reescrevem campos sem avisar, ou recusam a escrita. A lista abaixo foi lida do código em Live.

Convenções: *tx* = `transactions`; *perna* = linha em `transaction_payments`; *bruto* = `amount × (1 + iva_rate/100)`.

---

## A. Mecanismos que CRIAM / APAGAM / ALTERAM outras linhas

### A1. Conta-espelho de aporte do sócio — `sync_partner_aporte_mirror`
- **Dispara:** tx, AFTER I/U e BEFORE D.
- **Resumo:** despesa `paid`, sem `reversed_at`, numa conta com `mirror_partner_aporte = true` e `partner_id` → cria o aporte (receita 10.1.01), a ponte `partner_aporte_mirror` e o movimento `partner_capital_moves` (`kind='aporte'`, `flow='partner_settlement'`). O valor é o `paid_amount`. Se a despesa deixar de estar paga, for estornada, sair da conta-espelho ou for apagada, o aporte é apagado.
- **Diferenças entre o código em Live e o ficheiro de memória:** em Live o aporte leva a **mesma descrição da despesa** (sem o prefixo "Aporte automatico — "). O texto "Aporte automático do sócio, gerado pela conta-espelho …" fica em `specification`. `date` e `payment_date` = `coalesce(payment_date, date)` da despesa. `event_id` e `supplier_id` vêm do sócio (`event_partners`), não da despesa.
- **Regra prática:** lança-se só a despesa paga com a sua perna. Não se lança o aporte.
- **Memória:** `partner-aporte-mirror.md` (convém actualizar a descrição do aporte).

### A2. Custo partilhado com terceiros — `sync_shared_cost_mirror`
- **Dispara:** tx, AFTER I/U e BEFORE D.
- **Condições:** `type='expense'`, `shared_cost_account_id` preenchido, `status='paid'`, `reversed_at` nulo. Valor = `paid_amount`. Há uma guarda anti-recursão: o próprio espelho não dispara o espelho.
- **Cria:** uma receita `'Adiantamento por conta de terceiros — ' || descrição`, com `amount = paid_amount = valor`, IVA 0, `status='paid'`, `account_id = shared_cost_account_id`, `event_id = NULL`, `supplier_id = shared_cost_counterparty_id`, rubrica **10.12.01**, `payment_method='transfer'` e `exclude_from_result=true`. Cria também a ponte em `shared_cost_mirror`.
- **Em UPDATE:** reescreve a descrição, o valor, as datas, a conta e o fornecedor do espelho.
- **Ao reverter:** se a despesa for despaga, estornada, perder `shared_cost_account_id` ou for apagada, o espelho é apagado (a ponte cai por cascata).
- **Recusa:** se a empresa não tiver a rubrica 10.12.01, dá `Custo partilhado: rubrica 10.12.01 nao existe na empresa <id>`.
- **Regra prática:** lança-se a despesa paga com a conta do custo partilhado. Não se lança o "adiantamento por conta de terceiros".
- **Memória:** `custo-partilhado-terceiros.md`.

### A3. Perna criada pela base a partir do valor pago — `materialize_paid_amount_payment`
- **Dispara:** tx, AFTER I/U (é o último a correr, `zz_`).
- **Condições:** num INSERT com `paid_amount > 0,01`, ou num UPDATE em que `paid_amount` mudou, e a tx não é isenta. São isentas as tx com `is_reimbursement`, as filhas de rateio (`parent_transaction_id` + `split_percentage`) e as que têm linha em `partner_paid_expenses`.
- **O que faz:** compara `paid_amount` com a soma das pernas `paid`.
  - Se faltar valor, **cria uma perna** com `created_by='base D-ERP157'`, valor igual à diferença, `payment_date = coalesce(payment_date, date, hoje)` e `closes_transaction = (status='paid')`. O método é `compensation` (sem conta) quando a tx não tem conta; caso contrário é `transfer` ou o método da tx.
  - Se sobrar valor, **estorna só as pernas `base D-ERP157`**.
  - No fim chama `_derive_paid_amount`.
- **Regra prática:** escolhe-se **um** caminho, perna **ou** `paid_amount`, nunca os dois. O normal é inserir a perna. Gravar `paid_amount` e depois inserir também a perna dá pagamento a dobrar (até ao bruto) ou recusa (ver C, parcelas).
- **Memória:** `payment-amount-invariants.md`, `conciliacao-bancaria.md`.

### A4. Pernas mandam no estado da tx — `sync_paid_amount_from_payments` → `_derive_paid_amount`
- **Dispara:** perna, AFTER I/U/D (só ao nível 1 de triggers).
- **O que faz:** recalcula a tx a partir das pernas `paid`.
  - Soma ≤ 0,01: `paid_amount=0`, `payment_date=NULL` e, se a tx estava `paid` ou `partially_paid`, passa a `approved`.
  - Soma ≥ bruto − 0,05 (ou moeda ≠ EUR com `closes_transaction`): `paid`, com `payment_date` = data mais recente das pernas.
  - Entre os dois: `approved`, `payment_date=NULL` e `paid_amount` = soma.
  - Isenções iguais às de A3. Dentro de uma reversão #335 repõe o estado anterior.
- **Regra prática:** não vale a pena escrever `status`, `paid_amount` ou `payment_date` à mão numa tx com pernas, porque a próxima mudança de perna reescreve-os. Apagar ou estornar a perna despaga a tx, e isso arrasta A1, A2 e A7.
- **Memória:** `payment-amount-invariants.md`, `transaction-installments.md`.

### A5. Mudar valor ou IVA rederiva o pago — `rederive_paid_amount_on_amount_change`
- **Dispara:** tx, AFTER U, quando `amount` ou `iva_rate` mudam e existe pelo menos uma perna `paid`.
- **Efeito:** chama `_derive_paid_amount`. Se o bruto subir, uma tx que estava `paid` pode voltar a `approved` (pago parcial).
- **Regra prática:** depois de corrigir o valor ou o IVA de uma tx paga, confirmar o estado. Se o bruto subiu, falta uma perna.
- **Memória:** `payment-amount-invariants.md`, `card-sessions.md`.

### A6. Repagar limpa o estorno — `clear_reversal_on_repay`
- **Dispara:** perna, AFTER I, com a perna nova `paid` e sem `reversed_at`.
- **Efeito:** se a tx tinha `reversed_at`, limpa `reversed_at` e `reversed_by` e passa `status` de `reversed` para `approved`. Escreve uma linha em `transaction_audit_log` ("Repaga em … — estorno limpo (#101)").
- **Regra prática:** inserir uma perna paga numa tx estornada **desfaz o estorno**. Ao limpar o estorno, A1 e A2 voltam a criar os espelhos. Para registar um pagamento novo, lança-se uma tx nova, não uma perna na estornada.
- **Memória:** `reverse-transaction.md`.

### A7. Compensação ligada — `apply_transaction_offsets`
- **Dispara:** perna, AFTER I/U/D.
- **INSERT:** perna `paid`, não `compensation`, sem estorno, numa tx que está em `transaction_offsets` (como receita ou como despesa). Para cada ligação, `_apply_transaction_offset` cria **na outra tx** uma perna `compensation`, sem conta, com valor = mínimo entre o valor da ligação e o que falta pagar. Não cria se já existir uma perna activa desta ligação. Depois deriva a outra tx.
- **UPDATE/DELETE:** se uma perna paga real deixar de estar paga ou for apagada, e não restar nenhuma outra perna real paga, as pernas de compensação da outra tx são estornadas (`'estorno do pagamento de origem'`) e a outra tx é rederivada.
- Ligações com `offset_group_id` (#335) ficam de fora deste mecanismo.
- **Regra prática:** com a compensação ligada, paga-se só um lado. A perna `compensation` do outro lado não se lança.
- **Memória:** `compensacao-ligada.md`.

### A8. Cargas de cartão pré-pago — `card_load_on_out_paid` / `card_load_on_out_delete`
- **Pago (tx AFTER U):** quando a saída passa a `paid` e existe `card_session_loads` com `out_transaction_id = tx` e `in_transaction_id` nulo, cria a entrada no cartão. A entrada é uma receita `'Carga de <origem> (<origem> → <cartão>)'`, `paid`, IVA 0, `is_transitory=true`, `transitory_reason='carga_cartao'`, `exclude_from_result=true`, na conta do cartão, rubrica 10.3. Fica ligada em `in_transaction_id`.
- **Apagar a saída (tx BEFORE D):** apaga a linha de `card_session_loads` e a tx de entrada.
- **Despagar a saída não apaga a entrada.** Só o DELETE o faz, e não há ramo de UPDATE para isso. O cartão fica com a carga.
- **Ponto a verificar no código:** a rubrica é procurada com `code = '10.3' LIMIT 1` **sem filtrar a empresa**.
- **Regra prática:** lança-se só a saída da conta de origem (pela sessão de cartão). A entrada no cartão não se lança. Para anular uma carga, apaga-se a saída; não basta despagá-la.
- **Memória:** `card-sessions.md`, `transitory-reason.md`.

### A9. Notas de reembolso — `reimbursement_propagate_payment`, `reimbursement_revert_on_tx_delete`, `reimbursement_payment_force_exclude`
- **`reimbursement_propagate_payment`** (tx AFTER I/U): quando a tx de pagamento de uma nota (`reimbursement_notes.payment_transaction_id`) passa a `paid`, a função:
  - marca **todos os itens** da nota como `paid`, com `paid_amount` = bruto arredondado e `payment_date` = a do pagamento ou hoje;
  - marca a nota como `paid` e preenche `paid_at`.
  - Os itens têm `is_reimbursement=true` (confirmado em Live: todos os itens ligados), por isso A3 e A4 não criam pernas para eles.
- **`reimbursement_revert_on_tx_delete`** (tx BEFORE D): ao apagar a tx de pagamento, a nota volta a `approved` e perde `payment_transaction_id` e `paid_at`, **mas só se a nota estiver `pending_payment`**. Com a nota já `paid`, apagar o pagamento não reverte nem a nota nem os itens.
- **`reimbursement_payment_force_exclude`** (nota BEFORE I/U): ao ligar `payment_transaction_id`, faz UPDATE na tx de pagamento para `exclude_from_result=true`.
- **Despagar** a tx de pagamento não reverte os itens nem a nota (não há ramo para isso).
- **Regra prática:** paga-se a nota pelo seu fluxo. Os itens não se pagam um a um. Para desfazer um pagamento de nota já `paid`, a correcção é manual (pedir à frente).
- **Memória:** `reimbursement-notes.md`.

### A10. Vínculo transação ↔ linha de BP
- **`sync_tx_forecast_to_anchor`** (tx AFTER I/U):
  - Se a linha de BP indicada em `forecast_id` não tem âncora, a tx passa a ser a âncora (`event_forecasts.transaction_id`).
  - Se a tx era a âncora e muda de `forecast_id`, a âncora passa para a tx mais antiga do mesmo evento ligada à linha antiga, ou fica nula.
- **`sync_forecast_anchor_to_tx`** (BP AFTER I/U): definir `transaction_id` numa linha viva preenche `transactions.forecast_id` quando está vazio. Tirar a âncora **não** limpa `forecast_id`, porque o modelo é N transações para 1 linha. Recusa se a tx já estiver noutra linha (ver C).
- **`sync_tx_category_from_forecast`** (BP AFTER I/U): a rubrica da linha de BP é copiada para a tx âncora (se forem do mesmo evento). Escreve em `system_audit_log`.
- **`realign_tx_category_from_forecast`** (tx AFTER U): se a tx é âncora de uma linha viva com rubrica e alguém lhe muda a rubrica, **a base repõe a rubrica da linha de BP**, em silêncio, e só regista `auto_realign_tx_category` no log.
- **`unlink_forecasts_on_tx_event_change`** (tx AFTER U): se a tx muda para um evento incompatível, as linhas de BP em que ela era âncora ficam com `transaction_id = NULL` (registo `auto_unlink_forecast_tx_event_change`).
- **Regra prática:** para mudar a rubrica de uma tx ligada ao BP, muda-se a rubrica da **linha de BP**, não a da tx. Mudar uma tx de evento desfaz o vínculo (ver também B, `enforce_tx_forecast_same_event`).
- **Memória:** `transactions-bp-linkage.md`, `bp-tx-category-coherence.md`, `bp-versions-runtime-behavior.md`.

### A11. Camarim: a perna da sessão segue a perna do banco — `trg_camarim_session_leg_follows_bank` → `camarim_sync_session_leg_payment`
- **Dispara:** perna, AFTER I/U/D, sobre a tx do banco de um `camarim_fund_moves`.
- **O que faz:** na tx "perna da sessão", **apaga e recria** a perna `created_by='base #287'` com valor = mínimo entre a soma das pernas pagas do banco e o bruto da sessão, data = a mais recente. Depois deriva a tx.
- **Se a perna da sessão tiver uma perna manual paga** (com outro `created_by`), não toca em nada: a perna manual manda.
- **Regra prática:** paga-se só a perna do banco. Não se lança perna na tx da sessão, porque isso desliga a sincronização.
- **Memória:** `camarim-integration-flow.md`.

### A12. Mapa de sugestão de rubrica (Coala) — `coala_capture_category_change` / `coala_capture_forecast_category_change`
- **Dispara:** tx e BP, AFTER I/U, quando a rubrica muda e há fornecedor e empresa.
- **Efeito:** faz upsert em `coala_supplier_category_map` (fornecedor + descrição normalizada → rubrica, contador de confirmações).
- **Não age:** quando a rubrica é a de fallback (0.0.99 ou 2.6.08) ou a descrição normalizada tem menos de 3 caracteres. Na tx também ignora o ramo 10.1.x.
- Se falhar, só emite um WARNING e não bloqueia.
- **Efeito na entrada de dados:** escolher uma rubrica errada ensina a sugestão errada.

### A13. Versões do BP
- **`auto_create_initial_bp_version`** (evento AFTER I/U, só eventos sem `parent_event_id`):
  - cria a v1 aprovada quando o evento nasce ou passa a `confirmed`/`active` sem versões;
  - tira um snapshot "Fecho automático" ao passar de `active` a `completed` (se ainda não existir um);
  - tira um snapshot "Reabertura" ao passar de `completed` a `active`/`confirmed`.
  - Se falhar, só emite WARNING.
- **`auto_create_retroactive_split_snapshots`** (evento AFTER I com `parent_event_id`): para cada versão do Master, cria a versão correspondente no split, com a mesma numeração e o mesmo estado (`is_retroactive_snapshot=true`), e regista em `bp_version_audit_log`.
- **`snapshot_bp_versions_to_trash`** (evento BEFORE D): copia as versões e o log de auditoria do evento para `trash` antes de o apagar.
- **Memória:** `bp-versions-runtime-behavior.md`, `bp-versions-scenarios.md`.

### A14. Pixel Meta do evento — `events_meta_pixel_to_trackers`
- **Dispara:** evento, AFTER I/U, quando `meta_pixel_id` muda.
- **Efeito:** apaga o tracker `meta` antigo em `event_trackers` e faz upsert do novo (`custom_event_type='PURCHASE'`).

### A15. Janela administrativa — `validate_event_admin_absorption` (evento BEFORE I/U)
- **Quando um evento passa a absorver custos admin:** se outro evento da empresa tiver uma janela em aberto que começou antes, a base **fecha essa janela no dia anterior** ao início da nova (UPDATE noutro evento).
- Também recusa casos inválidos (ver C).
- **Memória:** `janela-administrativa.md`.

### A16. `set_forecast_baseline_amount` e `enforce_admin_window_event` (não criam linhas)
- **`set_forecast_baseline_amount`** (BP BEFORE I): `baseline_amount := coalesce(baseline_amount, amount)`. Só mexe no próprio registo (ver B). Memória: `bp-previsto-original.md`.
- **`enforce_admin_window_event`** (tx BEFORE I/U): **não altera dados de negócio**. Ou recusa (ver C) ou, com excepção autorizada, escreve uma linha `admin_cost_override` em `system_audit_log`.

---

## B. Campos que a base muda em silêncio no próprio registo

| Trigger | Condição | Campo alterado |
|---|---|---|
| `force_confidential_for_restricted_account` (tx I/U) | conta com `is_restricted=true` | `is_confidential := true` |
| `force_exclude_from_result_for_shared_cost` (tx I/U) | `shared_cost_account_id` preenchido | `exclude_from_result := true` |
| `force_no_account_on_compensation` (tx I/U) | `payment_method='compensation'` | `account_id := NULL` |
| `force_transitory_for_capital_branch` (tx I/U) | rubrica 10.1.x (no INSERT ou quando a rubrica muda) | `is_transitory := true`; `transitory_reason` = `distribuicao_resultado` (10.1.03), `emprestimo_socio` (10.1.04) ou `aporte_socio` (restantes); sobrepõe-se ao que vier do ecrã |
| `force_transitory_for_capital_branch` (sempre) | `is_transitory` falso | `transitory_reason := NULL` |
| `enforce_held_revenue_is_paid` (tx I/U) | `held_by_supplier_id` preenchido | `status := 'paid'`, `payment_date := coalesce(payment_date, date)`, `paid_amount := amount`. Atenção: fica o **líquido**, não o bruto; com IVA, A3/A4 podem criar uma perna "base D-ERP157" (efeito exacto por confirmar) |
| `enforce_tx_forecast_same_event` (tx I/U) | só mudou `event_id`, a tx não está aprovada ou não consome verba, e a linha de BP é incompatível | `forecast_id := NULL` (regista `auto_unlink_tx_forecast_event_change`) |
| `set_company_id_on_insert` (I em tx, pernas, BP, eventos, contas, listas, notas, créditos, documentos, compensações, sócios) | `company_id` nulo | `company_id := current_company_id()`; sem empresa, recusa (ver C) |
| `generate_reimbursement_code` (nota I) | sempre | `code := 'R-NNN/AAAA'`; **sobrepõe qualquer código enviado** |
| `set_forecast_baseline_amount` (BP I) | `baseline_amount` nulo | `baseline_amount := amount` |
| `log_formalidade_change` (BP U) | `formalidade` mudou | `formalidade_changed_at`, `formalidade_changed_by` (e regista o log) |
| `_event_stage_legacy_reopen` (evento U) | sai de `completed` | `closed_at`, `closed_by := NULL` |
| `validate_forecast_addback` (BP I/U) | `addback_settlement_id` nulo | `addback_reason := NULL` |
| `validate_transaction_offset` (compensação I) | `created_by` nulo | `created_by := auth.uid()` ou `'sistema'` |

---

## C. Guardas que recusam

| Trigger / função | Tabela · evento | Condição | Mensagem exacta | O que fazer |
|---|---|---|---|---|
| `validate_paid_requires_payment_date` | tx · I/U | `status='paid'` sem `payment_date` | `Transações pagas devem ter uma data de pagamento (payment_date)` | Indicar a data real do pagamento |
| `validate_paid_requires_payment_date` | tx · I/U | `payment_date` > hoje (Europe/Lisbon) | `Data de pagamento no futuro (<data>). Um pagamento regista dinheiro que já saiu — para uma saída prevista use a data de vencimento.` | Deixar a tx em aberto e pôr a data em `due_date` |
| `validate_payment_date_not_future` | perna · I/U | `payment_date` > hoje (Lisboa). **Vale também para pernas `planned`** (e `payment_date` é NOT NULL) | `Data de pagamento no futuro (<data>). Um pagamento regista dinheiro que já saiu — para uma saída prevista use a data de vencimento na transação.` | Para parcelas futuras usar a data de vencimento; o uso de `scheduled_date` está por confirmar |
| `enforce_tx_paid_requires_account` | tx · I | `status='paid'` sem `account_id`; isentas: service_role/postgres/admin, transitória, `exclude_from_result`, reembolso, `compensation` | `Transação paga exige conta financeira associada (account_id).` | Indicar a conta, ou criar em aberto e pagar pelo modal |
| `validate_paid_amount_not_exceeds_gross` | tx · U | `paid_amount` > bruto + 0,01 (o legado já excedido só pode descer) | `Valor pago (<x> €) excede o valor bruto da transação (<y> €).` | Corrigir o valor ou o IVA primeiro |
| `guard_paid_amount_vs_payments` | tx · U | `paid_amount` < soma das pernas pagas − 0,01 (nível 1, tx não isenta) | `O valor pago (<x> €) não pode ficar abaixo da soma dos pagamentos registados (<y> €). Para reduzir, estorne ou apague o pagamento no separador Pagamento da transação.` | Estornar ou apagar a perna |
| `validate_installments_total` | perna · I/U | soma das pernas `planned`+`paid` > bruto + 0,01 (em UPDATE, o legado só pode descer) | `Soma das parcelas (<x> €) excede o valor bruto da transação (<y> €).` | Ver se já existe perna (incl. `base D-ERP157`) |
| `enforce_payment_list_batch_channel` | perna · I | a perna tem `payment_list_id` e não tem `outside_batch` | `Transação <id> não está ativa na lista de pagamento <lista>.` | Tirar a perna da lista ou repor o item |
| idem | idem | a lista tem SEPA exportado e a tx não está no ficheiro | `A transação <id> não foi no ficheiro SEPA desta lista: liquida-se uma a uma por outro canal.` | Pagar fora do lote (`outside_batch`) |
| idem | idem | a lista não tem SEPA e o método ≠ `transfer` | `A transação <id> é paga por <método> — não vai no lote; liquida-se uma a uma.` | Liquidar individualmente |
| `enforce_payment_list_item_bankable` | item de lista · I | sem IBAN (override ou fornecedor 1, 2 ou 3), sem entidade/referência, não é carga de cartão nem Segurança Social | `Transação sem IBAN resolvível não pode entrar em lista de pagamento` | Pôr o IBAN no fornecedor ou a referência |
| `guard_partner_contract_transactions` | tx · I | tem `partner_contract_id` ou `partner_contract_role` fora da RPC | `transacao_de_contrato_so_por_rpc: use os contratos do sócio` | Usar os contratos do sócio |
| idem | tx · D | idem | `transacao_de_contrato_so_por_rpc: cancele o contrato` | Cancelar o contrato |
| idem | tx · U | muda valor, rubrica, fornecedor, evento, empresa, tipo, contrato ou pai | `transacao_de_contrato_so_por_rpc: valor/identidade protegidos` | Pela RPC do contrato |
| `guard_excluded_from_partner_settlement` | tx e BP · I/U | muda "Fora do acerto do sócio" com o fechamento do evento (ou do Master) selado | `Fechamento selado: não é possível mudar "Fora do acerto do sócio". Reabra primeiro.` | Reabrir o fechamento |
| `validate_transaction_event_settlement` | tx · I/U | desmarcar de um fechamento selado | `Fechamento selado: as transações não podem ser desmarcadas. Reabra primeiro.` | Reabrir |
| idem | idem | ligar uma tx sem evento | `Uma transação sem evento (mãe de rateio) não pode ser ligada a um fechamento` | Ligar a filha |
| idem | idem | o fechamento não existe | `Fechamento <id> não existe` | — |
| idem | idem | marcar uma tx nova num fechamento selado | `Fechamento selado: não é possível marcar novas transações. Reabra primeiro.` | Reabrir |
| idem | idem | o fechamento é de outro evento | `A transação só pode ser ligada a um fechamento do próprio evento` | — |
| `enforce_transaction_approval_permission` | tx · U → `approved` | sem permissão `approve_transactions` (só com utilizador autenticado) | `Sem permissao para aprovar transacoes nesta empresa.` | Pedir a quem tem a permissão |
| idem | tx · I `approved`/`paid` ou U → `approved` | despesa de evento `with_bp` sem `forecast_id`; isentas: filhas, transitórias, fora do resultado, estornadas, escondidas, custo partilhado e rubrica 10.3 | `Esta transacao nao tem linha de BP. Escolhe a linha (ou cria uma) antes de aprovar ou pagar.` | Escolher ou criar a linha de BP |
| idem | idem | o realizado líquido da linha + esta despesa > verba da linha | `Verba excedida na rubrica <código nome> ("<descrição>"): verba <v> €, realizado com esta despesa <r> €, excesso <e> €. Eleve a verba da linha no mesmo acto antes de aprovar.` | Elevar a verba primeiro. **O UPDATE → `paid` não é verificado** (é deliberado) |
| `issue335_guard` | tx · U/D; pernas, compensações, linhas de extracto e grupos/itens · I/U/D | documento gerido por um grupo de encontro #335 activo, mexido fora da operação gerida | `managed_operation_required` / `reverse_entire_group` / `invalid_group_state` / `managed_bank_anchor_immutable` | Não editar: reverter o grupo inteiro pela operação #335 |
| `enforce_admin_window_event` | tx · I/U (sem pai) | rubrica com `allocate_to_active_event`, numa data com janela admin de outro evento, sem excepção justificada e autorizada | `Esta conta é custo do evento <nome> nesta data. Escolhe esse evento ou pede a excepção.` | Escolher o evento da janela, ou excepção (`admin_cost_override` + justificação) |
| `enforce_forecast_amount_floor` | BP · U (linha viva, aprovada, despesa, a descer) | nova verba < realizado | `A verba da linha de BP não pode ficar abaixo do realizado: pedido <x> €, realizado <y> €.` | Não descer abaixo do realizado |
| idem | idem | há realizado e falta a observação | `Observação obrigatória para reduzir uma linha de BP com realizado.` | Escrever a observação |
| `enforce_forecast_tx_same_event` | BP · I/U | âncora de outro evento ou de outra empresa | `Vínculo recusado: a transação pertence ao evento "<A>" e a linha do Business Plan ao evento "<B>". Uma linha de BP só pode ser vinculada a transações do mesmo evento (ou sem evento, no desenho master/subeventos) e da mesma empresa.` | Ligar ao evento certo |
| `enforce_tx_forecast_same_event` | tx · I/U | `forecast_id` aponta para uma linha de versão ou cenário | `Vínculo recusado: a linha de BP pertence a uma versão/cenário. Só se vinculam transações a linhas vivas do Business Plan.` | Usar a linha viva |
| idem | idem | `forecast_id` de outro evento ou empresa | (mesma mensagem "Vínculo recusado: a transação pertence ao evento …") | — |
| idem | tx · U só do evento | a tx já está aprovada ou paga e consome verba num evento `with_bp` | `Esta transação já está aprovada. Ao mudar de evento, escolhe no mesmo acto a linha de BP do evento novo.` | Mudar o evento e o `forecast_id` no mesmo UPDATE |
| `sync_forecast_anchor_to_tx` | BP · I/U | a tx âncora já está noutra linha | `Incoerência de vínculo BP↔transação: a transação <tx> já está vinculada à linha de BP <a> e não pode ser usada como âncora da linha <b>. Desvincule-a primeiro.` | Desvincular primeiro |
| `protect_master_split_forecast_links` | BP · U | mudar ou remover `transaction_id` de uma linha Master cuja tx tem filhas nos subeventos | `Não é permitido alterar/remover transaction_id de um BP Master com transações-filhas vinculadas nos subeventos` | Tratar primeiro as filhas |
| `validate_event_forecast_partner_roles` | BP · I/U | ordenador ou pagador inválido | `Ordenador inválido: sócio não encontrado.` · `Ordenador inválido: o sócio "<n>" pertence a outro evento.` · `Ordenador inválido: o sócio "<n>" não tem a opção "Pode ser ordenador de despesas" ligada.` · `Pagador inválido: sócio não encontrado.` · `Pagador inválido: o sócio "<n>" pertence a outro evento.` · `Pagador inválido: o sócio "<n>" não tem a opção "Pode ser pagador de despesas" ligada.` | Ligar a opção no sócio do evento |
| `validate_forecast_addback` | BP · I/U | devolução de linha a fechamento | `Só linhas de despesa podem ser devolvidas a um fechamento.` · `Indique o motivo da devolução da linha ao fechamento.` · `Fechamento de devolução inexistente.` · `O fechamento de devolução tem de pertencer ao mesmo evento da linha.` · `Não é possível devolver uma linha ao fechamento raiz.` · `O fechamento de devolução está selado.` | — |
| `validate_forecast_event_settlement` | BP · I/U | ligação a fechamento | `Fechamento selado: as linhas do BP não podem ser desmarcadas. Reabra primeiro.` · `Fechamento <id> não existe` · `Fechamento selado: não é possível marcar novas linhas do BP. Reabra primeiro.` · `A linha do BP só pode ser ligada a um fechamento do próprio evento` | Reabrir ou usar o evento certo |
| `enforce_event_close_blockers` | evento · U → `completed` | há sessões de cartão abertas ou de camarim por integrar | `Não é possível fechar o evento: <n> sessão(ões) de cartão aberta(s)<(lista)>; <m> sessão(ões) de camarim por integrar<(lista)>.` | Fechar ou integrar as sessões |
| `enforce_event_reopen_permission` | evento · U a sair de `completed` | sem permissão `reopen_event` (só com utilizador) | `Sem permissao para reabrir um evento concluido.` | Pedir a quem tem a permissão |
| `_event_stage_guard` | evento · I/U | escrita directa em `closed_at/by` ou `historical_at/by` | `event_stage_direct_write_forbidden` | Usar a operação de estágio |
| `validate_event_admin_absorption` / `prevent_split_absorbs_admin` | evento · I/U | `absorbs_admin_costs` num split; janela sem início; fim antes do início | `Apenas eventos Master ou Single podem absorver custos administrativos (não Splits).` · `Apenas eventos Master ou Single podem absorver custos administrativos. Splits (eventos com parent_event_id) não são permitidos.` · `Quando o evento absorve custos administrativos, a data de início da janela é obrigatória.` · `O fim da janela (<d>) não pode ser anterior ao início (<d>).` | — |
| `trg_check_admin_windows_contiguous` → `check_admin_windows_contiguous` | evento · AFTER I/U/D | janelas com buraco, sobrepostas ou mais de uma em aberto | `Janelas administrativas: "<A>" (desde <d>) está em aberto, mas "<B>" começa depois (<d>). Só a última janela pode ficar em aberto.` · `Janelas administrativas sobrepostas: "<A>" (<d> a <d>) e "<B>" (desde <d>).` · `Janelas administrativas com buraco: "<A>" termina a <d> e "<B>" começa a <d>. O início tem de ser o dia seguinte ao fim da anterior (<d>).` | Ajustar as datas |
| `prevent_delete_processed_standalone_invoice` | fatura avulsa · D | `status <> 'new'` | `Fatura avulsa processada não pode ser apagada. Reabre para "nova" primeiro.` | Reabrir para "nova" |
| `prevent_delete_event_settlement_with_lines` | `event_settlements` · D | tem linhas ou tx ligadas | `Não é possível apagar o fechamento "<nome>": tem <n> linha(s) de BP e <m> transação(ões) ligadas` | Desligar primeiro |
| `validate_transaction_offset` | compensação · I/U | ligação inválida | `Compensação: a receita e a despesa têm de ser transações diferentes.` · `Compensação: a receita indicada não existe.` · `Compensação: a despesa indicada não existe.` · `Compensação: o lado a receber tem de ser uma receita (é "<tipo>").` · `Compensação: o lado a pagar tem de ser uma despesa (é "<tipo>").` · `Compensação: as duas transações têm de ser da mesma empresa.` · `Compensação: as duas transações têm de ter fornecedor/cliente.` · `Compensação: não se liga uma transação estornada.` · `Compensação: não se liga uma transação escondida.` · `Compensação: o total ligado à receita (<x> €) excede o seu valor bruto (<y> €).` · `Compensação: o total ligado à despesa (<x> €) excede o seu valor bruto (<y> €).` | — |
| `reimbursement_payment_guard_exclude` | tx · U | tirar `exclude_from_result` a um pagamento de nota | `O pagamento de uma nota de reembolso não é custo: tem de ficar fora do resultado (exclude_from_result = true).` | Não mexer |
| `sync_partner_aporte_mirror` | tx · I/U | conta-espelho e empresa sem a rubrica 10.1.01 | `Conta-espelho: rubrica 10.1.01 nao existe na empresa <id>` | Criar a rubrica |
| `sync_shared_cost_mirror` | tx · I/U | custo partilhado e empresa sem a rubrica 10.12.01 | `Custo partilhado: rubrica 10.12.01 nao existe na empresa <id>` | Criar a rubrica |
| `set_company_id_on_insert` | várias · I | sem `company_id` e utilizador sem empresa | `company_id cannot be NULL — user has no associated company` | Indicar `company_id` |

---

## D. Só registo/auditoria (não mexem em dados de negócio)

- `log_table_change`: em `event_forecasts` e `financial_accounts` (I/U/D), grava a linha antiga e a nova no log de auditoria do sistema.
- `audit_transactions_change`: em tx (I/U/D), grava em `system_audit_log` as mudanças de `status`, `amount`, `reversed_at`, `payment_date`, `account_id` e `event_id`.
- `log_formalidade_change`: em BP (U de `formalidade`), grava em `event_forecast_formalidade_log` (e carimba os dois campos da secção B).
- `update_updated_at_column`: `updated_at := now()` em tx, pernas, eventos, listas, notas, créditos, faturas avulsas, adiantamentos e movimentos de capital.
- `trg_notify_event_phase_changed` (evento U de `operacao_mode`) põe uma notificação WhatsApp na fila para a direcção e os líderes de frente. Não mexe em dados financeiros.

---

*Levantado em Live a 2026-11-01 01:21 UTC por consulta ao catálogo (pg_trigger/pg_proc); 96 triggers em 16 tabelas (68 funções distintas). Fora da lista pedida há mais 4 triggers relevantes: `issue335_guard` em `bank_line_transactions`, `transaction_offset_groups` e `transaction_offset_items`, e `prevent_delete_event_settlement_with_lines` em `event_settlements`. `partner_aporte_mirror` não tem triggers próprios.*
