---
capitulo: relatorios
titulo: Relatórios
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: [/relatorios]
fontes: [src/components/ReportDRE.tsx, src/components/ReportDREBrasil.tsx, src/components/ReportPL.tsx, src/components/ReportBankStatement.tsx, src/components/ReportCashFlow.tsx, src/components/ReportContasPagar.tsx, src/components/ReportMovementReconciliation.tsx, src/components/ReportArtistCache.tsx, src/components/ReportPartnerExpenses.tsx, src/components/ReportTicketOfficeAudit.tsx, src/components/ReportDocumentPendencies.tsx, src/components/PaymentListsTab.tsx, src/pages/ReportPaymentListsPage.tsx, src/pages/Reports.tsx]
---

## DRE — Demonstração de Resultado

```ajuda
id: relatorios.dre
tooltip: "Apresenta receitas e despesas agrupadas por categoria, com cálculo do resultado líquido."
ecras: [relatorios.dre]
perfis: []
fontes: [src/components/ReportDRE.tsx, src/components/ReportDREBrasil.tsx]
termos: [DRE, Visão Sócio, DRE Brasil]
```

Apresenta receitas e despesas agrupadas por categoria, com cálculo do resultado líquido. O sistema oferece duas versões:

DRE Padrão — Layout de 3 colunas (Sem IVA, IVA e Com IVA). A linha 'Mundo Propício' aparece como sócia (com a quota residual: 100 − Σ sócios externos) e reflete o lucro real (ex-IVA) que cabe à empresa gestora.

DRE Brasil — Relatório adaptado para sócios com base 'Despesas c/IVA', com layout de coluna única (Receitas s/IVA e Despesas c/IVA).

Em ambos, a 'Visão Sócio' inclui custos de fecho para refletir o impacto total na divisão de resultados.

## Business Plan (BP) Consolidado

```ajuda
id: relatorios.bp-consolidado
tooltip: "Compara previsões do BP com valores reais por evento e categoria."
ecras: [relatorios.bp-consolidado]
perfis: []
fontes: [src/components/ReportPL.tsx]
termos: [BP, previsões]
```

Compara previsões do BP com valores reais por evento e categoria. Permite identificar desvios e ajustar o planeamento. Inclui opção de visualizar o histórico de alterações de linhas aprovadas.

## Extrato Bancário

```ajuda
id: relatorios.extrato
tooltip: "Extrato detalhado de cada conta financeira com todas as movimentações e saldo acumulado."
ecras: [relatorios.extrato]
perfis: []
fontes: [src/components/ReportBankStatement.tsx]
termos: [Extrato, saldo]
```

Extrato detalhado de cada conta financeira com todas as movimentações e saldo acumulado. Inclui visualização de documentos anexados por transação. Use para conferir com extratos do banco.

## Fluxo de Caixa

```ajuda
id: relatorios.fluxo-caixa
tooltip: "Projeção de entradas e saídas futuras com base nas datas de vencimento."
ecras: [relatorios.fluxo-caixa]
perfis: []
fontes: [src/components/ReportCashFlow.tsx]
termos: [liquidez, vencimento]
```

Projeção de entradas e saídas futuras com base nas datas de vencimento. Essencial para planear a liquidez da empresa.

## Contas a Pagar

```ajuda
id: relatorios.contas-a-pagar
tooltip: "Lista de compromissos financeiros pendentes com valores, datas de vencimento e estado de pagamento."
ecras: [relatorios.contas-a-pagar]
perfis: []
fontes: [src/components/ReportContasPagar.tsx]
termos: [compromissos, pagamento]
```

Lista de compromissos financeiros pendentes com valores, datas de vencimento e estado de pagamento.

## Movimentações

```ajuda
id: relatorios.movimentacoes
tooltip: "Relatório analítico de movimentações financeiras que consolida todas as transações (liquidadas e em aberto) agrupadas por evento."
ecras: [relatorios.movimentacoes]
perfis: []
fontes: [src/components/ReportMovementReconciliation.tsx]
termos: [movimentações, liquidações parciais]
```

Relatório analítico de movimentações financeiras que consolida todas as transações (liquidadas e em aberto) agrupadas por evento. Suporta filtros por período, multi-seleção de contas e eventos, e inclui visualização de anexos e log de auditoria para liquidações parciais.

## Cachê do Artista

```ajuda
id: relatorios.cache-artista
tooltip: "Relatório analítico dedicado ao cachê de cada artista do evento."
ecras: [relatorios.cache-artista]
perfis: []
fontes: [src/components/ReportArtistCache.tsx]
termos: [cachê, PDF]
```

Relatório analítico dedicado ao cachê de cada artista do evento. Para cachê variável, demonstra passo a passo: receita de bilheteira → deduções por categoria → dedução fixa percentual → base de cálculo → percentagem do artista → cachê bruto. Para cachê fixo, apresenta o valor acordado.

Em seguida, lista analiticamente todos os custos extras a descontar, chegando ao cachê líquido a pagar. Pode ser exportado em PDF para prestação de contas ao artista ou à sua equipa.

## Despesas de Sócios

```ajuda
id: relatorios.despesas-socios
tooltip: "Relatório consolidado de todas as despesas pagas diretamente por sócios/parceiros em qualquer evento."
ecras: [relatorios.despesas-socios]
perfis: []
fontes: [src/components/ReportPartnerExpenses.tsx]
termos: [sócios, PDF]
```

Relatório consolidado de todas as despesas pagas diretamente por sócios/parceiros em qualquer evento. Filtre por evento ou sócio e exporte o relatório em PDF. Estas despesas compõem a apuração do resultado do evento no encontro de contas.

## Auditoria de Bilheteiras

```ajuda
id: relatorios.auditoria-bilheteiras
tooltip: "Relatório de consolidação financeira de bilheteiras com visões Sintética e Analítica."
ecras: [relatorios.auditoria-bilheteiras]
perfis: []
fontes: [src/components/ReportTicketOfficeAudit.tsx]
termos: [bilheteiras, Excel]
```

Relatório de consolidação financeira de bilheteiras com visões Sintética e Analítica. A visão Analítica suporta agrupamento 'Por Categoria' ou 'Por Evento' em três níveis de detalhe. Vendas e despesas diretas são separadas por evento; comissões são distribuídas proporcionalmente pelo volume de vendas; transferências são tratadas como movimentos globais. Exportável em PDF e Excel.

## Pendências Documentais

```ajuda
id: relatorios.pendencias
tooltip: "Relatório de auditoria que identifica transações com conta bancária associada que não possuem documentos contábeis (faturas, recibos, notas fiscais) anexados."
ecras: [relatorios.pendencias]
perfis: []
fontes: [src/components/ReportDocumentPendencies.tsx]
termos: [pendências, contábeis]
```

Relatório de auditoria que identifica transações com conta bancária associada que não possuem documentos contábeis (faturas, recibos, notas fiscais) anexados. Filtre por período, conta ou evento. Use como ferramenta de conformidade contínua para regularizar pendências antes da exportação contábil.

Os cards resumo permitem alternar rapidamente entre transações pendentes, conformes ou todas. Exportável em Excel.

## Listas de Pagamento

```ajuda
id: relatorios.listas-pagamento
tooltip: "Agrupe transações aprovadas em listas para processamento em lote."
ecras: [relatorios.listas-pagamento]
perfis: []
fontes: [src/components/PaymentListsTab.tsx, src/pages/ReportPaymentListsPage.tsx]
termos: [lote, aprovação]
```

Agrupe transações aprovadas em listas para processamento em lote. As listas passam por aprovação antes de serem executadas. Pode criar listas tanto no módulo de relatórios como diretamente nas transações.

## Exportar para PDF / Excel

```ajuda
id: relatorios.exportar
tooltip: "Todos os relatórios podem ser exportados para PDF (impressão) ou Excel (análise)."
ecras: [relatorios.exportar]
perfis: []
fontes: [src/pages/Reports.tsx, src/components/ReportMovementReconciliation.tsx]
termos: [PDF, Excel]
```

Todos os relatórios podem ser exportados para PDF (impressão) ou Excel (análise). O PDF preserva a hierarquia e formatação visual.
