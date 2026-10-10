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
