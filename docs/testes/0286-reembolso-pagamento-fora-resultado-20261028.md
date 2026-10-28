# Prova Live — 0286 reembolso: pagamento fora do resultado (28/10/2026)

Migração `supabase/manual/0286_reembolso_pagamento_fora_resultado.sql` aplicada em Live com o segundo Sim do Pedro (28/10/2026 ~00:37 UTC). Nota: a 1.ª aplicação do corpo de `_run_invariant_checks_extra` diferiu do ficheiro em 5 linhas de indentação (só espaços); duas migrações corretivas (drizzle 0287/0288) repuseram o corpo byte-idêntico ao ficheiro. Efeito líquido = conteúdo exato da 0286.

## (a) ANTES (psql, só leitura)
- Pagamentos de notas com `exclude_from_result IS DISTINCT FROM true`: **0** (predicado: `reimbursement_notes ⋈ transactions ON payment_transaction_id`).
- md5(prosrc) de `_run_invariant_checks_extra`: **958c69bc5fb8efa65efcf3f03c01c1b9** (igual ao esperado).
- Contagens: transactions **2045**, reimbursement_notes **46**, notas com pagamento **44**.

## (b) Aplicação
- Via ferramenta de migrações (DDL + linha de configuração `system_invariants` aprovada pelo Pedro). Sem DML histórico; os 44 pagamentos não foram tocados.

## (c) DEPOIS
- md5(prosrc): **e29328fc13d6827d27728f07608ea5fa** (igual ao esperado; byte-idêntico ao ficheiro, verificado por diff linha a linha).
- Triggers existem: `trg_reimbursement_payment_force_exclude` (reimbursement_notes) e `trg_reimbursement_payment_guard_exclude` (transactions).
- `system_invariants` tem `reembolso_pagamento_no_resultado` (error, empresa, referência 0).
- Invariante chamada: `current_count=0, reference_count=0, conforme=true`.
- ACL: `reimbursement_payment_force_exclude()` e `reimbursement_payment_guard_exclude()` sem EXECUTE para anon/authenticated.
- Contagem de pagamentos fora da flag: **0** (inalterada).

## (d) Simulação (BEGIN … ROLLBACK, sem resíduo)
1. Transação de teste (expense, 1,00 €, exclude_from_result=false) criada.
2. Ligada à nota real R-045/2026 (approved, sem pagamento): a trigger passou a flag para **true** automaticamente.
3. Tentativa de repor `exclude_from_result=false`: **erro** «O pagamento de uma nota de reembolso não é custo: tem de ficar fora do resultado (exclude_from_result = true).» (check_violation).
4. ROLLBACK. Prova de zero resíduo: transactions **2045**, notas **46**, com pagamento **44** (iguais ao ANTES); R-045/2026 continua sem `payment_transaction_id`.

## Cliente
- `ReimbursementNoteDetail.tsx` payMutation: o insert da transação de pagamento envia `exclude_from_result: true` (1.ª linha; a trigger é a 2.ª).
- Testes: `src/test/reimbursement-payment-exclude-0286.test.ts` (PGlite 7/7) e `src/test/reimbursement-payment-modal-0286.test.ts` (2/2). Suíte completa e tsgo: ver relatório da tarefa.
