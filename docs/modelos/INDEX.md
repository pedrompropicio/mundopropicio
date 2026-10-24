# Modelos de relatório — catálogo

> Fonte única dos modelos de relatório da Mundo Propício, nas duas ferramentas (Claude e ChatGPT). Antes de construir um relatório, procura aqui; se existir, usa o modelo. Quando um relatório ficar bom, guarda-o como modelo (R0). Regras e molde em `README.md` desta pasta.

> **Antes de produzir qualquer relatório, com ou sem modelo, lê `README.md` › "Identidade dos relatórios"**: cara própria MP, nunca com tiques de ChatGPT ou de Claude.

Uma linha por modelo. Ordem alfabética pelo nome da pasta.

| Pasta | Nome | Para que serve | Chat dono | Fontes de dados | Saída | Última utilização |
|---|---|---|---|---|---|---|
| `acerto-com-socios` | Acerto com sócios — nível 2 | Quanto uma parte transfere à outra: direito, desembolso e receitas em mãos. Cascata, activos exclusivos e encontro de contas, que o ERP não faz | 7 · Fecho e Sócios | `event_forecasts`, `event_partners`, `transactions`, ficheiros de operadores | xlsx + resumo md | 2026-09-02 |
| `auditoria-fornecedores` | Auditoria de fornecedores — NIF, IBAN e duplicados | Pôr as fichas em condições para a contabilidade e para os pagamentos, com validadores por cálculo | 4 · Financeiro e Tesouraria (execução no 10) | `suppliers`, `transactions`, `transaction_documents`, bucket | md | 2026-09-18 |
| `bilheteira-por-apuramento` | Bilheteira por apuramento — posição de conta-corrente | Quanto é que a bilheteira deve à MP (ou a MP à bilheteira) agora, pelos dois caminhos, e o saldo que transita entre apuramentos | 3 · Ticketing e Receita | `get_ticket_office_sales`, `_ticket_office_balance_raw`, `ticket_office_settlements`, `event_ticket_office_advances`, `transactions` | md (+ bloco WhatsApp) | 2026-09-13 |
| `conciliacao-bancaria` | Conciliação bancária | Explicar a diferença entre o saldo do banco e o do sistema, linha a linha, e deixar a lista do que falta lançar | 4 · Financeiro e Tesouraria | `bank_statements`, `bank_statement_lines`, `bank_line_transactions`, `transactions` | md | 2026-09-10 |
| `conciliacao-cartoes` | Conciliação de cartões pré-pagos | Pôr o saldo de cada cartão no sistema igual ao do banco e explicar a diferença movimento a movimento | 4 · Financeiro e Tesouraria | `financial_accounts`, `card_sessions`, `card_session_items`, `card_session_loads`, `transactions`, `bank_statement_lines` | md | 2026-10-07 |
| `dre-gerencial` | DRE gerencial | Resultado da empresa como a gestão o lê, com o detector das linhas que caem fora de todas as secções | 4 · Financeiro e Tesouraria | `transactions`, `account_categories`, `event_forecasts`, `ticket_sales` | md | 2026-10-10 |
| `fecho-evento` | Fecho de evento — prestação de contas | O documento que sai do fecho selado e vai para quem não tem acesso ao ERP | `fecho-<evento>-<ano>` (regra na frente 7) | as do `PROC-fecho-evento.md` | md ou xlsx | 2026-09-02 |
| `ocupacao-e-lotacao` | Ocupação e lotação | Quanto da sala está ocupado agora, por zona, sem contar lugares que já não existem | 3 · Ticketing e Receita | `event_zone_capacities` (por `observed_on`), `ticket_sales` | md (+ bloco WhatsApp) | 2026-09-30 |
| `triagem-de-issues` | Triagem de Issues | Varrer as Issues abertas e reparti-las por quem decide: corre sozinho, "ok" por lote, ou espera o Pedro | 1 · Controller | edge function `github-issues`, repo, Live | md | 2026-10-09 |

## Relação com os procedimentos

`fecho-evento` e `acerto-com-socios` **não repetem** `docs/procedimentos/PROC-fecho-evento.md`: o PROC é a conferência que corre antes e decide; os modelos são os documentos que apresentam o que ficou provado. Um documento gerado antes do selo é um rascunho e diz-se que é.

## Em fila para a próxima passagem

Propostos a 23/10/2026 e por construir: `bp-x-resultado`, `comparativo-de-edicoes`, `simulacao-de-sala`, `fecho-food-e-bares`, `trafego-x-vendas-diario`, `varredura-entrada-de-dados`.
