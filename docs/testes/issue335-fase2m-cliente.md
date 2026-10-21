# #335 fase 2m — cliente, inspeção parcial sem alterações

Revisor sub_ea4vwbsv; fontes vistas em blocos≤200 linhas. Não é inventário exaustivo.

- ReportBankStatement:account_id no documento; signed paid_amount no saldo/extrato; ajustes não monetários por perna.
- ReportCashFlow:paid_amount/account_id, filtro paid/non-reversed, exclui rateio-filhos; difere do helper sem filtros.
- FinancialAccounts:cards delegam useAccountBalanceCards→RPC; summary transactions não é a fórmula dos cards.
- useAccountBalanceCards:account_true_balances_asof+ticket_office_balances; caixa/retido/liquidação distintos.
- computeAccountBalance:initial_balance+signed paid_amount pela conta do documento+ajustes; sem filtro status/reversal.
- CardSessions:usa computeAccountBalance; erro da query de transações não inspecionado no trecho.
- CartaoEquipa:paid_amount || bruto cria fallback em zero, approved_total sem signed type/status/reversal no trecho.
- card-account-balance:delegação computeAccountBalance.
- card-session-balance:movimentos/as-of pelo documento; ajustes sem beforeDay no trecho.
- AccountBalanceImplantModal:previews atuais/propostos usam helper paid_amount.
- payment-settlement:paid e não revertido; preservar predicado ao definir caixa.

Proposta para decisão SEPARADA:definir dinheiro por perna/conta/data e distinção liquidação, corte legado,
ajustes e estornos, depois mudanças coordenadas dos consumidores. Não substituir RPCs canónicas por fórmula nova.
Search-only sem leitura integral:CardSessionDetail e OpenCardSessionModal chamam fetchCardAccountBalance.

Leituras/hash no momento pelo revisor; NÃO LIDO onde faltam intervalos:
- src/components/ReportBankStatement.tsx N649:1–180; NÃO LIDO181–649; eefb78a292151679e450b234276cdff80b9dc08e2dadd6a866c5cb4be0776d0c
- src/components/ReportCashFlow.tsx N441:90–200; NÃO LIDO1–89,201–441; 4865e4c23374984b6accd3d411d182726e02e997ef8ef43574cede53c1317197
- src/pages/FinancialAccounts.tsx N902:1–160; NÃO LIDO161–902; dc3c9d2355b5d0e9800bc31f916cb41baff1503f07b571a32f08d077ff30d6b4
- src/pages/CardSessions.tsx N240:1–110; NÃO LIDO111–240; c2900ea6e7e05d201180e12dbc479d468bfd42a42ee031b3b30ab65ed8f6e201
- src/pages/CartaoEquipa.tsx N464:1–110,111–200; NÃO LIDO201–464; ca51a7ee365eaf16d8f11b6da6561da2b6f804469c479b754b3ccdeb5a82491e
- src/hooks/useAccountBalanceCards.ts N153:1–150; NÃO LIDO151–153; d8ca8ac987394de502006a0d8d2d651439ebf708ff157f4af98c4616b819c047
- src/lib/account-balance.ts N165:1–165 INTEGRAL; f2bb2a87a5addcda58374086778c1e3c34e1d3bb1a85c824042802c8aae3fcb5
- src/lib/card-account-balance.ts N39:1–39 INTEGRAL; a97674b165ada32a196041f76e671eb9d6d650ceb81032ff2798dfe522639787
- src/lib/card-session-balance.ts N188:1–180; NÃO LIDO181–188; 1f05a72a6570903307fcf2c0c7a5c24dba9e3a16088fdd29b6dd4dd62fa79c08
- src/components/AccountBalanceImplantModal.tsx N203:40–90; NÃO LIDO1–39,91–203; e3355cc74a224343bcf8ca5e69354c39ef4b035d49ae21d76b45974b7d23390c
- src/lib/payment-settlement.ts N56:1–56 INTEGRAL; 9e592e125c84efdf68fd49f4f5296ffe113955a7a39a5df8a7bbf4b79da1ab64