# #498 / #457 — plano de moeda nativa por empresa

Tempo 1, checkout `7b3c106`. Prevalece o despacho de Pedro de 03/11/2026: `companies.currency` determina moeda; `companies.country`, locale/política. Valores permanecem na moeda da empresa. D1/D4/D5 mantêm-se; D7 e a conversão de consolidados de D6 estão revogados. Piloto: **Social Artists**. As cinco empresas e a prova Fortal são contexto fornecido, sem consulta a produção.

## 1. Inventário

Lidos INDEX, QUADRO/estados de plataforma e financeiro, memórias `multi-country-roadmap`, `transaction-installments`, `cities-multicountry`, `supplier-iban-validation`, `iva-portugal`, `iva-espanha`, documentação existente de #457 e código #403.

Pesquisa reproduzível, sem rede:

```sh
rg -n -i '€|\bEUR\b|pt-PT|toLocaleString|Intl\.NumberFormat|formatCurrency|formatMoney|\bfmt\b|\biva\b|\bIVA\b|iva_rate|\b23\b|IBAN|mod97|NIF|[Ff]atura' src supabase/functions supabase/migrations supabase/manual drizzle scripts --glob '!*.lock' --glob '!*.json'
```

Resultado bruto: **9.750 linhas / 1.141 ficheiros**, incluindo comentários, fixtures, datas com 23 e históricos. A tabela classifica pontos concretos prioritários; **inventário parcial**, não enumeração integral desse resultado. Cada referência é uma ocorrência verificada; referências agrupadas recebem o mesmo tratamento. Classes: **a** formatação; **b** regra/default IVA; **c** validação; **d** texto/menu; **e** edge/Deno, incluindo cálculos partilhados; **f** SQL/RPC/referência. A classe e/f prevalece sobre o subtipo. Contagem: **a=74; b=20; c=16; d=19; e=15; f=13; total=157 referências / 127 ficheiros**.

| Ficheiro:linha | Classe | Tratamento proposto |
|---|---|---|
| `src/lib/currency.ts:44`; `src/hooks/useDisplayCurrency.ts:14` | a | Reutilizar formatação, resolver empresa explicitamente; preservar moeda da conta publicitária. |
| `src/lib/mock-data.ts:154`; `src/lib/mock-data.ts:163` | a | Manter saída PT literal; adapter BR separado. |
| `src/lib/utils.ts:64`; `src/lib/utils.ts:84` | a | Locale resolvido, preservando datas civis e assinaturas legadas. |
| `src/components/ui/money-input.tsx:23`; `src/components/BPGridEditor.tsx:45`; `src/pages/admin/BPPlanilha.tsx:96` | a | Moeda/locale também no parser; aceitar R$ sem alterar parsing PT. |
| `src/components/EventFinancialCard.tsx:307`; `src/components/DashboardBalanceCards.tsx:131`; `src/components/TransactionRow.tsx:429` | a | Cards/linhas recebem formatter da empresa. |
| `src/components/EventForecast.tsx:2280`; `src/components/EventFecho.tsx:428`; `src/components/PartnerSettlementTab.tsx:1341` | a | BP/fecho/sócios com moeda da empresa. |
| `src/components/PaymentListsTab.tsx:205`; `src/components/PaymentTimeline.tsx:368`; `src/components/TransactionPaymentsListModal.tsx:181` | a | Formatação e auditoria textual coerentes. |
| `src/components/TransactionInstallmentsEditor.tsx:253`; `src/components/ScheduleInstallmentsModal.tsx:144`; `src/components/TransactionInstallmentGroupEditor.tsx:370`; `src/components/TransactionRenegotiateInstallmentsModal.tsx:33` | a | Parcelas herdam contexto monetário. |
| `src/components/CacheSettlementPanel.tsx:207`; `src/components/EventCacheConfig.tsx:662`; `src/components/CacheContractsPanel.tsx:139`; `src/components/ReportArtistCache.tsx:306` | a | Só apresentação; conservar motor canónico de cachê. |
| `src/components/TicketOfficeBalancePanel.tsx:250`; `src/components/TicketOfficePositionCards.tsx:75`; `src/lib/financial-position.ts:54` | a | Moeda no contexto; manter agregados/RPC/decomposição canónicos. |
| `src/lib/card-session-helpers.ts:17`; `src/lib/camarim-helpers.ts:87` | a | Retirar locale fixo; manter helper de caixa partilhado. |
| `src/components/ReportDRE.tsx:831`; `src/components/ReportDREEmpresarial.tsx:567`; `src/components/ReportDREBrasil.tsx:702`; `src/components/ReportPL.tsx:1039`; `src/components/ReportCashFlow.tsx:346`; `src/components/ReportPartnerSettlement.tsx:167` | a | Formatar apenas; não escolher regras financeiras por idioma. |
| `src/lib/export-dre.ts:420`; `src/lib/export-pl.ts:509`; `src/lib/excel-format.ts:9` | a | Formatter e formato numérico por moeda nos exports gerenciais. |
| `src/lib/export-event-bp-pdf.ts:67`; `src/lib/export-partner-statement.ts:196`; `src/lib/export-partner-statement-doc.ts:26`; `src/lib/export-partner-settlement-internal-pdf.ts:34` | a | Passar contexto aos documentos, preservando detalhes/agrupamento. |
| `src/lib/export-bank-statement.ts:42`; `src/lib/export-artist-cache-pdf.ts:40`; `src/lib/export-card-session.ts:99`; `src/lib/export-camarim-session-pdf.ts:84` | a | Cabeçalhos, máscara e valores na mesma moeda. |
| `src/components/ResultsAnalysis.tsx:571`; `src/pages/EventSimulator.tsx:115`; `src/components/EventABTab.tsx:33`; `src/components/ReimbursementNoteDetail.tsx:531` | a | Análise, simulação, A&B e reembolsos também recebem contexto. |
| `src/components/PartnerCapitalPanel.tsx:294`; `src/components/PartnerPaymentDialog.tsx:46`; `src/components/PartnerCurrentAccountTab.tsx:147`; `src/components/PartnerPaidExpensesPanel.tsx:353` | a | Aportes, pagamentos e conta-corrente na moeda da empresa. |
| `src/components/ReportForecastPayables.tsx:382`; `src/components/ReportBankStatement.tsx:351`; `src/components/ReportTreasuryProjection.tsx:145`; `src/components/ReportMonthlyEvolution.tsx:83`; `src/components/ReportProfitability.tsx:192`; `src/components/ReportBudgetDeviation.tsx:129` | a | Cobrir gráficos, tooltips, tabelas e PDFs internos. |
| `src/components/ReportMovementReconciliation.tsx:349`; `src/components/ReportBPTransactions.tsx:613`; `src/components/ReportTicketOfficeAudit.tsx:371`; `src/lib/export-contas-pagar.ts:57`; `src/lib/export-ticket-office-audit.ts:13`; `src/lib/export-event-ticketing-pdf.ts:53`; `src/lib/export-bp-transactions.ts:66`; `src/lib/export-bp-version-multi-comparison-pdf.ts:48` | a | Export e ecrã devem concordar, incluindo versões BP. |
| `src/components/supplier-credits/SupplierCreditsTab.tsx:123`; `src/components/supplier-credits/SupplierCreditBanner.tsx:42`; `src/pages/FinancialAccounts.tsx:329`; `src/pages/contabilidade/AccountantDocumentsTab.tsx:51` | a | Créditos/saldos/documentos com contexto; XLSX contador continua excluído. |
| `src/lib/utils.ts:40`; `src/lib/iva.ts:6` | b | Preservar delegação/aritmética PT; BR entrega taxa zero. |
| `src/hooks/useEventIvaCountry.ts:84`; `src/hooks/useEventIvaRates.ts:13` | b | Empresa BR prevalece; PT conserva regras de cidade PT/ES e bilheteira. |
| `src/components/TransactionFormModal.tsx:111`; `src/components/EventForecast.tsx:187`; `src/components/EventForecast.tsx:999`; `src/components/BPGridEditor.tsx:175`; `src/components/BPGridEditor.tsx:367` | b | Defaults/reset/fallback zero em BR, actuais em PT. |
| `src/components/TransactionRow.tsx:316`; `src/components/BatchPaymentModal.tsx:141`; `src/components/ReportContasPagar.tsx:200` | b | Não repor 23 em leituras BR sem taxa. |
| `src/components/EventTicketing.tsx:57`; `src/pages/Quotations.tsx:26`; `src/components/EventClosingCosts.tsx:48`; `src/pages/RecurringTransactions.tsx:45`; `src/lib/import-pl-xlsx.ts:30`; `src/lib/export-dre.ts:88` | b | Defaults/importações/contratos respeitam política; PT intacto. |
| `src/components/cards/NewCardExpenseModal.tsx:117`; `src/components/cards/NewCardExpenseModal.tsx:169` | b | Estado inicial e reset BR não repõem 23. |
| `src/lib/bank-account-value.ts:13`; `src/components/SupplierFormModal.tsx:255`; `src/lib/iban.ts:28` | c | Reutilizar #403a; MOD-97 só para IBAN; manter separadores não-IBAN. |
| `src/lib/validations.ts:25`; `src/lib/validations.ts:30`; `src/pages/FinancialAccounts.tsx:167` | c | NIF já opcional, sem checksum aqui; conta aceita texto; conferir limite de 34 caracteres. |
| `src/lib/payment-iban.ts:126`; `src/lib/sepa/pain001.ts:29` | c | Separar elegibilidade de pagamento gerencial da elegibilidade SEPA. |
| `src/lib/bp-tx-currency.ts:31`; `src/lib/installment-original.ts:51`; `src/lib/installment-original.ts:61` | c | BRL nativo não é moeda estrangeira; preservar guardas do percurso legado. |
| `src/components/CurrencyAmountInput.tsx:53`; `src/components/TransactionFormModal.tsx:181`; `src/components/TransactionEditModal.tsx:152`; `src/components/ForecastEditModal.tsx:142`; `src/components/TransactionPaymentModal.tsx:93` | c | Desligar exigência/derivação EUR no percurso BR nativo; nunca reconstruir valor. |
| `src/pages/Events.tsx:957`; `src/components/EventEditModal.tsx:422` | d | «Orçamento (R$)» em BR; texto PT byte-idêntico. |
| `src/components/EventForecast.tsx:3067`; `src/components/EventForecast.tsx:3068`; `src/components/SharedCostFields.tsx:183` | d | Colunas BR «Valor/Total (R$)»; ocultar IVA; unidade contextual. |
| `src/components/AppSidebar.tsx:115`; `src/App.tsx:548`; `src/App.tsx:616` | d | Capability fiscal PT + permissão no menu e acesso directo. |
| `src/components/SupplierFormModal.tsx:401`; `src/components/SupplierFormModal.tsx:443`; `src/pages/FinancialAccounts.tsx:463`; `src/lib/export-payment-list.ts:161` | d | Adapter NIF/CNPJ, Fatura/NF, IBAN/conta; não trocar semântica dos campos. |
| `src/lib/sepa/pain001.ts:353`; `src/components/SepaExportModal.tsx:101` | d | SEPA continua EUR/IBAN; indisponível com explicação em BRL. |
| `src/pages/Transactions.tsx:596`; `src/components/PaymentTimeline.tsx:729`; `src/components/financial-position/CoverageScenarioModal.tsx:64` | d | Avisos e campos auxiliares usam moeda contextual. |
| `src/components/supplier-credits/NewSupplierCreditModal.tsx:149`; `src/components/TransferFormModal.tsx:77` | d | Crédito e erro de saldo mostram moeda contextual. |
| `supabase/functions/_shared/settlement/iva.ts:31`; `supabase/functions/_shared/settlement/iva.ts:109` | e | Fallback PT preservado; política BR antes da resolução das taxas. |
| `supabase/functions/_shared/settlement/statement-service.ts:61`; `supabase/functions/_shared/settlement/statement-service.ts:744`; `supabase/functions/_shared/settlement/partner-statement-doc.ts:518`; `supabase/functions/_shared/settlement/partner-statement-doc.ts:765` | e | Empresa controla IVA/moeda; doc_locale do destinatário não controla tributação. |
| `supabase/functions/partner-statement/index.ts:162`; `supabase/functions/_shared/financial-position/assemble.ts:36` | e | Resolver country/currency no servidor; manter engine único e classificação existente. |
| `supabase/functions/close-card-session/index.ts:62`; `supabase/functions/close-card-session/index.ts:1012`; `supabase/functions/close-camarim-session/index.ts:694`; `supabase/functions/close-camarim-session/index.ts:1117` | e | Fecho, validação e dossier/PDF recebem contexto; BR total=base. |
| `supabase/functions/ingest-standalone-invoice/index.ts:50`; `supabase/functions/_shared/data-entry-analysis.ts:42`; `supabase/functions/extract-invoice-total/index.ts:198` | e | Ingestão/revisão BR sem EUR obrigatório, sem abrir gates #333. |
| `supabase/migrations/20260429021930_f270ff05-38a5-405a-9997-c40c3a9f795d.sql:10`; `supabase/migrations/20260419181710_a708498b-ce25-4424-a914-170f274df847.sql:32` | f | Colunas existentes; comentário EUR histórico não é contrato aprovado nem prova instalada. |
| `supabase/migrations/20260317112302_0966ea18-afee-468b-9299-db8ad68609d7.sql:63`; `supabase/migrations/20260317112302_0966ea18-afee-468b-9299-db8ad68609d7.sql:132`; `supabase/migrations/20260318165425_0be933f8-e5b9-4878-96c2-ded5162803f8.sql:1` | f | Defaults 23/6 exigem envio explícito de 0 em BR. |
| `supabase/migrations/20260918202957_24ccf1dd-1553-4a66-b6d9-915f0b6c70cc.sql:23`; `supabase/migrations/20260831184500_renegotiate_block_split_parent.sql:133` | f | Auditar CHECK FX/RPC contra contrato nativo; preparar R2 se ainda vigentes. |
| `drizzle/migrations/0302_issue403_supplier_foreign_accounts.sql:46`; `drizzle/migrations/0302_issue403_supplier_foreign_accounts.sql:54` | f | #403b preparado; reutilizar slots/tax_id_foreign, confirmar instalação separadamente. |
| `src/components/CityVenueSelector.tsx:34`; `src/components/CityVenueSelector.tsx:61`; `src/lib/country.ts:4`; `supabase/migrations/20260620221854_d0c23c96-b20b-4729-94be-eb8ea582e60d.sql:8` | f | Já consulta todos os países e prioriza país activo; seed BR existente, conferir lacuna de dados. |

## 2. Desenho mínimo

Um resolvedor puro `src/lib/company-locale.ts`, exposto por `src/hooks/useCompanyLocale.ts` sobre `useCompany`, devolve `{currency,locale,symbol,labels,capabilities,ivaPolicy}`. País resolve `pt-PT`/`pt-BR`; moeda vem exclusivamente de currency. Configuração ausente/inválida mostra estado indisponível, sem fallback silencioso EUR numa empresa BR. Sem nomes de empresas ou branches de país nos consumidores.

UI recebe `money`, `number`, `date`, labels e capabilities; exports recebem contexto explícito. Reutilizar `formatMoney` com locale explícito. Adapter PT preserva cada variante existente, incluindo formatter manual com pontos/NBSP, Intl, máscaras e precisão: substituir tudo por Intl alteraria píxeis PT. Datas civis mantêm-se sem deslocamento; campos alterados usam DatePicker partilhado, `dd/MM/aaaa`, limpeza explícita quando opcionais.

BR: controlo IVA oculto, taxa persistida **0**, total=base; impostos lançados como deduções gerenciais. PT delega às funções actuais, incluindo eventos ES, arredondamento por linha e defaults existentes. Não adicionar Brasil ao fallback fiscal PT como única solução. Defaults/reset/import/OCR/escrita devem consumir a política, não apenas esconder o campo. Taxa BR não-zero existente é inconsistência a rever; nenhuma limpeza automática.

Há percursos legados com conversão/exigência FX no checkout, apesar do armazenamento nativo informado. O adapter distingue BR nativo desses percursos: grava amount directamente em BRL, não pede FX nem preenche original artificial. Não migrar/reinterpretar histórico PT. Pagamentos, BP→TX e parcelas têm de passar essa identidade; guardas estrangeiras só são revistas após prova do contrato servidor. CHECK histórico FX é dependência R2, não motivo para inventar taxa 1.

Consolidação recebe moedas dos conjuntos autorizados antes de agregar: moedas distintas ou desconhecidas bloqueiam total/export com aviso; nunca somar/converter. Não ampliar queries entre empresas.

Deno recebe contexto da empresa autorizada do evento/sessão, nunca do browser. Partilhar resolvedor puro por `_shared/` e reexport frontend; preservar `statement-service`/builder único e grupos/detalhes. Idioma de fornecedor PT/BR fica independente da moeda/IVA da empresa; PDFs de fecho recebem ambos. Preparação de ficheiros e deploy são despachos separados.

Cidades: reutilizar `cities(country,name,state)` e mapa ISO→nome, sem catálogo concorrente. O seed contém 25 cidades BR, incluindo Fortaleza/CE e 3 não capitais; a memória sobrestima a cobertura de capitais. Não prova instalação. Preparar conferência e complemento idempotente por `(country,lower(name),state)`, incluindo capitais ausentes, sem duplicar Fortaleza manual. Não semear salas de outros tenants. Lista municipal completa exige fonte/dimensão e paginação antes de carregar milhares no select.

## 3. Risco PT

Existem `src/lib/__tests__/iva.test.ts`, `bp-formula.test.ts`, `event-settlement-engine.test.ts`, `partner-statement-doc.test.ts`, `issue457-br1-baselines.test.ts`, `issue465-br1b-contract.test.ts`, `issue467-comparison.test.ts`, `issue468-bp-tx-currency.test.ts`, `issue471-installment-flows.test.ts`: cobrem cêntimos, PT/ES, DRE/workbook, transporte e guardas. Caracterizações EUR antigas não provam prontidão BR.

Criar no primeiro PR `src/lib/__tests__/issue498-pt-baseline.test.tsx` e `fixtures/issue498-pt.json`: congelar saídas integrais BP/DRE antes do refactor, documentos/repasse, negativos, zero, rateio residual, parcelas com quatro casas; comparar depois sem regenerar expectativas. Acrescentar DOM/texto PT idênticos (NBSP, símbolo, defaults, menu), matriz BR 1.000→1.000/R$ e PT 1.000→1.230/€, PT→ES 21%, troca BR↔PT e bloqueio multimoeda. Falta prova visual desktop/mobile e catálogo/RPC instalado; testes locais não a substituem. Cada PR corre tsgo e Vitest completos.

## 4. Divisão em partes para o tempo 2

P1–P4 monolíticos excedem 60 minutos; dividir em PRs abaixo, sequenciais nas dependências. Cada linha inclui implementação e validação local, **até 60 min**, compilando/testando isoladamente. Caminhos relativos a `src/`; `C/`=`components/`, `L/`=`lib/`, `H/`=`hooks/`, `P/`=`pages/`. Ficheiros novos assinalados **+**. Nenhum caminho futuro fica autorizado por este plano.

| PR / minutos | Resultado e lista de ficheiros |
|---|---|
| P1a / 55 | Baseline + API: **+**L/company-locale.ts, **+**H/useCompanyLocale.ts, L/currency.ts, **+**L/__tests__/issue498-pt-baseline.test.tsx, **+**L/__tests__/fixtures/issue498-pt.json. |
| P1b / 45 | Eventos/cards: P/Events.tsx, C/EventEditModal.tsx, C/EventFinancialCard.tsx, C/DashboardBalanceCards.tsx, C/TransactionRow.tsx. |
| P1c / 55 | Listas/relatórios: P/Transactions.tsx, C/ReportDRE.tsx, C/ReportDREEmpresarial.tsx, C/ReportDREBrasil.tsx, C/ReportPL.tsx, C/ReportCashFlow.tsx, C/ReportPartnerSettlement.tsx. |
| P1d / 55 | Exports gerenciais: L/export-dre.ts, L/export-pl.ts, L/excel-format.ts, L/export-event-bp-pdf.ts, L/export-payment-list.ts, L/export-bank-statement.ts. |
| P1e / 50 | Bilheteiras/posição: L/financial-position.ts, C/TicketOfficeBalancePanel.tsx, C/TicketOfficePositionCards.tsx, C/financial-position/{FinancialPositionView,P6bSections,FutureCoverageCard,CoverageScenarioModal}.tsx. |
| P1f / 55 | Cachês/sessões: C/{CacheSettlementPanel,EventCacheConfig,CacheContractsPanel,ReportArtistCache}.tsx, L/{card-session-helpers,camarim-helpers,export-artist-cache-pdf,export-card-session,export-camarim-session-pdf}.ts. |
| P1g / 55 | Vistas complementares: C/{ResultsAnalysis,EventABTab,ReimbursementNoteDetail,PartnerCapitalPanel,PartnerPaymentDialog,PartnerCurrentAccountTab,PartnerPaidExpensesPanel}.tsx, P/EventSimulator.tsx. |
| P1h / 55 | Relatórios secundários: C/{ReportForecastPayables,ReportBankStatement,ReportTreasuryProjection,ReportMonthlyEvolution,ReportProfitability,ReportBudgetDeviation}.tsx. |
| P1i / 55 | Reconciliação/exports: C/{ReportMovementReconciliation,ReportBPTransactions,ReportTicketOfficeAudit}.tsx, L/{export-contas-pagar,export-ticket-office-audit,export-event-ticketing-pdf,export-bp-transactions,export-bp-version-multi-comparison-pdf}.ts. |
| P1j / 50 | Créditos/documentos: C/supplier-credits/{NewSupplierCreditModal,SupplierCreditsTab,SupplierCreditBanner}.tsx, C/TransferFormModal.tsx, P/FinancialAccounts.tsx, P/contabilidade/AccountantDocumentsTab.tsx. |
| P2a / 50 | Política BR/capability: L/company-locale.ts, H/{useEventIvaCountry,useEventIvaRates}.ts, C/IvaRateSelect.tsx, C/AppSidebar.tsx, App.tsx, L/validations.ts; permissões de L/permissions.ts preservadas. |
| P2b / 55 | BP: C/{EventForecast,BPGridEditor,ForecastEditModal}.tsx, P/admin/BPPlanilha.tsx, L/import-pl-xlsx.ts, C/ui/money-input.tsx. |
| P2c / 55 | Criação nativa: C/{TransactionFormModal,CurrencyAmountInput}.tsx, L/bp-tx-currency.ts, L/__tests__/issue468-bp-tx-currency.test.ts; revisão das fixtures antigas sem enfraquecer PT. |
| P2d / 50 | Edição nativa: C/TransactionEditModal.tsx, C/SharedCostFields.tsx, C/ReportContasPagar.tsx, C/BatchPaymentModal.tsx. |
| P2e / 55 | Pagamentos: C/{TransactionPaymentModal,TransactionPaymentsListModal,PaymentTimeline,PaymentListsTab}.tsx. |
| P2f / 55 | Parcelas, após contrato servidor: L/installment-original.ts, C/{TransactionInstallmentsEditor,ScheduleInstallmentsModal,TransactionInstallmentGroupEditor,TransactionRenegotiateInstallmentsModal}.tsx, L/__tests__/issue471-installment-flows.test.ts. |
| P2g / 55 | Entradas secundárias: C/{EventTicketing,EventClosingCosts}.tsx, P/{RecurringTransactions,Quotations}.tsx, C/cards/NewCardExpenseModal.tsx, C/camarim/CamarimItemModal.tsx, C/implementation/ImplBPTab.tsx. |
| P2h / 55 | Meios de pagamento por país (acrescentado 03/11/2026, «Sim» do Pedro): L/payment-methods.ts, L/company-locale.ts, C/{TransactionFormModal,TransactionEditModal,TransactionPaymentModal,BatchPaymentModal,SupplierFormModal,SupplierBankDetails}.tsx, P/FinancialAccounts.tsx, **+**L/__tests__/issue498-payment-methods.test.ts. R2 separado prepara **+**`drizzle/migrations/0303_issue498_payment_methods_br.sql`, sem aplicar. |
| P3a / 45 | Cidades: C/CityVenueSelector.tsx, L/country.ts, **+**L/__tests__/issue498-cities.test.tsx; R2 separado prepara seed/conferência, sem aplicar. |
| P3b / 55 | Reutilização #403: C/{SupplierFormModal,SupplierBankDetails,IbanWarning}.tsx, P/FinancialAccounts.tsx, L/{bank-account-value,supplier-bank,validations}.ts; campos novos dependem da instalação #403b confirmada. |
| P3c / 45 | Elegibilidade/capability SEPA e labels: L/payment-iban.ts, C/{SepaExportModal,PaymentListsTab}.tsx, L/company-locale.ts; não gerar formato bancário BR. |
| P4a / 55 | Preparação R2 partilhada: **+**supabase/functions/_shared/company-locale.ts, supabase/functions/_shared/settlement/{statement-service,partner-statement-doc}.ts, L/company-locale.ts, L/export-partner-statement-doc.ts. |
| P4b / 50 | Preparação R2 documentos: supabase/functions/{partner-statement,financial-position}/index.ts, L/{export-partner-statement,export-partner-settlement-internal-pdf}.ts, C/{EventFecho,PartnerSettlementTab}.tsx. |
| P4c / 55 | Preparação R2 fechos: supabase/functions/{close-card-session,close-camarim-session}/index.ts e testes de dossier/contexto em **+**L/__tests__/issue498-session-docs.test.ts. |
| P4d / 55 | Preparação R2 ingestão: supabase/functions/{ingest-standalone-invoice,extract-invoice-total}/index.ts, supabase/functions/_shared/data-entry-analysis.ts e **+**L/__tests__/issue498-ingestion.test.ts; gates #333 conservados. |

P1a precede consumidores; P2a precede defaults; P4a precede P4b–d. P2c/e/f dependem da auditoria R2 dos CHECKs/RPCs: PR R2-prep de até 60 min prepara **+**`supabase/manual/issue498-native-currency.INERTE.sql` e **+**`supabase/manual/issue498-native-currency.ROLLBACK.sql`, sem aplicação. Conferir catálogo fiel e promover separadamente. P4 acrescenta verificação Deno e contratos aos checks frontend. Não declarar BR operacional antes dessas dependências.

Esta lista cobre os percursos prioritários, não todos os 9.750 resultados: faltam triagem linha-a-linha dos consumidores secundários, imports/exports restantes, contabilidade, procura integral de consolidados e matriz SQL/RPC/defaults actuais. Cada lote residual precisa de lista fechada própria após triagem; não cabe num PR final genérico de 60 minutos.

### 4.1 P2h — meios de pagamento e contas bancárias BR (03/11/2026)

Medido em Live em 02/11/2026 (0 · Cowork Claude): `payment_method` em `transactions` e `transaction_payments` está limitado por CHECK a `transfer, service_payment, direct_debit, state_payment, compensation`, com espelho em `src/lib/payment-methods.ts` e em `supabase/functions/update-transaction`; `transactions_service_payment_requires_mb` (NOT VALID) exige entidade 5 dígitos + referência 9 dígitos. O plano não tratava este domínio nem a conta bancária da própria empresa (`financial_accounts.iban`, texto livre).

Regra: a lista de meios vem da `companyLocale`. PT mantém a lista e os rótulos actuais byte-idênticos. BR oferece `pix`, `boleto`, `transfer` (rótulo «Transferência (TED)»), `direct_debit` («Débito automático») e `compensation` onde já é oferecida; `service_payment` e `state_payment` não aparecem em BR. Boleto exige linha digitável (47 ou 48 dígitos) em `payment_reference`; Pix usa chave Pix. Chave Pix e conta BR (banco, agência, conta, dígito, tipo corrente/poupança) vivem no slot `br_banco_agencia_conta` de `foreign_bank_accounts` (#403b) no fornecedor e num campo estruturado equivalente em `financial_accounts`. `compensation` continua a ser a única grafia que desarma `trg_force_no_account_on_compensation`.

R2 (0303, preparada pelo executor, aplicada na janela Claude com «Sim»): alargar os dois CHECKs com `pix` e `boleto`; CHECK `transactions_boleto_requires_linha` NOT VALID; coluna estruturada para a conta BR em `financial_accounts`. Aditiva; não altera dados PT. Depende de P2a (política BR) e de P3b (#403b instalada) para os campos de fornecedor; a lista de meios e a validação do boleto não dependem.

## 5. Perguntas fechadas ao Pedro

- Cidades BR no primeiro seed: **A)** capitais e 3 cidades já previstas, completando capitais ausentes; **B)** todos os municípios por UF, com paginação/fonte versionada? Recomendo A.
- Identificador fiscal de fornecedor BR: **A)** reutilizar `tax_id_foreign`/`tax_id_type` da #403b após instalação confirmada; **B)** nesta etapa só rótulos, adiando persistência CNPJ? Recomendo A; B deixa lacuna operacional explícita.

## 6. Fora de âmbito confirmado

DRE com nomenclatura BR (o componente `ReportDREBrasil` existente não significa empresa BR), XLSX contador, plano de contas/templates BR, fiscal_meta, CBS/IBS, TaxEngine completo, NF-e/SEFAZ, câmbio e saneamento histórico. Conversores/tráfego com moeda da conta já existem; não serão redireccionados para a moeda da empresa. SEPA mantém contrato EUR/IBAN, sem export bancário BR novo. Sem alterações RLS, migrações aplicadas, dados reais, serviços MP, Live, deploy, commits ou push neste despacho. Inventário completo e comprovação operacional permanecem pendentes; o plano não certifica 100% BR.
