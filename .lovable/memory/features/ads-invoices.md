---
name: Faturas Ads (Meta e Google)
description: Fatura em PDF é fonte de verdade (parse_meta/parse_google), importação em 3 fases com dry_run, e rateio dos ajustes pelas transações-filhas
type: feature
---

# Faturas Ads — parser, importação e ajustes

Tabelas `public.ads_invoice` + `public.ads_invoice_line`, bucket privado `ads-invoices`
(caminho isolado por empresa), edge functions `ads-invoice-ingest` e `ads-invoice-apply`,
ecrã **Faturas Ads** (`/faturas-plataformas`).

## Fonte de verdade (D-ERP31)

O **PDF** é a fatura. O espelho da API serve para acompanhar campanhas, nunca para lançar
custo: não reporta créditos promocionais (nos 3 meses medidos, espelho 2.586,93 € vs.
faturas reais 2.273,03 €). `propose_google` (a partir de `crm.google_campaign_insights_daily`)
fica **legado**.

- `parse_meta` — parser Meta, em produção, provado. **Não se reescreve.**
- `parse_google` — parser irmão em `_shared/ads-invoice-google-parser.ts`: cabeçalho
  (número, data, período real DD/MM/AAAA, `billing_period` no 1.º dia do mês, conta, total),
  mídia por campanha, e ajustes classificados em `invalid_activity` (nomeia a fatura e a
  campanha de origem), `promotion` (crédito promocional/cupão) e `fee` (taxas regulatórias,
  ex. DST do Reino Unido). Recusa gravar (422) se a soma das linhas não fechar o total ao cêntimo.
- Validado ao cêntimo contra 3 faturas reais: 5623212749 (420,01 €), 5649390521 (776,73 €),
  5677864015 (1.076,29 €).

## Importação — três fases, sempre

1. escolher plataforma + PDF;
2. `dry_run: true` — lê e mostra número, período, total, soma, reconciliação, nº de linhas
   e avisos; **não grava**;
3. gravar a proposta só depois da confirmação humana.

UI em `src/components/ads/AdsInvoiceImportDialog.tsx`, aberta a admin/manager/contabilista.
O PDF fica arquivado no bucket antes da leitura (`file_path` gravado na fatura).

## Rateio dos ajustes (igual para Meta e Google)

Em `ads-invoice-apply → handleGenerate`:

- ajuste **com campanha identificada** desce inteiro ao evento dessa campanha;
- ajuste **anónimo** (promoções, taxas) é rateado à proporção da mídia de cada evento
  *na mesma fatura*; o cêntimo residual vai para a filha de maior valor;
- ajustes **não geram transações próprias** — somam-se às filhas; o comprovativo de
  veiculação mostra a parcela rateada em linha própria;
- geração recusada se `filhas + fora do sistema ≠ total da fatura`;
- `ads_invoice_line.transaction_id` passa a ligar também os ajustes com evento.

## Google Ads API — não é via para faturas

Billing setup `customers/2200043144/billingSetups/8418160932` está `APPROVED` mas em
pagamentos automáticos: `InvoiceService.ListInvoices` (v24) devolve HTTP 400
`BILLING_SETUP_NOT_ON_MONTHLY_INVOICING`. Não há `pdf_url` a puxar — o PDF entra à mão.
Não voltar a investigar isto sem mudança de regime de faturação da conta.
