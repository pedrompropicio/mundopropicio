# Exportação SEPA Santander a partir de listas de pagamento

Fase 1 (implementada). Gera um ficheiro XML ISO 20022 **pain.001.001.09**
(formato Santander C2PSP 06.01) a partir de uma `payment_lists`, para upload
no NetBanco Empresas (Santander PT).

## Onde está

| Peça | Ficheiro |
|---|---|
| Gerador + validador IBAN + sanitizador SEPA (puro) | `src/lib/sepa/pain001.ts` |
| Modal de pré-validação | `src/components/SepaExportModal.tsx` |
| Botão "Ficheiro Santander" no detalhe da lista | `src/components/PaymentListsTab.tsx` |
| Compactação de descritivos (LLM) | `supabase/functions/sepa-compact-descriptions/index.ts` |

Sem migrations, sem alterações de RLS. O schema é partilhado com o portal público.

## Itens exportados

- `payment_list_items` com `removed_at IS NULL`.
- Valor = **valor em aberto líquido**, calculado com a mesma convenção do fluxo
  de liquidação em lote: `computeNetPayable({ grossWithIva, declaredWithholding,
  hasInstallments })` menos `paid_amount`. Retenção IRS declarada é descontada
  (o fornecedor recebe o líquido); transações com parcelas não aplicam retenção.
- Itens com valor em aberto ≤ 0, já `paid` ou `manually_marked_paid` ficam na
  secção "Excluídos" com o motivo.
- Só EUR (o ficheiro é `Ccy="EUR"` e `SvcLvl/Cd=SEPA`).

## Resolução do IBAN e do beneficiário

Por esta ordem:

1. `transactions.iban_override` → beneficiário = nome do fornecedor.
2. **Reembolsos** (`transactions.is_reimbursement`): o dinheiro vai para quem é
   reembolsado, nunca para o fornecedor da despesa original. A query da lista já
   enriquece a transação a partir de `reimbursement_notes` ligada por
   `payment_transaction_id`: `payment_iban` (ou IBAN do supplier da nota) é
   injetado em `iban_override`, e o nome vem de `employee_name`/supplier da nota.
3. `suppliers.iban` → `iban_2` → `iban_3`.

Validação de cada IBAN: **mod-97 + comprimento por país** (`src/lib/iban.ts`) e
restrição à zona SEPA (`SEPA_COUNTRIES`). Motivos de exclusão possíveis:
`Sem IBAN`, `IBAN inválido`, `IBAN fora da zona SEPA` (ex.: BR),
`Sem valor em aberto`.

## Conta ordenante e data

- Seletor com `financial_accounts` ativas cujo IBAN normalizado começa por `PT`.
  Default: `PT50001800034889774802033` (Conta Advance) se existir.
- Nome do ordenante (`InitgPty/Dbtr`) = `legal_name` da empresa ativa.
- `ReqdExctnDt` = `payment_lists.payment_date`; se cair em fim de semana ou no
  passado, avança para o próximo dia útil (mostrado no modal). Feriados não são
  tratados — o banco reagenda.

## Estado da lista

Qualquer estado pode exportar. Se **não** for `approved`/`partially_approved`,
o modal mostra aviso destacado "Lista ainda não aprovada — ficheiro de teste" e
o nome do ficheiro leva sufixo `_TESTE`.

Nome do ficheiro: `transferencias_<titulo-slug>_<yyyymmdd>.xml` (+ `_TESTE`).
Download por Blob no browser.

## Compactação do descritivo (RmtInf/Ustrd)

Limite rígido **140** chars, alvo **70** (é o que o beneficiário vê no extrato).

1. **Determinística (síncrona)** — `compactDescriptionDeterministic`:
   trim/colapso de espaços, transliteração ASCII, charset SEPA
   (`a-z A-Z 0-9 / - ? : ( ) . , ' +` e espaço), nunca começa/acaba com `/` nem
   contém `//`; abreviações fixas: meses por extenso → numérico
   (`referente a julho de 2026` → `ref 07/2026`), `(Label EDA)`/`(EDA)` → `EDA`,
   `Envelopamento` → `Envelop.`.
2. **LLM em lote** — só para os que continuam acima de 70 chars. Uma única
   chamada à edge function `sepa-compact-descriptions` (Lovable AI,
   `google/gemini-3.6-flash`, streaming consumido no servidor). Instrução
   estrita: compactar preservando todos os números, datas, meses de referência e
   identificadores; proibido inventar/alterar dígitos.
3. **Validação programática** do resultado (`acceptCompaction`): tem de caber no
   alvo **e** ter exatamente a mesma assinatura numérica do original; senão é
   descartado. Timeout de 20 s e fallback gracioso — a exportação nunca bloqueia
   por causa do LLM; sem LLM fica a versão determinística e, no limite,
   truncagem com `...`.
4. O resultado aparece no campo **editável** do modal com contador de caracteres
   — o utilizador tem sempre a palavra final.

## Formato do ficheiro (crítico)

XML UTF-8, namespace `urn:iso:std:iso:20022:tech:xsd:pain.001.001.09`,
terminações de linha **CRLF**.

- `MsgId` = `PL-<8 chars do id da lista>-<yyyymmddHHmmss>` (máx. 35 chars);
  `PmtInfId` = `<MsgId>-P1`.
- `EndToEndId` único = `PL<seq 3 dígitos>-<8 chars do id da transação>`.
- `NbOfTxs` e `CtrlSum` batem com a soma real (o banco rejeita se divergirem);
  valores com 2 decimais e ponto decimal.
- Nome do beneficiário: ASCII, charset SEPA, máx. 70 chars.
- **Sem `CdtrAgt`** (IBAN-only). `DbtrAgt/BICFI` = `TOTAPTPL`. `ChrgBr` = `SLEV`.

## Limitações / fase 2 pendente

- Não há registo/histórico de exportações (quem exportou, quando, que ficheiro).
- Sem permissão dedicada: quem vê o detalhe da lista vê o botão.
- Sem bloqueio por estado (listas não aprovadas exportam, só marcadas `_TESTE`).
- A exportação **não** liquida nada: a liquidação pós-banco continua manual
  (Liquidar em massa ou marcar item pago).
- Feriados nacionais não são considerados na data de execução.
- Só EUR/SEPA; IBANs não-SEPA (ex.: BR) ficam de fora e pagam-se por outra via.
