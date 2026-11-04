---
capitulo: contabilidade
titulo: Contabilidade
modulo: erp
atualizado: 2026-11-04
perfis: []
rotas: [/relatorios/pendencias-documentais, /relatorios/exportacao-contabil]
fontes: [src/components/TransactionDocumentsModal.tsx, src/pages/ReportDocumentPendenciesPage.tsx, src/components/ReportDocumentPendencies.tsx, src/pages/ReportAccountingExportPage.tsx, src/components/ReportAccountingExport.tsx]
---

## Classificação de documentos contábeis

```ajuda
id: contabilidade.classificacao
tooltip: "Ao anexar documentos a transações, marque a checkbox 'Documento contábil' para ficheiros fiscais (faturas, notas fiscais, recibos, notas de crédito/débito, comprovativos de pagamento)."
ecras: [contabilidade.classificacao]
perfis: []
fontes: [src/components/TransactionDocumentsModal.tsx]
termos: [contábeis, checkbox]
```

Ao anexar documentos a transações, marque a checkbox 'Documento contábil' para ficheiros fiscais (faturas, notas fiscais, recibos, notas de crédito/débito, comprovativos de pagamento). O ícone de informação (ℹ️) junto da checkbox lista exemplos do que marcar e do que não marcar.

Esta classificação é o filtro principal para a exportação contábil e o relatório de pendências.

## Relatório de Pendências Documentais

```ajuda
id: contabilidade.pendencias
tooltip: "Auditoria de conformidade documental — identifica transações com conta bancária que não possuem documentos contábeis (faturas, recibos, notas fiscais) anexados. Use para regularizar pendências antes da exportação contábil."
ecras: [contabilidade.pendencias]
perfis: []
fontes: [src/pages/ReportDocumentPendenciesPage.tsx, src/components/ReportDocumentPendencies.tsx]
termos: [Pendências Documentais, auditoria]
```

Disponível em [Relatórios → Pendências Documentais](/ajuda?artigo=relatorios#relatorios.pendencias). Identifica transações com conta bancária que não possuem documentos marcados como contábeis. Filtre por período, conta financeira ou evento.

Os cards resumo clicáveis permitem alternar entre transações pendentes (⚠️), conformes (✅) ou todas. Use como ferramenta de auditoria contínua para regularizar pendências antes de qualquer exportação.

## Registo de exportações

```ajuda
id: contabilidade.exportacoes
tooltip: "Exportação para contabilidade: selecione o período e descarregue todos os documentos fiscais (faturas, recibos, notas fiscais) anexados às transações. Apenas ficheiros marcados como 'Documento contábil' são incluídos. O sistema regista cada exportação para controlo e rastreabilidade."
ecras: [contabilidade.exportacoes]
perfis: []
fontes: [src/pages/ReportAccountingExportPage.tsx, src/components/ReportAccountingExport.tsx]
termos: [exportação, contábil]
```

Cada exportação contábil fica registada no sistema com a data, o período exportado, quem exportou e as contagens de transações, documentos e pendências. Este registo permite rastrear o que já foi enviado à contabilidade.
