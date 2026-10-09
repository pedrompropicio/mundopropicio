# ESTADO — Financeiro & Tesouraria

Atualizado: 09/10/2026 (ritual de fecho da frente; inclui o trabalho do chat financeiro-e-tesouraria de 08–09/10). Issues desta sessão: #285 resolvida; #284, #286 e #287 fechadas; #281 à espera de verificação.

## Em que pé está

### Resolvido nesta sessão (09/10/2026)

- **#285 — divisão inteira no cálculo do bruto.** Causa encontrada e corrigida: `transactions.iva_rate` é `integer`, e `/100` era divisão inteira. Migração `0045_derp198` em `reimbursement_propagate_payment` e `get_partner_settlement_summary`. **8 linhas** de notas de reembolso corrigidas (**+47,77 €** de IVA). Regra em `.lovable/memory/features/iva-rate-divisao-inteira.md`.
- **Rateio da Meta Apr-26** (fatura 252466632, **9.995,23 €**, IVA 0 por autoliquidação Art. 196.º). 4 filhas tinham IVA 23 e `split_percentage` NULL, o que explicava o `paid_amount` a zero. Corrigidas. Saíram **1.726,99 €** de custo fantasma de IVA de 4 eventos: Ivete Clareou **786,37**; SM-Porto **432,55**; SM-Lisboa **314,75**; Turnê Simone Mendes **193,32**.
  - A vigia `rateio_filhas_nao_somam_a_mae` passou a comparar também o bruto (migração `0051_derp203`), além das bases. A amostra traz `bruto_mae` e `soma_bruto_filhas`. Hoje: 0, conforme.
- **R-015 e R-016:** `paid_amount` a **74,20** e **360,76**, provado pelo extrato de 30/07. Encerra o achado do KPI "Liquidado" da lista de 29/07.
- **Stage Hands** a **1.008,60** e **Social Midia** a **861,00**, provado por fatura e extrato de 10/04.
- **Invariante `pago_abaixo_do_bruto`** criada: tolerância ±0,02 €, `reference_count` 1 (Portagens da Aquileia).
- **#284** (duplicação de fatura) e **#286** (`n_transactions`) fechadas.

### Fornecedores (08–09/10/2026)

- **Fornecedores duplicados:** 16 fichas juntadas em 13. MP: SGEHR com 2 IBANs e Pop Cargo; Coala: 11 fichas. Transações e referências repontadas; duplicadas inativas com a nota "09/10/2026: ficha duplicada, unificada em <id>".
- **Sharlene:** unificada na ficha `2a0cb6d5`, NIF **239147057**, IBAN 1 Millennium e IBAN 2 Santander; `34fc5324` inativa.
- **Aviso de fornecedor parecido (D-ERP199)** e **fila de revisão (D-ERP201):** `supplier_similarity_flags`, com revisão em `/admin/fornecedores-parecidos`. NIF compara sem prefixo de país de duas letras quando o restante é numérico. Backfill de **50 pares** (MP **6**, Coala **44**); referência da vigia `supplier_similar_por_rever` = **50**.

### Camarim e pagamentos (08–09/10/2026)

- **#287 fechada (D-ERP200):** a perna da conta da sessão de camarim acompanha o pagamento da perna do banco pelo trigger `zz_camarim_session_leg_follows_bank`. Vigia `camarim_adiantamento_sem_entrada` = **0**. Corrigidas à mão antes: SM Porto `a655f5de` (**1.000 €**, **02/10**) e SM Lisboa `9a04aafe` (**500 €**, **30/09**).
- **Sharlene, FT 1A2601/40:** **2.054,29 €**, SM Porto, linha `467874e5`. Duas linhas no grupo de fatura `874ab201`:
  - `ae79cfb2`: **813,01 € + IVA = 1.000 €**, paga em **02/10** pela conta do camarim SM Porto, com o adiantamento entregue pela Liliam.
  - `ba23d195`: **857,14 € + IVA = 1.054,29 €**, aprovada, a pagar para o Millennium.
  - PDF anexado reconstruído da foto. "Pago por Cartão de Débito" na fatura é texto fixo do programa dela, não é pagamento. Sessão de camarim SM Porto `cacd82fd` fechada sem integração.
- **Camarim SM Lisboa `0403d64e`:** aberta, adiantamento de **500 €** recebido, sem recibos lançados; segue o fluxo normal.
- **Pagos e confirmados:** acerto Ivete de **765,85 €** à Liliam (lista de **01/10**); Juliana **R-039 (1.140 €)** e **R-040 (350 €)**.
- **Empréstimo Santander:** prestações lançam-se pelo valor cheio em **10.2.02** (prefixado, não muda).

### Testes — encaminhamento a 09/10/2026

- **#288, #289 e #290:** abertas a 09/10 a partir de testes vermelhos; isoladas com `skip` e colocadas na fila do chat plataforma-e-infra. Registo do encaminhamento nesse momento; o estado atual dos testes acompanha-se nessa frente.

## A trabalhar agora

Nada em curso.

## Em aberto, por decisão do Pedro

- **Backfill das 526 transações liquidadas sem `account_id` e sem `transaction_payments` (1.247.597 €).** Decisão separada — não corrigir sem instrução. A invariante `paid_sem_pagamento` está em erro com 157 linhas por causa disto.
- **#281:** verificação à espera do primeiro lote SEPA com linhas por liquidar.
- **Portagens da Aquileia, 2,58 €, Coala 2026 encerrado:** excepção aceite, não se toca.
- **Cartão 8363:** submeter os ~975 € da viagem do Ghanem antes de a sessão fechar.
- **Sharlene `ba23d195`, 1.054,29 €:** pagar por lista para o Millennium.
- **Seguros do Plenitude, 72,33 € e 65,65 €:** pagar por referência MB, numa lista nova.
- **Fornecedores parecidos:** rever os **50 pares** em `/admin/fornecedores-parecidos`.
- **Pagamento à Sharlene de 08/04:** aviso **1.162,25 € vs 1.162,35 €**, a confirmar quando o extrato de abril entrar.

## Onde ler mais

- `.lovable/memory/features/iva-rate-divisao-inteira.md` — regra `/100.0` para qualquer bruto a partir de `iva_rate`
- `.lovable/memory/features/invariante-pago-abaixo-do-bruto.md` — regra, tolerância e referência aceite
- `.lovable/memory/features/invariant-monitor.md` — motor das vigias e referências
- `.lovable/memory/features/payment-account-ownership.md` — as 526 liquidadas sem conta nem pagamento (sem backfill)
- `.lovable/memory/features/payment-amount-invariants.md` — soma de pagamentos e `paid_amount` nunca excedem o bruto
- `.lovable/memory/features/card-sessions.md` — modelo D17 e sessões de cartão
- `.lovable/memory/features/supplier-lifecycle.md` — fornecedores parecidos (D-ERP199/D-ERP201)
- `.lovable/memory/features/camarim-integration-flow.md` — fecho e integração das sessões de camarim
- `docs/DECISIONS.md` — D-ERP198 (#285), D-ERP199, D-ERP200, D-ERP201
