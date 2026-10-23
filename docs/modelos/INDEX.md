# Modelos de relatório — catálogo

> Fonte única dos modelos de relatório da Mundo Propício, nas duas ferramentas (Claude e ChatGPT). Antes de construir um relatório, procura aqui; se existir, usa o modelo. Quando um relatório ficar bom, guarda-o como modelo (R0). Regras e molde em `README.md` desta pasta.

Uma linha por modelo. Ordem alfabética pelo nome da pasta.

| Pasta | Nome | Para que serve | Chat dono | Fontes de dados | Saída | Última utilização |
|---|---|---|---|---|---|---|
| `bilheteira-por-apuramento` | Bilheteira por apuramento — posição de conta-corrente | Quanto é que a bilheteira deve à MP (ou a MP à bilheteira) agora, pelos dois caminhos, e o saldo que transita entre apuramentos | 3 · Ticketing e Receita | `get_ticket_office_sales`, `_ticket_office_balance_raw`, `ticket_office_settlements`, `event_ticket_office_advances`, `transactions` | md (+ bloco WhatsApp) | 2026-09-13 |
| `conciliacao-cartoes` | Conciliação de cartões pré-pagos | Pôr o saldo de cada cartão no sistema igual ao do banco e explicar a diferença movimento a movimento | 4 · Financeiro e Tesouraria | `financial_accounts`, `card_sessions`, `card_session_items`, `card_session_loads`, `transactions`, `bank_statement_lines` | md | 2026-10-07 |
| `triagem-de-issues` | Triagem de Issues | Varrer as Issues abertas e reparti-las por quem decide: corre sozinho, "ok" por lote, ou espera o Pedro | 1 · Controller | edge function `github-issues`, repo, Live | md | 2026-10-09 |

## Em fila para a próxima passagem

Propostos a 23/10/2026 e por construir: `fecho-evento`, `acerto-com-socios`, `bp-x-resultado`, `ocupacao-e-lotacao`, `comparativo-de-edicoes`, `simulacao-de-sala`, `dre-gerencial`, `conciliacao-bancaria`, `auditoria-fornecedores`, `fecho-food-e-bares`, `trafego-x-vendas-diario`, `varredura-entrada-de-dados`.
