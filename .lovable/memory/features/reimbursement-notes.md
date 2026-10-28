
## 0286 / D-ERP329 (28/10/2026, em Live)
O pagamento da nota nunca entra no resultado (o custo vive nos itens): trigger `trg_reimbursement_payment_force_exclude` força `exclude_from_result=true` ao ligar `payment_transaction_id`; guarda `trg_reimbursement_payment_guard_exclude` recusa retirar a flag enquanto ligada; invariante `reembolso_pagamento_no_resultado` (referência 0). O modal (`ReimbursementNoteDetail` payMutation) cria o pagamento já com a flag. Sem DML histórico — os 44 pagamentos existentes já estavam conformes.
