---
name: Apuramento Ticketline (#303)
description: ticket_office_statements + linhas tipadas; repasses e transitados só no apuramento; fecho do evento mostra o direito; advances só leitura; confirmar exige Σ = total e zero pendentes
type: feature
---
- Tabelas `ticket_office_statements` / `ticket_office_statement_lines` (event_right, ticketline_invoice, venue_settlement, advance, carry_over). Valor com sinal (+ MP, − Ticketline). `pending_document` = valor por provar, bloqueia confirmação. O plano dizia amount NULL; na prática a linha pendente foi gravada com amount 0,00 (ambos aceites — o que conta é a flag).
- "Apuramento Ticketline" ≠ `event_settlements` (fechamento dos sócios). No ecrã dizer sempre "Apuramento Ticketline".
- Repasses/transitados nunca se imputam a evento. Transação em linha advance/carry_over sai das deduções elegíveis do modal do fecho.
- `event_ticket_office_advances` só leitura (trigger). Confirmar: RPC `confirm_ticket_office_statement`.
- Prova = posição da conta (Σ direitos apurados − faturas sem evento apurado − repasses), não o saldo da conta.
- Registados: 2558 (Anitta, total 0) e 3163 (rascunho, −49.050,59, Σ linhas = total do documento, zero linhas pendentes, PDF anexado; Deive resolvido por documento como venue_settlement −265,00 bilheteira local Forum Braga). Painel só leitura em /bilheteiras.
- D-ERP232: o fecho guarda o DIREITO do evento (bruto − deduções − retido − saldo de fatura), nunca abate adiantamentos. Forma de liquidação derivada na RPC overview (inclui "apuramento") + correcção manual em `forma_liquidacao_manual`(+_notes) — derivada e declarada sempre separadas.
- Adiantamentos: só leitura também em DELETE + CHECK `etoa_never_open_chk` (transaction_id OU settlement_id preenchido). `_ticket_office_balance_raw` só subtrai os que têm OS DOIS a NULL; os 25 da Ticketline (2.008.500,00) têm os dois — se ficassem sem ambos, o saldo cairia 2.008.500,00 de uma vez. Pôr só settlement_id a NULL já era bloqueado pelo trigger (UPDATE) e, sozinho, não mexeria no saldo (transaction_id continua).

