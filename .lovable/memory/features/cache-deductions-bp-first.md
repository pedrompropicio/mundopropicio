---
name: Deduções do cachê — BP primeiro
description: Deduções do cachê variável contam pelo BP aprovado + excedido; Master rateado 1/N igual por cidade (D-ERP148)
type: feature
---
- Rubrica de dedução = BP aprovado (operacional OU overhead) + max(realizado − previsto, 0) por evento (event-cost-basis). Nunca BP + TX.
- Cidade de turnê: própria cidade (peso 1) + Master × 1/N (N = nº de cidades), igual, independente de vendas.
- Origem mostrada no painel: BP / transação / BP + excedido. Aviso "sem transação = 0,00" removido.
- Aceitação SM 2026: Lisboa 24.582,28 (20.860,18 + 3.722,10) · Porto 25.423,68 (20.860,18 + 4.563,50).
- Pendente: grelha /eventos (events-list-cache-impact.ts) ainda usa só transações.
