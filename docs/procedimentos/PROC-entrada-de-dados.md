# PROCEDIMENTO — Entrada de dados (faturas e lançamentos)

Chat dono: **10 · Entrada de Dados** (D-ERP285). Lê-se no arranque, antes de lançar o que quer que seja.

## Regra zero

- **Antes de lançar qualquer dado, ler `.lovable/memory/features/data-entry-automatisms.md`** (#410): o que a base cria, altera ou apaga sozinha e as guardas que recusam. Lançar à mão a "outra metade" de um automatismo gera duplicados.

Antes de lançar qualquer documento, ler o ficheiro de `.lovable/memory/features/` do fluxo em causa e **nomeá-lo na resposta**. A hipótese por defeito é que o fluxo já existe.

Caso real, 21/10/2026: três faturas do TikTok foram lançadas à mão como transações porque ninguém leu `features/ads-invoices.md`, que tem fluxo próprio para elas desde 11/10 (D-ERP248). Foram removidas pelo `delete_transaction_cascade` e refeitas pelo ecrã certo.

## Passo 1 — Que documento é isto?

| Documento | Caminho | Ler antes |
|---|---|---|
| Fatura de plataforma de anúncios (Meta, Google, TikTok) | ecrã **Faturas Ads** `/faturas-plataformas`, três fases com `dry_run`. **Nunca** transação à mão. | `features/ads-invoices.md` |
| Fatura em nome da MP paga por fora das contas da empresa (cartão pessoal do sócio) | **Fatura Avulsa**, com `paid_by_partner_id` | `features/standalone-invoices.md` |
| Fatura paga por uma conta da empresa | **Transação**, com conta e pagamento | `features/payment-account-ownership.md` |
| Despesa de evento | Transação ligada à linha de BP (`forecast_id`) — D1/D8 | `features/transactions-bp-linkage.md` |
| Recibo, comprovativo, nota — não é fatura | **Anexo** numa transação existente; não cria lançamento próprio | `features/transaction-documents.md` |

O que decide entre Fatura Avulsa e transação é **quem pagou**, não o fornecedor: conta da empresa → transação; conta pessoal do sócio → avulsa. Regra fixada pelo Pedro a 21/10/2026 a propósito da TAP.

## Passo 2 — O documento serve?

- Tem de estar em nome de **Mundo Propício Unipessoal Lda, NIF PT515274291**. Sem isso não se lança: devolve-se ao Pedro para corrigir o perfil no fornecedor. Casos vivos a 21/10/2026: Anthropic (#255), browserless.io, Jon Loomer.
- **Ter documento não é ter fatura.** Um comprovativo de pagamento não substitui a fatura (lição da #134).

**Nomes de Entidades em CAIXA ALTA.** No cadastro de Entidades do ERP o nome da entidade escreve-se em caixa alta: 312 dos 320 fornecedores activos da MP seguem essa convenção (consulta de 28/10/2026). Antes de criar uma entidade nova, procurar duplicados; o nome vai em caixa alta, a morada, o NIF e as notas em escrita normal.

## Passo 3 — Duplicados, sempre antes de inserir

- Procurar o mesmo documento por fornecedor + número **nos dois sítios**: `transactions.invoice_ref` e `standalone_invoices.invoice_number`. O mesmo papel pode já ter entrado pelo outro caminho.
- Ler `features/transaction-duplicate-warning.md`.
- Por limpar a 21/10/2026: Resend `R4CDJOQ9-0001`, 21/09, duas linhas de 20 € em Faturas Avulsas.

## Passo 4 — Valores

- **Vale o valor que o documento traz.** Se o recibo diz o euro cobrado, é esse.
- Só quando o documento não dá euros é que se converte: BCE à data da fatura, de `public.fx_rates_daily` (`rate_to_eur`; respeitar `date_used`, que em fim-de-semana aponta ao último dia útil). Gravar `currency`, `original_amount`, `fx_rate` e `fx_rate_source`.
- Nunca inventar taxa, nunca usar a de hoje para uma fatura de ontem.
- IVA: a taxa da fatura, inteira. Autoliquidação ou OSS → IVA 0, com o motivo nas notas. Nunca dividir com `/100` inteiro (D-ERP198).

## Passo 5 — O anexo

- **Sem ficheiro não há Fatura Avulsa:** `storage_path` e `file_name` são NOT NULL.
- O anexo entra **pelos ecrãs da plataforma**, que fazem o upload. Não há caminho por SQL, e isto **nunca** se resolve pondo uma credencial no chat.
- Para anexar a uma transação que já existe: edge `ingest-transaction-document` (só service_role; `conteudo_base64` ou `origem` de Google Drive; alvo `{transaction_id}`, `{invoice_group_id}` ou `{supplier_id, invoice_ref}`).
- Remover anexos exige permissão própria (#338).

## Passo 6 — Fecho

- Conferir em Live, por query própria, o que ficou lançado — o relatório de quem executou não é prova.
- **Os emails que serviram de fonte não se apagam.** Arquivam-se, e só depois de o anexo estar na plataforma e conferido.

**As duas etiquetas do Gmail.** Os emails com fatura saem da caixa de entrada por filtro para `Faturas/A lançar` (laranja); depois de lançados no ERP passam para `Faturas/Lançadas` (verde). **Nada se apaga:** o email de origem arquiva-se, nunca vai para o lixo. Cada varredura regista a data e o que ficou por lançar em `docs/estado/estado-financeiro-e-tesouraria.md`.
