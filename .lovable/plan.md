# Reembolsos — pagamento nunca entra no resultado (R2)

HEAD confirmado: `b5f6f512d5164ec409704ba74c20d4b008f14f33`.

Ficheiros lidos: `docs/QUADRO.md` (Em execução agora: #352 ativa, sem conflito com reembolsos/transações), `src/components/ReimbursementNoteDetail.tsx` (payMutation/reopenMutation), `supabase/migrations/20260507210701_…sql` (reimbursement_propagate_payment + revert_on_tx_delete), `src/components/PaymentListsTab.tsx`, `src/pages/Transactions.tsx`, `supabase/functions/ads-invoice-apply/index.ts`, lista de memórias com "exclude_from_result". Antes de implementar leio ainda `docs/INDEX.md`, o estado financeiro, `LinkReimbursementNoteModal.tsx`, `ReimbursementNoteFormModal.tsx` e os corpos Live de `reconcile_bank_line` e `_run_invariant_checks_extra` (passo 0).

## a) Caminhos que criam/ligam `payment_transaction_id`
Pesquisa em src/ e supabase/ (excl. testes/baselines):
1. Único escritor: `ReimbursementNoteDetail.payMutation` — INSERT da transação (expense, sem evento/categoria, `iva_rate 0`) e depois UPDATE da nota com o id.
2. `reopenMutation` só limpa (null) e apaga a transação.
3. `reimbursement_revert_on_tx_delete` só limpa.
4. Só leitores: PaymentListsTab, Transactions, ads-invoice-apply, accountant zip, restore.
5. Lote, `reconcile_bank_line` e importação não criam a ligação; liquidam uma transação já ligada (o propagate dispara em `paid`). A confirmar no corpo Live no passo 0; se algum a criar, fica coberto pelo mesmo trigger.
Conclusão: todos passam pelo UPDATE/INSERT em `reimbursement_notes`, por isso a garantia vive aí.

## b) Garantia na base (migração aditiva 0286)
- Trigger `BEFORE INSERT OR UPDATE OF payment_transaction_id ON reimbursement_notes`: quando o novo valor não é nulo e muda, faz `UPDATE transactions SET exclude_from_result = true WHERE id = NEW.payment_transaction_id AND exclude_from_result IS DISTINCT FROM true`. Cobre também uma transação criada antes e ligada depois.
- Trigger de guarda `BEFORE UPDATE OF exclude_from_result ON transactions`: impede voltar a `false` enquanto a transação estiver ligada a uma nota (erro claro). Não toca em valores, estado, conta nem datas.
- Ordem dos triggers: não interfere com o propagate (AFTER, só olha para status).
- Modal: o INSERT passa a enviar `exclude_from_result: true` (redundante, para a UI ficar certa logo).
- Rollback comentado: `DROP TRIGGER` + `DROP FUNCTION` das duas novas funções; não reverte flags (histórico corrigido pelo 0 fica).
- Sem DML: nenhuma linha atual muda (hoje 0 por corrigir).

## c) Invariante
Acrescentar a `_run_invariant_checks_extra()` (CREATE OR REPLACE, corpo atual + 1 bloco): `reimbursement_payment_in_result`, severidade error, referência 0 — notas com `payment_transaction_id` cuja transação tem `exclude_from_result` não verdadeiro. Medido agora em Live: 44 notas pagas, **0** com a flag a false; 0 notas paid/pending sem pagamento. md5 do corpo atual `958c69bc…` registado antes/depois.

## d) Diferença 367,49 €
Medição em Live (só leitura) nas 44 notas pagas: pagamentos 10.700,29; `paid_amount` dos 180 itens 11.067,75 (≈ os 11.067,78 de referência); `amount` dos itens 10.077,68; 59 itens com IVA; 23 notas onde pagamento ≠ soma dos itens.
Hipótese ainda não confirmada: o pagamento foi calculado no modal com o valor dos itens na altura; depois os itens foram editados (valor/IVA), e o propagate regravou `paid_amount` com a fórmula atual. Passo 0 confirma por nota (auditoria de alterações dos itens vs `created_at` do pagamento). Não ajusto nada; se a evidência não fechar, digo que não consigo explicar.

## e) Testes e prova
- PGlite: ligar pagamento novo → flag true; transação pré-existente ligada depois → true; tentar pôr false com ligação → erro; após desligar (reopen) → permitido; propagate continua a marcar itens/nota pagos; saldo/valores inalterados; invariante devolve 0 e 1 num caso forçado.
- vitest: payload do modal inclui a flag. tsgo limpo.
- Live (após Sim): antes/depois `Σ pagamentos de notas com flag ≠ true = 0` (origem: reimbursement_notes ⋈ transactions); invariante = 0; simulação numa transação `BEGIN … ROLLBACK` (insere transação + liga a uma nota de teste da mesma query) a provar flag true e zero resíduo (contagem antes/depois igual).

## f) Classe e riscos
- Classe **R2** (DDL: 2 triggers + redefinição da função de invariantes).
- Riscos: escritor futuro que crie a transação por outra via — coberto pela ligação; guarda bloquear um fluxo legítimo de desmarcar (só possível após desligar).
- Fora: dados históricos, itens (categoria/evento), edge financial-position, explicação/ajuste dos 367,49.
- Publish: só a linha do modal; a garantia funciona em Live logo após a migração, mesmo antes do Publish. R-045/R-046 ficam protegidas sem Publish.

## Sequência
0. Reserva no QUADRO + leituras pendentes + análise por nota da diferença.
1. Migração em `supabase/manual/0286_…sql`, PGlite; paro e mostro diff/md5.
2. Com Sim: aplicar em Live, prova acima.
3. Modal + testes + docs (estado, test doc, DECISIONS só o decidido); liberta reserva; "pronto para Publish".
