# ESTADO — Financeiro & Tesouraria

Atualizado: 09/10/2026 (ritual de fecho da frente). Issues desta sessão: #285 resolvida; #284 e #286 fechadas; #281 à espera de verificação.

## Em que pé está

### Resolvido nesta sessão (09/10/2026)

- **#285 — divisão inteira no cálculo do bruto.** Causa encontrada e corrigida: `transactions.iva_rate` é `integer`, e `/100` era divisão inteira. Migração `0045_derp198` em `reimbursement_propagate_payment` e `get_partner_settlement_summary`. **8 linhas** de notas de reembolso corrigidas (**+47,77 €** de IVA). Regra em `.lovable/memory/features/iva-rate-divisao-inteira.md`.
- **Rateio da Meta Apr-26** (fatura 252466632, **9.995,23 €**, IVA 0 por autoliquidação Art. 196.º). 4 filhas tinham IVA 23 e `split_percentage` NULL, o que explicava o `paid_amount` a zero. Corrigidas. Saíram **1.726,99 €** de custo fantasma de IVA de 4 eventos: Ivete Clareou **786,37**; SM-Porto **432,55**; SM-Lisboa **314,75**; Turnê Simone Mendes **193,32**.
  - A vigia `rateio_filhas_nao_somam_a_mae` passou a comparar também o bruto (migração `0051_derp203`), além das bases. A amostra traz `bruto_mae` e `soma_bruto_filhas`. Hoje: 0, conforme.
- **R-015 e R-016:** `paid_amount` a **74,20** e **360,76**, provado pelo extrato de 30/07. Encerra o achado do KPI "Liquidado" da lista de 29/07.
- **Stage Hands** a **1.008,60** e **Social Midia** a **861,00**, provado por fatura e extrato de 10/04.
- **Invariante `pago_abaixo_do_bruto`** criada: tolerância ±0,02 €, `reference_count` 1 (Portagens da Aquileia).
- **#284** (duplicação de fatura) e **#286** (`n_transactions`) fechadas.

## A trabalhar agora

Nada em curso.

## Em aberto, por decisão do Pedro

- **Backfill das 526 transações liquidadas sem `account_id` e sem `transaction_payments` (1.247.597 €).** Decisão separada — não corrigir sem instrução. A invariante `paid_sem_pagamento` está em erro com 157 linhas por causa disto.
- **#281:** verificação à espera do primeiro lote SEPA com linhas por liquidar.
- **Portagens da Aquileia, 2,58 €, Coala 2026 encerrado:** excepção aceite, não se toca.
- **Pagamento da Sharlene:** 3 fichas com IBANs diferentes. Pedido no quadro entre chats, à espera de resposta do chat financeiro.
- **Cartão 8363:** submeter os ~975 € da viagem do Ghanem antes de a sessão fechar.

## Onde ler mais

- `.lovable/memory/features/iva-rate-divisao-inteira.md` — regra `/100.0` para qualquer bruto a partir de `iva_rate`
- `.lovable/memory/features/invariante-pago-abaixo-do-bruto.md` — regra, tolerância e referência aceite
- `.lovable/memory/features/invariant-monitor.md` — motor das vigias e referências
- `.lovable/memory/features/payment-account-ownership.md` — as 526 liquidadas sem conta nem pagamento (sem backfill)
- `.lovable/memory/features/payment-amount-invariants.md` — soma de pagamentos e `paid_amount` nunca excedem o bruto
- `.lovable/memory/features/card-sessions.md` — modelo D17 e sessões de cartão
- `.lovable/memory/features/supplier-lifecycle.md` — fornecedores parecidos (D-ERP199/D-ERP201)
- `docs/DECISIONS.md` — D-ERP198 (#285), D-ERP199, D-ERP200, D-ERP201
